#!/usr/bin/env bash
# Waits for an in-flight bun install, then completes t3code-local setup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STAGING="$ROOT/t3code-staging"
LOG="${T3CODE_SETUP_LOG:-/tmp/t3code-local-finish.log}"

log() {
  echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"
}

wait_for_bun_install() {
  local pid="${1:-}"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    log "Waiting for bun install (pid $pid)..."
    while kill -0 "$pid" 2>/dev/null; do
      sleep 5
    done
    log "bun install process exited."
    return
  fi

  if pgrep -f "t3code-staging.*bun install" >/dev/null 2>&1; then
    log "Waiting for staging bun install..."
    while pgrep -f "t3code-staging.*bun install" >/dev/null 2>&1; do
      sleep 5
    done
    log "bun install finished."
  fi
}

cd "$STAGING"
mise trust "$STAGING/.mise.toml" >/dev/null 2>&1 || true

wait_for_bun_install "${1:-}"

if [[ ! -f "$STAGING/node_modules/node-pty/package.json" ]]; then
  log "node-pty missing — re-running bun install..."
  mise exec -- bun install >>"$LOG" 2>&1
fi

log "Installing desktop launchers..."
mise exec -- bun run install:local-launchers >>"$LOG" 2>&1

log "Installing workspace shell dependencies..."
cd "$ROOT"
mise exec -- bun install >>"$LOG" 2>&1 || true

log "Setup complete."
log "  Start staging: cd $ROOT && bun run start:staging"
log "  Start both:    cd $ROOT && bun run start:dev"
log "  Workspace:     cursor $ROOT/t3code-local.code-workspace"
