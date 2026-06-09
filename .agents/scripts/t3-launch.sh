#!/usr/bin/env bash
# Launch T3 Code local desktop apps the way Walker does, but agent-safe (no Ghostty, no read prompt).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export T3CODE_LOCAL_WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"
export T3CODE_LAUNCH_REQUIRE_IDLE="${T3CODE_LAUNCH_REQUIRE_IDLE:-1}"
export T3CODE_AGENT_AUTOMATION=1

free_local_desktop_ports() {
  local variant="$1"
  shift || true
  local script="$T3CODE_LOCAL_WORKSPACE/t3code-staging/scripts/free-local-desktop-ports.ts"
  if [[ ! -f "$script" ]]; then
    return 0
  fi
  if command -v bun >/dev/null 2>&1; then
    bun "$script" "$variant" "$@"
    return $?
  fi
  if command -v node >/dev/null 2>&1; then
    node "$script" "$variant" "$@"
  fi
}

VARIANT="${1:-}"
shift || true

WAIT_FOR_VITE=""
FORCE_RELAUNCH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --wait)
      WAIT_FOR_VITE=1
      shift
      ;;
    --force-relaunch)
      FORCE_RELAUNCH=1
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$VARIANT" != "main" && "$VARIANT" != "staging" && "$VARIANT" != "dev" ]]; then
  echo "Usage: $0 main|staging|dev [--wait]" >&2
  exit 1
fi

case "$VARIANT" in
  main) DESKTOP_ID="t3code-local-main" ;;
  staging) DESKTOP_ID="t3code-local-staging" ;;
  dev) DESKTOP_ID="t3code-local-dev" ;;
esac

FREE_PORT_ARGS=()
if [[ -n "$FORCE_RELAUNCH" ]]; then
  if [[ "$VARIANT" == "dev" ]]; then
    cat >&2 <<EOF
Agent launches cannot force-relaunch T3code Dev.
Use the existing Dev windows, or quit T3code Dev manually before launching a solo app.
EOF
    exit 1
  fi
  FREE_PORT_ARGS+=(--force-relaunch)
  export T3CODE_FORCE_SOLO_LAUNCH=1
fi

free_local_desktop_ports "$VARIANT" "${FREE_PORT_ARGS[@]}"

export T3CODE_DISABLE_STARTUP_TERMINAL=1
export T3CODE_TURBO_UI=stream

LAUNCHER_BIN="$HOME/.local/bin/$DESKTOP_ID"
if [[ ! -x "$LAUNCHER_BIN" ]]; then
  echo "Launcher not found: $LAUNCHER_BIN (run: cd t3code-staging && bun run install:local-launchers)" >&2
  exit 1
fi

"$LAUNCHER_BIN" &
LAUNCH_PID=$!

if [[ -z "$WAIT_FOR_VITE" ]]; then
  echo "Launched $DESKTOP_ID (background pid $LAUNCH_PID)."
  echo "Verify: $SCRIPT_DIR/t3-verify.sh $VARIANT"
  exit 0
fi

exec "$SCRIPT_DIR/t3-verify.sh" "$VARIANT" --wait-only
