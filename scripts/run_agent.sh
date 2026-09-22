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
  local prompt="You are the ValhallaAI hermes-agent. Reply with exactly two lines and then stop. Line 1: Status: OK. Line 2: one sentence naming which model provider answered. Do not use tools. Do not read or write files."
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

case "$AGENT" in
  hermes-agent) run_hermes ;;
  claude-agent|grok-agent) run_container "$AGENT" ;;
  *)
    echo "Unknown agent: ${AGENT}" >&2
    echo "Use claude-agent, hermes-agent, or grok-agent." >&2
    exit 2
    ;;
esac
