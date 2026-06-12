#!/usr/bin/env bash
# Start T3 Code local desktop apps the same way as Omarchy / Walker (startup terminal + Turbo task UI).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export T3CODE_LOCAL_WORKSPACE="$(cd "$SCRIPT_DIR/../.." && pwd)"

free_local_desktop_ports() {
  local variant="$1"
  shift || true
  local script="$T3CODE_LOCAL_WORKSPACE/t3code-staging/scripts/free-local-desktop-ports.ts"
  if [[ ! -f "$script" ]]; then
    return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node "$script" "$variant" "$@"
    return $?
  fi
}

if [[ ! -d "$T3CODE_LOCAL_WORKSPACE/t3code-staging" ]]; then
  cat >&2 <<EOF
Could not find t3code-local workspace layout in:
  $T3CODE_LOCAL_WORKSPACE

Run from one of:
  cd ~/code/t3code-local && pnpm run start:dev
  cd ~/code/t3code-local/t3code-main && pnpm run start:main
  cd ~/code/t3code-local/t3code-staging && pnpm run start:staging
EOF
  exit 1
fi

if [[ "${1:-}" == "--install-launchers" ]]; then
  cd "$T3CODE_LOCAL_WORKSPACE/t3code-staging"
  if command -v pnpm >/dev/null 2>&1; then
    exec pnpm run install:local-launchers
  fi
  exec node scripts/install-local-desktop-launchers.ts
fi

VARIANT="${1:-}"
shift || true

FORCE_RELAUNCH=""
while [[ $# -gt 0 ]]; do
  case "$1" in
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

case "$VARIANT" in
  main) DESKTOP_ID="t3code-local-main" ;;
  staging) DESKTOP_ID="t3code-local-staging" ;;
  dev) DESKTOP_ID="t3code-local-dev" ;;
  *)
    cat >&2 <<EOF
Usage: $0 main|staging|dev [--force-relaunch]

  main     T3code (live app, main worktree)
  staging  T3code Staging (product dev worktree)
  dev      T3code Dev (main + staging together)

  --force-relaunch  Quit T3code Dev and relaunch solo main/staging without prompting

Same behavior as the Omarchy Walker entries. Regenerate launchers with:
  pnpm run install:launchers
EOF
    exit 1
    ;;
esac

FREE_PORT_ARGS=()
if [[ -n "$FORCE_RELAUNCH" ]]; then
  FREE_PORT_ARGS+=(--force-relaunch)
  export T3CODE_FORCE_SOLO_LAUNCH=1
fi

free_local_desktop_ports "$VARIANT" "${FREE_PORT_ARGS[@]}"

# CLI entry (workspace root / worktree start:* scripts): run Turbo in this terminal.
# Walker / .desktop launchers omit this and open a dedicated startup terminal.
export T3CODE_DISABLE_STARTUP_TERMINAL=1

LAUNCHER_BIN="$HOME/.local/bin/$DESKTOP_ID"
if [[ ! -x "$LAUNCHER_BIN" ]]; then
  echo "Launcher not found: $LAUNCHER_BIN" >&2
  echo "Run from workspace root: pnpm run install:launchers" >&2
  exit 1
fi

exec "$LAUNCHER_BIN" "$@"
