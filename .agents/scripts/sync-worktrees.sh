#!/usr/bin/env bash
# Verify t3code (main) and t3code-staging are aligned; optionally fast-forward main from staging.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MAIN_DIR="$ROOT/t3code"
STAGING_DIR="$ROOT/t3code-staging"

APPLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    *)
      echo "Usage: $0 [--apply]" >&2
      echo "  --apply  Fast-forward main from staging when staging is ahead (fails on dirty trees)." >&2
      exit 1
      ;;
  esac
done

for dir in "$MAIN_DIR" "$STAGING_DIR"; do
  if [[ ! -e "$dir/.git" ]]; then
    echo "Missing worktree: $dir" >&2
    exit 1
  fi
done

MAIN_HEAD="$(git -C "$MAIN_DIR" rev-parse HEAD)"
STAGING_HEAD="$(git -C "$STAGING_DIR" rev-parse HEAD)"
MAIN_BRANCH="$(git -C "$MAIN_DIR" branch --show-current)"
STAGING_BRANCH="$(git -C "$STAGING_DIR" branch --show-current)"

echo "main:    $MAIN_BRANCH @ ${MAIN_HEAD:0:8}"
echo "staging: $STAGING_BRANCH @ ${STAGING_HEAD:0:8}"

if ! diff -rq "$MAIN_DIR" "$STAGING_DIR" \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=dist \
  --exclude=.turbo \
  --exclude=.convex \
  --exclude=.convex-tmp \
  --exclude=dist-electron \
  --exclude=tsconfig.tsbuildinfo \
  --exclude='.convex.worktree-backup*' >/tmp/t3-sync-worktrees.diff 2>&1; then
  echo "Working tree diff (excluding build artifacts):" >&2
  cat /tmp/t3-sync-worktrees.diff >&2
  echo >&2
  echo "Commit or discard local edits in both worktrees before syncing." >&2
  exit 1
fi

echo "Working trees: identical (ignoring build artifacts)"

if [[ "$MAIN_HEAD" == "$STAGING_HEAD" ]]; then
  echo "Branches: aligned"
  exit 0
fi

if git -C "$MAIN_DIR" merge-base --is-ancestor "$MAIN_HEAD" "$STAGING_HEAD"; then
  BEHIND="$(git -C "$MAIN_DIR" rev-list --count "$MAIN_HEAD..$STAGING_HEAD")"
  echo "main is $BEHIND commit(s) behind staging"
  if [[ "$APPLY" -eq 1 ]]; then
    if [[ -n "$(git -C "$MAIN_DIR" status --porcelain)" ]]; then
      echo "Refusing --apply: main worktree has uncommitted changes." >&2
      exit 1
    fi
    git -C "$MAIN_DIR" merge --ff-only staging
    echo "main fast-forwarded to staging ($(git -C "$MAIN_DIR" rev-parse --short HEAD))"
    exit 0
  fi
  echo "Run: $0 --apply" >&2
  exit 1
fi

if git -C "$STAGING_DIR" merge-base --is-ancestor "$STAGING_HEAD" "$MAIN_HEAD"; then
  AHEAD="$(git -C "$STAGING_DIR" rev-list --count "$STAGING_HEAD..$MAIN_HEAD")"
  echo "staging is $AHEAD commit(s) behind main — merge main into staging in t3code-staging/." >&2
  exit 1
fi

echo "Branches have diverged; merge manually in t3code-staging/ then re-run this script." >&2
exit 1
