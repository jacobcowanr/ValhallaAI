#!/bin/bash
# Run one ValhallaAI agent once and append its outbox.
# hermes-agent uses the Hermes CLI already installed on the host.
# claude-agent and grok-agent are one-shot Docker containers.
# Usage: scripts/run_agent.sh <claude-agent|hermes-agent|grok-agent>

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VAULT="$ROOT/vault"
AGENT="${1:-}"

redact() {
  sed -E \
    -e '/python-dotenv could not parse/d' \
    -e 's/(sk-|xai-|ghp_|github_pat_|sk-ant-)[A-Za-z0-9_-]{6,}/[redacted]/g'
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
  if [ "$service" = "grok-agent" ]; then
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
    env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL \
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
  # text too, or the outbox records a failure with no reason.
  if [ "$status" -eq 0 ]; then
    body="$out_text"
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
  grok-agent) run_container "grok-agent" ;;
  *)
    echo "Unknown agent: ${AGENT}" >&2
    echo "Use claude-agent, hermes-agent, or grok-agent." >&2
    exit 2
    ;;
esac
