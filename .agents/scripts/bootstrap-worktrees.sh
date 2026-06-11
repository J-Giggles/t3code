#!/usr/bin/env bash
# Clone J-Giggles/t3code and attach main + staging worktrees for this workspace layout.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

T3_REPO="${T3CODE_REPO:-git@github.com:J-Giggles/t3code.git}"
T3_UPSTREAM="${T3CODE_UPSTREAM:-git@github.com:pingdotgg/t3code.git}"

MAIN_DIR="$ROOT/t3code"
STAGING_DIR="$ROOT/t3code-staging"

echo "Workspace root: $ROOT"
echo "T3 Code repo:   $T3_REPO"

if [[ ! -d "$MAIN_DIR/.git" && -d "$MAIN_DIR" ]]; then
  echo "Refusing to clone: $MAIN_DIR exists but is not a git checkout." >&2
  exit 1
fi

if [[ ! -d "$MAIN_DIR/.git" ]]; then
  echo "Cloning primary worktree into t3code/ ..."
  git clone "$T3_REPO" "$MAIN_DIR"
fi

cd "$MAIN_DIR"

if git remote get-url upstream >/dev/null 2>&1; then
  git remote set-url upstream "$T3_UPSTREAM"
else
  git remote add upstream "$T3_UPSTREAM"
fi

echo "Fetching origin and upstream ..."
git fetch origin --prune
git fetch upstream --prune || true

if [[ ! -d "$STAGING_DIR" ]]; then
  echo "Adding staging worktree at t3code-staging/ ..."
  if git show-ref --verify --quiet refs/heads/staging; then
    git worktree add "$STAGING_DIR" staging
  elif git show-ref --verify --quiet refs/remotes/origin/staging; then
    git worktree add -b staging "$STAGING_DIR" origin/staging
  else
    echo "No local or origin/staging branch; creating staging from main." >&2
    git worktree add -b staging "$STAGING_DIR" main
  fi
else
  echo "Staging worktree already present: $STAGING_DIR"
fi

cat <<EOF

Worktrees ready:
  main:    $MAIN_DIR ($(git -C "$MAIN_DIR" branch --show-current))
  staging: $STAGING_DIR ($(git -C "$STAGING_DIR" branch --show-current))

Next steps:
  cd "$STAGING_DIR" && bun install
  cd "$STAGING_DIR" && pnpm run install:local-launchers
  cd "$ROOT" && pnpm run start:dev

EOF
