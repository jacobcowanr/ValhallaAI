#!/bin/sh
# Vault relay — implements what ARCHITECTURE.md §6 describes:
#   1. Pull the latest vault state.
#   2. Fold each agent's AGENT_OUTBOX_<name>.md into AGENT_SYNC.md
#      (sequential, one file at a time — this is what keeps concurrent
#      agent writes from becoming git merge conflicts on a shared file).
#   3. Clear the outbox file once folded.
#   4. Commit and push if anything changed.
#   5. Sleep and repeat.
#
# Previously this container only ran `git pull` in a loop and never
# committed or pushed anything — found by a 2026-09-21 verification pass.
# This is the fix.

set -eu

VAULT_DIR="${VAULT_DIR:-/vault}"
SYNC_LOG="$VAULT_DIR/AGENT_SYNC.md"
INTERVAL="${RELAY_INTERVAL:-300}"

cd "$VAULT_DIR"

relay_once() {
  # Pull first so we fold onto the latest state, not a stale local copy.
  if [ -n "${VAULT_REPO:-}" ]; then
    git pull --ff-only || echo "[relay] pull failed or diverged — skipping this cycle" >&2
  fi

  changed=0

  for outbox in "$VAULT_DIR"/AGENT_OUTBOX_*.md; do
    [ -e "$outbox" ] || continue # no matches — glob didn't expand

    if [ -s "$outbox" ]; then
      agent_name=$(basename "$outbox" .md | sed 's/^AGENT_OUTBOX_//')
      {
        echo "---"
        echo "## [$(date -u +%Y-%m-%dT%H:%M:%SZ)] $agent_name (via relay)"
        cat "$outbox"
      } >> "$SYNC_LOG"

      : > "$outbox" # clear the outbox now that it's folded in
      changed=1
      echo "[relay] folded $outbox into AGENT_SYNC.md"
    fi
  done

  if [ "$changed" = "1" ]; then
    git add -A
    git commit -m "relay: fold agent outbox entries into AGENT_SYNC.md"
    if [ -n "${VAULT_REPO:-}" ]; then
      git push
      echo "[relay] pushed"
    fi
  fi
}

while true; do
  relay_once
  sleep "$INTERVAL"
done
