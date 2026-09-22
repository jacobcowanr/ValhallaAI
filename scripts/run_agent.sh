#!/bin/bash
# Run one ValhallaAI agent once and append its outbox.
# hermes-agent uses the Hermes CLI already installed on the host.
# claude-agent and grok-build both prefer a host CLI on a subscription login
# and fall back to their one-shot Docker container on the paid key.
# Usage: scripts/run_agent.sh <claude-agent|hermes-agent|grok-build>

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="$ROOT/vault"
AGENT="${1:-}"

# The desktop app does not inherit a login shell's PATH.
#
# Tauri launches this script via `bash script arg`, which is not a login shell,
# so it gets the GUI's minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin). Every CLI
# this runner depends on lives outside that: grok in ~/.grok/bin, docker in
# /usr/local/bin or /opt/homebrew/bin, hermes and claude in ~/.local/bin. A
# terminal run finds them because the shell already sourced them; a Run click
# does not.
#
# The consequence is worse than a missing command. grok_subscription_available
# uses `command -v grok`, so a missing grok reads as "no subscription" and the
# runner falls through to the paid Docker path -- which then fails too, with
# "docker: command not found". A subscription that exists looks like a billing
# failure. Seen 2026-09-22: a terminal run wrote OK (subscription), and the
# same script from the app wrote ERROR (paid-key) / docker: command not found.
#
# Two sources, because neither is complete on its own:
#   path_helper  -- system paths (/usr/local/bin, Homebrew). This is what a
#                   login shell runs, but it does not know about user bins.
#   the prepend  -- the user-level install locations the CLIs actually use.
# Prepending means a user install wins over a stale system one.
if [ -x /usr/libexec/path_helper ]; then
  eval "$(/usr/libexec/path_helper -s)"
fi
export PATH="$HOME/.grok/bin:$HOME/.local/bin:$HOME/.hermes/bin:$HOME/.orbstack/bin:$PATH"

redact() {
  sed -E \
    -e '/python-dotenv could not parse/d' \
    -e '/Terminated: (15|9) /d' \
    -e 's/(sk-|xai-|ghp_|github_pat_|sk-ant-)[A-Za-z0-9_-]{6,}/[redacted]/g'
}

# Hard time limit for a host CLI, overridable for a slow machine or a long task.
AGENT_TIMEOUT_SECS="${AGENT_TIMEOUT_SECS:-900}"

# Run a command with a time limit, then report 143 if it had to be killed.
#
# macOS ships no `timeout` binary -- that is GNU coreutils -- so this is the
# portable equivalent. It matters because a host CLI can wait on something that
# will never arrive: a tool-approval prompt with no TTY attached, or a stalled
# socket read. Unbounded, that leaves a Run click spinning with no end.
#
# SIGTERM, then SIGKILL after a grace period, so a CLI mid-write gets a chance
# to flush what it has before it is torn down.
run_with_timeout() {
  local secs="$1"; shift
  "$@" &
  local cmd_pid=$!
  (
    sleep "$secs"
    kill -TERM "$cmd_pid" 2>/dev/null
    sleep 5
    kill -KILL "$cmd_pid" 2>/dev/null
  ) &
  local watchdog=$!
  wait "$cmd_pid"
  local status=$?
  # Stop the watchdog so it cannot fire against a recycled PID later.
  kill -TERM "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null
  return "$status"
}

# A killed CLI exits 128+signal: 143 = SIGTERM, 137 = SIGKILL. Both mean the
# time limit was reached rather than the agent failing on its own.
timed_out_note() {
  case "$1" in
    143) printf '%s' "Timed out after ${AGENT_TIMEOUT_SECS}s (SIGTERM). Set AGENT_TIMEOUT_SECS to raise the limit." ;;
    137) printf '%s' "Timed out after ${AGENT_TIMEOUT_SECS}s (SIGKILL). Set AGENT_TIMEOUT_SECS to raise the limit." ;;
    *)   printf '%s' "" ;;
  esac
}

write_outbox() {
  local file="$1"
  local status="$2"
  local body="$3"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  {
    echo "## [${ts}] ${AGENT}"
    echo "- Status: ${status}"
    echo "- Response: ${body}"
    echo ""
  } >> "$file"
}

run_hermes() {
  local out="$VAULT/AGENT_OUTBOX_hermes-agent.md"
  # Task comes from vault/agent-tasks.json, built through the same module the
  # container agents use -- so the vault-path guard lives in one place rather
  # than being reimplemented in bash. This runner is on the HOST, where a
  # "../.env" in a context list would read a real secret, so that guard matters
  # more here than it does inside a container with only /vault mounted.
  local prompt
  prompt="$(node "$ROOT/agents/_shared/task.cjs" "$VAULT" hermes-agent 2>/dev/null)"
  if [ -z "$prompt" ]; then
    # No task defined: fall back to the status ping so this stays usable as a
    # plain connectivity check.
    prompt="You are the ValhallaAI hermes-agent. Reply with exactly two lines and then stop. Line 1: Status: OK. Line 2: one sentence naming which model provider answered. Do not use tools. Do not read or write files."
  fi
  local raw status
  raw="$(
    cd /tmp && python3 - "$prompt" << 'PY'
import subprocess, sys
prompt = sys.argv[1]
try:
    proc = subprocess.run(
        ["hermes", "chat", "-q", prompt, "--oneshot", "--max-turns", "1", "--safe-mode", "-Q", "--run-budget", "60"],
        capture_output=True, text=True, timeout=90,
    )
except subprocess.TimeoutExpired as exc:
    sys.stdout.write((exc.stdout or "") + (exc.stderr or ""))
    sys.stdout.write("\nTimed out after 90s\n")
    sys.exit(124)
sys.stdout.write(proc.stdout or "")
sys.stdout.write(proc.stderr or "")
sys.exit(proc.returncode)
PY
  )"
  status=$?
  raw="$(printf '%s\n' "$raw" | redact)"
  # Collapse to one line so the outbox stays a single entry.
  local flat
  flat="$(printf '%s' "$raw" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c1-2000)"
  if [ "$status" -eq 0 ]; then
    write_outbox "$out" "OK" "$flat"
  else
    write_outbox "$out" "ERROR" "$flat"
  fi
  printf '%s\n' "$raw"
  return "$status"
}

run_container() {
  local service="$1"
  local compose=(docker compose --project-directory "$ROOT" -f "$ROOT/docker-compose.local.yml")
  if [ "$service" = "grok-build" ]; then
    compose+=(--profile optional)
  fi
  "${compose[@]}" run --rm --no-deps "$service"
}

# Is the Claude CLI logged in on a subscription?
#
# `claude auth status` is the only reliable signal, and it is checked with the
# paid key stripped from the environment so that "yes" actually means the
# subscription is what will answer. Without the strip, a machine with both a
# login and a key set could report loggedIn for a session that still bills.
claude_subscription_available() {
  command -v claude >/dev/null 2>&1 || return 1
  local status
  status="$(env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL \
    -u ANTHROPIC_FOUNDRY_API_KEY -u CLAUDE_CODE_USE_BEDROCK -u CLAUDE_CODE_USE_VERTEX \
    -u CLAUDE_CODE_USE_FOUNDRY claude auth status 2>/dev/null)" || return 1
  printf '%s' "$status" | grep -q '"loggedIn": *true'
}

# Claude agent: SUBSCRIPTION FIRST, paid API key only as the fallback.
#
# `claude auth login` (Pro/Max) has no per-token cost; ANTHROPIC_API_KEY bills
# every token. The same preference already governs Models & Chat, where
# Claude Subscription DirectSDK is the default provider. Agent Control used to
# always run the Docker container, which always bills the paid key, so the
# agent path silently cost money the chat path did not. This makes the two
# agree.
#
# Fallback is deliberate, not a failure: a machine with no subscription login
# still works, it just bills the key — and the outbox records which path ran,
# so the cost is visible afterwards rather than implied.
run_claude() {
  local out="$VAULT/AGENT_OUTBOX_claude-agent.md"
  local prompt
  prompt="$(node "$ROOT/agents/_shared/task.cjs" "$VAULT" claude-agent 2>/dev/null)"
  if [ -z "$prompt" ]; then
    prompt="You are the ValhallaAI claude-agent. Reply with exactly two lines and then stop. Line 1: Status: OK. Line 2: one sentence naming which model provider answered. Do not use tools. Do not read or write files."
  fi

  local status billing body out_text err_text
  if claude_subscription_available; then
    billing="subscription"
    # stdout and stderr are kept APART until the outcome is known.
    #
    # The claude CLI emits its own hook diagnostics on stderr, and those are
    # noise, not the agent's answer. Capturing `2>&1` here meant a successful
    # run recorded a node MODULE_NOT_FOUND stack trace into the outbox as if
    # the agent had said it (seen in a real run on 2026-09-22). But dropping
    # stderr outright would lose the error text on a failure, which is the one
    # case where it matters. So: stdout on success, both on failure.
    local tmp_out tmp_err
    tmp_out="$(mktemp)"
    tmp_err="$(mktemp)"
    run_with_timeout "$AGENT_TIMEOUT_SECS" env \
      -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL \
      -u ANTHROPIC_FOUNDRY_API_KEY -u CLAUDE_CODE_USE_BEDROCK -u CLAUDE_CODE_USE_VERTEX \
      -u CLAUDE_CODE_USE_FOUNDRY CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
      claude -p "$prompt" >"$tmp_out" 2>"$tmp_err"
    status=$?
    out_text="$(cat "$tmp_out")"
    err_text="$(cat "$tmp_err")"
    rm -f "$tmp_out" "$tmp_err"
  else
    # No subscription login (or no CLI). The container is the paid path.
    billing="paid-key"
    out_text="$(run_container claude-agent 2>&1)"
    status=$?
    err_text=""
  fi

  # On success the agent's answer is stdout alone. On failure, keep the error
  # text too, or the outbox records a failure with no reason. A killed CLI
  # reports 143/137, which is a time limit rather than the agent failing, so
  # that is named explicitly instead of being left to look like an error.
  local note
  note="$(timed_out_note "$status")"
  if [ "$status" -eq 0 ]; then
    body="$out_text"
  elif [ -n "$note" ]; then
    body="${note}
${out_text}
${err_text}"
  else
    body="${out_text}
${err_text}"
  fi

  body="$(printf '%s\n' "$body" | redact)"
  local flat
  flat="$(printf '%s' "$body" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c1-2000)"
  if [ "$status" -eq 0 ]; then
    write_outbox "$out" "OK (${billing})" "$flat"
  else
    write_outbox "$out" "ERROR (${billing})" "$flat"
  fi
  printf '%s\n' "$body"
  return "$status"
}

# Is the Grok Build CLI logged in on a subscription?
#
# `grok models` is the signal: it prints "You are logged in with grok.com."
# when a login is present, and it is run with XAI_API_KEY stripped so that a
# "yes" means the subscription is what will answer. Verified 2026-09-22 --
# with no XAI_API_KEY set at all, `grok -p "..."` answered "Grok 4.7 answered
# this.", so the login alone is sufficient.
grok_subscription_available() {
  command -v grok >/dev/null 2>&1 || return 1
  env -u XAI_API_KEY grok models 2>/dev/null | grep -qi "logged in"
}

# Grok Build agent: SUBSCRIPTION FIRST, paid API key only as the fallback.
#
# This reverses an earlier claim in this project's own docs, which said xAI
# had no subscription login and that grok-agent was "token-billed by nature".
# That was true of the raw api.x.ai endpoint, and false of the Grok Build CLI
# (`grok`, installed at ~/.grok/bin/grok): it signs in against auth.x.ai and
# `grok -p` then runs single-turn prompts with no key involved. The container
# remains the fallback for a machine with no login.
#
# Why this matters here specifically: the Grok Build CLI is the same agent
# Jacob already uses elsewhere, so an agent run now bills the subscription he
# is paying for rather than a key that was never set.
run_grok() {
  local out="$VAULT/AGENT_OUTBOX_grok-build.md"
  local prompt
  prompt="$(node "$ROOT/agents/_shared/task.cjs" "$VAULT" grok-build 2>/dev/null)"
  if [ -z "$prompt" ]; then
    prompt="You are the ValhallaAI grok-build agent. Reply with exactly two lines and then stop. Line 1: Status: OK. Line 2: one sentence naming which model answered. Do not use tools. Do not read or write files."
  fi

  local status billing body out_text err_text
  if grok_subscription_available; then
    billing="subscription"
    # Same stdout/stderr split as run_claude, for the same reason: on success
    # the agent's answer is stdout, and a CLI's own diagnostics on stderr must
    # not be recorded as if the agent had said them.
    local tmp_out tmp_err
    tmp_out="$(mktemp)"
    tmp_err="$(mktemp)"
    run_with_timeout "$AGENT_TIMEOUT_SECS" env -u XAI_API_KEY grok -p "$prompt" >"$tmp_out" 2>"$tmp_err"
    status=$?
    out_text="$(cat "$tmp_out")"
    err_text="$(cat "$tmp_err")"
    rm -f "$tmp_out" "$tmp_err"
  else
    # No subscription login (or no CLI). The container is the paid path.
    billing="paid-key"
    out_text="$(run_container grok-build 2>&1)"
    status=$?
    err_text=""
  fi

  local note
  note="$(timed_out_note "$status")"
  if [ "$status" -eq 0 ]; then
    body="$out_text"
  elif [ -n "$note" ]; then
    body="${note}
${out_text}
${err_text}"
  else
    body="${out_text}
${err_text}"
  fi

  body="$(printf '%s\n' "$body" | redact)"
  local flat
  flat="$(printf '%s' "$body" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g' | cut -c1-2000)"
  if [ "$status" -eq 0 ]; then
    write_outbox "$out" "OK (${billing})" "$flat"
  else
    write_outbox "$out" "ERROR (${billing})" "$flat"
  fi
  printf '%s\n' "$body"
  return "$status"
}

case "$AGENT" in
  hermes-agent) run_hermes ;;
  claude-agent) run_claude ;;
  grok-build) run_grok ;;
  *)
    echo "Unknown agent: ${AGENT}" >&2
    echo "Use claude-agent, hermes-agent, or grok-build." >&2
    exit 2
    ;;
esac
