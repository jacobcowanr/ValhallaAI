#!/bin/sh
# Vault relay — implements what ARCHITECTURE.md §6 describes:
#   1. Pull the latest repo state.
#   2. Fold each agent's AGENT_OUTBOX_<name>.md into AGENT_SYNC.md
#      (sequential, one file at a time — this is what keeps concurrent
#      agent writes from becoming git merge conflicts on a shared file).
#   3. Clear the outbox file once folded.
#   4. Commit (scoped to vault/ only) and push if anything changed.
#   5. Sleep and repeat.
#
# v1 (2026-09-21) only ran `git pull` and never committed or pushed —
# found by a verification pass. v2 (this version, same day) fixed that but
# assumed `vault/` was its own git repo with its own remote; it isn't —
# `vault/` is a tracked subfolder of the ValhallaAI app repo, same as
# everywhere else this project has actually been using git all session.
# A second verification pass caught the mismatch: no git binary in the
# alpine:latest image, no .git inside vault/, unguarded `set -eu` around
# git commands that would fail immediately, no committer identity set.
# v3 (this version) mounts the whole repo (not just vault/) so `.git`
# actually exists, sets identity explicitly instead of relying on env
# vars that may not be passed through, and handles each git step's
# failure explicitly instead of letting `set -e` crash-loop the container.

REPO_DIR="${REPO_DIR:-/repo}"
VAULT_DIR="$REPO_DIR/vault"
SYNC_LOG="$VAULT_DIR/AGENT_SYNC.md"
INTERVAL="${RELAY_INTERVAL:-300}"

if ! command -v git >/dev/null 2>&1; then
  echo "[relay] FATAL: git is not installed in this image. See scripts/vault_relay.Dockerfile." >&2
  exit 1
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[relay] FATAL: $REPO_DIR is not a git repo (no .git). Check the compose volume mount." >&2
  exit 1
fi

cd "$REPO_DIR" || exit 1

git config user.name "${GIT_AUTHOR_NAME:-ValhallaAI Relay}"
git config user.email "${GIT_AUTHOR_EMAIL:-valhallaai-relay@local}"

relay_once() {
  # Pull first so we fold onto the latest state, not a stale local copy.
  # A failed pull is logged and the cycle continues on the local copy
  # rather than aborting the whole container.
  if [ -n "${VAULT_REPO:-}" ]; then
    if ! git pull --ff-only 2>&1; then
      echo "[relay] pull failed or diverged — continuing this cycle on the local copy" >&2
    fi
  fi

  changed=0

  for outbox in "$VAULT_DIR"/AGENT_OUTBOX_*.md; do
    [ -e "$outbox" ] || continue # glob didn't match anything

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
    # Scoped to vault/ deliberately — this container should never commit
    # unrelated app-code changes that happen to be sitting in the working
    # tree it shares a mount with.
    if ! git add "vault/"; then
      echo "[relay] git add failed — leaving outbox state as-is for the next cycle" >&2
      return
    fi
    if ! git commit -m "relay: fold agent outbox entries into AGENT_SYNC.md"; then
      echo "[relay] git commit failed (e.g. nothing staged, or identity misconfigured) — skipping push" >&2
      return
    fi
    if [ -n "${VAULT_REPO:-}" ]; then
      if git push; then
        echo "[relay] pushed"
      else
        echo "[relay] push failed — commit is local, will retry pushing on the next successful pull/cycle" >&2
      fi
    fi
  fi
}

while true; do
  relay_once
  sleep "$INTERVAL"
done
