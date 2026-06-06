#!/usr/bin/env bash
# Run SQLite → Convex import for the staging T3CODE_HOME (orchestration_events).
# Requires: staging app stopped, Convex local up with staging data dir.
set -euo pipefail

WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAGING_HOME="${T3CODE_HOME:-$HOME/.local/share/t3code-local/staging}"
STAGING_WORKTREE="$WORKSPACE/t3code-staging"
DB_PATH="$STAGING_HOME/dev/state.sqlite"

export T3CODE_HOME="$STAGING_HOME"
export T3CODE_CONVEX_DATA_DIR="$STAGING_HOME/convex"

cd "$STAGING_WORKTREE"

if [[ -f "${DB_PATH}-wal" ]]; then
  echo "Checkpointing WAL on staging SQLite..." >&2
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);"
  else
    echo "Refusing: ${DB_PATH}-wal exists and sqlite3 is missing. Stop T3 Staging first." >&2
    exit 1
  fi
fi

echo "== dry-run ==" >&2
node scripts/sqlite-to-convex-migrate.ts --preset local-staging --dry-run

echo "== backup + import ==" >&2
node scripts/sqlite-to-convex-migrate.ts --preset local-staging --backup --batch-size 500

echo "== verify ==" >&2
node scripts/sqlite-to-convex-migrate.ts --preset local-staging --verify-only

echo "Staging orchestration_events migration complete." >&2
