#!/usr/bin/env bash
# secret-scan.sh — refuse to let a real credential value into this repository.
#
# WHAT THIS IS FOR: this repo is meant to go public. A key that reaches a public
# commit is burned the moment it lands, and rewriting history afterwards does not
# un-leak it. This gate exists to make that impossible to do by accident.
#
# HOW IT DIFFERS FROM THE VAULT'S SCANNER (deliberately): the vault's
# scripts/secret_scan.sh guards a coordination log, so it flags IPv4 addresses
# and any `KEY=value` assignment. Neither rule survives contact with this repo —
# `http://127.0.0.1/callback` is documented on purpose (GitHub's OAuth callback
# has no port) and `env.example` is built out of empty `NAME=` lines. A scanner
# that fails on every run gets disabled within a week, which is worse than not
# having one. So this matches *credential values* — provider key shapes, private
# key blocks, JWTs — and nothing else.
#
# NEVER PRINTS THE SECRET. A hit is reported as file, line, rule name and a
# redacted form (first 4 characters and the length). Echoing the match into a CI
# log would publish the key to anyone who can read the log, converting one leak
# into two. Do not "improve" this by printing the match.
#
# USAGE:  scripts/secret-scan.sh [dir]      # default: this repo (tracked files)
#         scripts/secret-scan.sh --staged   # only what is in the index
# EXIT:   0 clean · 1 a secret shape was found · 2 usage/IO error
set -uo pipefail

MODE="tree"
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --staged) MODE="staged" ;;
    --history) MODE="history" ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) TARGET="$arg" ;;
  esac
done

cd "${TARGET:-$(pwd)}" || { echo "cannot cd to ${TARGET}" >&2; exit 2; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "secret-scan: not a git repository — this scanner reads tracked files only." >&2
  exit 2
}

# Provider credential shapes that are recognisable without knowing the value.
# Each entry: NAME<TAB>EXTENDED-REGEX. Adding a provider means adding a line.
read -r -d '' RULES <<'RULES_EOF'
anthropic-key	sk-ant-[A-Za-z0-9_-]{20,}
openai-key	sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{20,}
openai-legacy	sk-[A-Za-z0-9]{40,}
openrouter-key	sk-or-v1-[a-f0-9]{32,}
google-api-key	AIza[0-9A-Za-z_-]{35}
google-client-secret	GOCSPX-[A-Za-z0-9_-]{20,}
groq-key	gsk_[A-Za-z0-9]{40,}
xai-key	xai-[A-Za-z0-9]{40,}
github-token	gh[pousr]_[A-Za-z0-9]{36,}
github-pat	github_pat_[A-Za-z0-9_]{50,}
perplexity-key	pplx-[A-Za-z0-9]{30,}
fireworks-key	fw_[A-Za-z0-9]{30,}
huggingface-token	hf_[A-Za-z0-9]{30,}
replicate-token	r8_[A-Za-z0-9]{30,}
aws-access-key	(AKIA|ASIA)[0-9A-Z]{16}
private-key-block	-----BEGIN [A-Z ]*PRIVATE KEY-----
jwt	eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.
RULES_EOF

fail=0
hit_count=0

report_hit() {
  local file="$1" line="$2" rule="$3" match="$4"
  local shown="${match:0:4}"
  hit_count=$((hit_count + 1))
  printf '  %s:%s  [%s]  %s…[redacted, %s chars]\n' "$file" "$line" "$rule" "$shown" "${#match}"
}

# --- 1. Files whose NAME says they hold secrets must never be tracked --------
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "REFUSED: .env is tracked by git. It must stay ignored." >&2
  fail=1
fi

# --- 2. Value-shaped credentials in the tracked tree ------------------------
while IFS=$'\t' read -r rule regex; do
  [ -n "$rule" ] || continue
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    # -H forces the "file:" prefix. Without it grep omits the filename when
    # given a single file operand, so the output is "LINE:MATCH" and a parser
    # expecting "FILE:LINE:MATCH" silently drops every hit — which is exactly
    # how the first version of this script reported a planted key as clean.
    # Do not remove -H. It is why the control test passes.
    while IFS=: read -r fname lineno match; do
      [ -n "$match" ] || continue
      report_hit "$fname" "$lineno" "$rule" "$match"
      fail=1
    done < <(grep -HInEo "$regex" "$file" 2>/dev/null || true)
  done < <(git ls-files)
done < <(printf '%s\n' "$RULES")

if [ "$MODE" = "staged" ]; then
  # Same rules, restricted to added lines in the index, so the impulse to
  # bypass a failing pre-commit with --no-verify still has a backstop in CI.
  # No file/line here: this reads a diff stream, not files. The tree scan
  # above is what gives you those.
  while IFS=$'\t' read -r rule regex; do
    [ -n "$rule" ] || continue
    while IFS= read -r match; do
      [ -n "$match" ] || continue
      report_hit "(staged)" "?" "$rule" "$match"
      fail=1
    done < <(git diff --cached -U0 | grep -E '^\+' | grep -Eo "$regex" 2>/dev/null || true)
  done < <(printf '%s\n' "$RULES")
fi

if [ "$MODE" = "history" ]; then
  # Every blob ever committed, not just the current tree. A key that was
  # committed and later deleted is still in the history a public clone gets,
  # and `git rm` does not remove it. This is the check that matters in the
  # week before a repository goes public, and it is why --history exists.
  while IFS=$'\t' read -r rule regex; do
    [ -n "$rule" ] || continue
    while IFS= read -r match; do
      [ -n "$match" ] || continue
      report_hit "(git history, --all)" "?" "$rule" "$match"
      fail=1
    done < <(git log -p --all --no-color 2>/dev/null | grep -E '^\+' | grep -Eo "$regex" 2>/dev/null || true)
  done < <(printf '%s\n' "$RULES")
fi

if [ "$fail" -ne 0 ]; then
  echo >&2
  echo "REFUSED: $hit_count value(s) matching a known credential shape." >&2
  echo "If this is a real key: revoke it now — it is in the repository, and" >&2
  echo "removing the commit does not un-leak it. Then replace it with a" >&2
  echo "placeholder and put the real value in .env (which is ignored)." >&2
  echo "If it is a test fixture, rewrite it so it does not resemble a real" >&2
  echo "credential (e.g. 'sk-ant-TESTVALUE'), not by weakening this rule." >&2
  exit 1
fi

rule_count=$(printf '%s\n' "$RULES" | grep -c $'\t')
scanned="tracked files"
[ "$MODE" = "staged" ] && scanned="$scanned + staged diff"
[ "$MODE" = "history" ] && scanned="$scanned + full git history (--all)"
echo "secret-scan: clean — $scanned; $(git ls-files | wc -l | tr -d ' ') tracked files, ${rule_count} credential-shape rules, 0 hits"
exit 0