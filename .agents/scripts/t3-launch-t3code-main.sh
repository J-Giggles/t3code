#!/usr/bin/env bash
# Launch t3code-main worktree with main-like Convex env (copied DB, ports 3210/3211).
# Does not touch the live t3code/ worktree.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKTREE="$WORKSPACE/t3code-main"
STAGING_WORKTREE="$WORKSPACE/t3code-staging"
MAIN_WORKTREE="$WORKSPACE/t3code"
T3_HOME="${T3CODE_HOME:-$HOME/.local/share/t3code-local/t3code-main}"
CONVEX_DATA_DIR="$WORKTREE/.local/convex"
RUNNER="$SCRIPT_DIR/t3code-main-dev-run.ts"

WAIT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wait) WAIT=1; shift ;;
    *) echo "Usage: $0 [--wait]" >&2; exit 1 ;;
  esac
done

if [[ ! -d "$WORKTREE" ]]; then
  echo "Missing worktree: $WORKTREE" >&2
  exit 1
fi

if [[ ! -d "$CONVEX_DATA_DIR/local/default" ]]; then
  echo "Missing Convex data (copy from t3code first): $CONVEX_DATA_DIR" >&2
  exit 1
fi

mkdir -p "$T3_HOME/logs"

export T3CODE_LOCAL_WORKSPACE="$WORKSPACE"
export T3CODE_HOME="$T3_HOME"
export T3CODE_APP_ROOT="$WORKTREE"
export T3CODE_PROTECTED_WRITE_ROOTS="$WORKTREE"
export T3CODE_DESKTOP_VARIANT="local-main"
export T3CODE_DEV_INSTANCE="t3code-local-main"
export T3CODE_DEV_STACK="stable"
export T3CODE_PERSISTENCE="convex"
export T3CODE_CONVEX_DATA_DIR="$CONVEX_DATA_DIR"
export CONVEX_URL="http://127.0.0.1:3210"
export CONVEX_SITE_URL="http://127.0.0.1:3211"
export T3CODE_LOCAL_MAIN_WORKTREE="$MAIN_WORKTREE"
export T3CODE_LOCAL_STAGING_WORKTREE="$STAGING_WORKTREE"
export T3CODE_LOCAL_MAIN_CONVEX_DATA_DIR="$CONVEX_DATA_DIR"
export T3CODE_LOCAL_STAGING_CONVEX_DATA_DIR="$STAGING_WORKTREE/.local/convex"
export T3CODE_LOCAL_MAIN_CONVEX_URL="$CONVEX_URL"
export T3CODE_LOCAL_MAIN_CONVEX_SITE_URL="$CONVEX_SITE_URL"
export T3CODE_LAUNCH_SKIP_UPSTREAM=1
export T3CODE_LAUNCH_FAST=1
export T3CODE_CONVEX_SKIP_PUSH_ON_REUSE=1
export T3CODE_FORCE_SOLO_LAUNCH=1
export T3CODE_LAUNCH_REQUIRE_IDLE=0
export T3CODE_DISABLE_STARTUP_TERMINAL=1
export T3CODE_AGENT_AUTOMATION=1
export T3CODE_REMOTE_DEBUGGING_PORT=9224
export T3CODE_TURBO_UI="${T3CODE_TURBO_UI:-stream}"
export T3CODE_NO_BROWSER=1
export T3CODE_OPEN_DEVTOOLS=0
export T3CODE_T3CODE_MAIN_WORKTREE="$WORKTREE"

printf '{"remoteDebuggingPort":9224,"devInstance":"t3code-local-main","wmClass":"t3code-local-t3code-main"}\n' \
  > "$T3_HOME/agent-automation.json"

echo "Launching t3code-main (staging branch code + copied main Convex DB)"
echo "  worktree: $WORKTREE"
echo "  t3 home:  $T3_HOME"
echo "  convex:   $CONVEX_URL"

if [[ ! -f "$RUNNER" ]]; then
  echo "Missing runner: $RUNNER" >&2
  exit 1
fi

if [[ -n "$WAIT" ]]; then
  exec node "$RUNNER" --wait
fi

node "$RUNNER" &
echo "Background pid $!"
echo "Verify: curl -sfI http://127.0.0.1:8207/ (main hashed Vite port for t3code-local-main)"
