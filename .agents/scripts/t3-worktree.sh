#!/usr/bin/env bash
# Manage isolated T3 Code feature worktrees with their own Convex + Tailscale path.
#
# Usage:
#   ./.agents/scripts/t3-worktree.sh create <slug> [--from staging]
#   ./.agents/scripts/t3-worktree.sh start <slug> [--wait]
#   ./.agents/scripts/t3-worktree.sh tailscale <slug>
#   ./.agents/scripts/t3-worktree.sh probe <slug>
#   ./.agents/scripts/t3-worktree.sh pair-url <slug>
#   ./.agents/scripts/t3-worktree.sh status [slug]
#   ./.agents/scripts/t3-worktree.sh list
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export T3CODE_LOCAL_WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"
STAGING_WORKTREE="$T3CODE_LOCAL_WORKSPACE/t3code-staging"
CLI="$STAGING_WORKTREE/scripts/worktree-cli.ts"

if [[ ! -f "$CLI" ]]; then
  echo "Worktree CLI not found: $CLI (merge staging first)" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required" >&2
  exit 1
fi

exec bun "$CLI" "$@"
