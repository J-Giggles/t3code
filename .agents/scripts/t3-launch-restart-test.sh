#!/usr/bin/env bash
# Verify that relaunching while an instance is running kills the old stack and starts fresh.
set -euo pipefail

VARIANT="${1:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$VARIANT" in
  main)
    DESKTOP_ID="t3code-local-main"
    LOCK_NAME="t3code-local-main.lock"
    ;;
  staging)
    DESKTOP_ID="t3code-local-staging"
    LOCK_NAME="t3code-local-staging.lock"
    ;;
  *)
    echo "Usage: $0 main|staging" >&2
    exit 1
    ;;
esac

export T3CODE_DISABLE_STARTUP_TERMINAL=1
export T3CODE_AGENT_AUTOMATION=1

LAUNCHER_BIN="$HOME/.local/bin/$DESKTOP_ID"
LOCK_FILE="${XDG_RUNTIME_DIR:-$HOME/.local/share/t3code-local/locks}/$LOCK_NAME"
LOG_DIR="$HOME/.local/share/t3code-local/${VARIANT}/logs"

if [[ ! -x "$LAUNCHER_BIN" ]]; then
  echo "Launcher not found: $LAUNCHER_BIN" >&2
  exit 1
fi

get_lock_holders() {
  if command -v fuser >/dev/null 2>&1 && [[ -f "$LOCK_FILE" ]]; then
    fuser "$LOCK_FILE" 2>/dev/null | tr -cs '0-9' '\n' | sort -u || true
  fi
}

latest_launch_log() {
  if [[ -f "$LOG_DIR/runtime.log" ]]; then
    printf '%s\n' "$LOG_DIR/runtime.log"
    return 0
  fi
  ls -1t "$LOG_DIR"/startup-*.log 2>/dev/null | head -1
}

launch_log_signature() {
  local log_file="$1"
  if [[ -z "$log_file" || ! -f "$log_file" ]]; then
    return 1
  fi
  wc -c <"$log_file" | tr -d '[:space:]'
}

echo "== t3 launch restart test ($VARIANT) =="

if ! "$SCRIPT_DIR/t3-verify.sh" "$VARIANT" --wait-only 2>/dev/null; then
  echo "No running instance; starting first launch..."
  "$LAUNCHER_BIN" &
  "$SCRIPT_DIR/t3-verify.sh" "$VARIANT" --wait-only
fi

OLD_HOLDERS="$(get_lock_holders | tr '\n' ' ')"
OLD_LAUNCHER="$(pgrep -f "$LAUNCHER_BIN" 2>/dev/null | head -1)" || OLD_LAUNCHER=""
echo "Lock holders before relaunch:${OLD_HOLDERS:- (none)}"
echo "Launcher pid before relaunch:${OLD_LAUNCHER:- (none)}"

BEFORE_LOG="$(latest_launch_log || true)"
BEFORE_SIG="$(launch_log_signature "$BEFORE_LOG")"
echo "Relaunching while instance is running..."
"$LAUNCHER_BIN" &

deadline=$((SECONDS + 90))
while (( SECONDS < deadline )); do
  sleep 2
  AFTER_LOG="$(latest_launch_log || true)"
  AFTER_SIG="$(launch_log_signature "$AFTER_LOG")"
  if [[ -n "$AFTER_LOG" ]] && grep -q "continuing launch" "$AFTER_LOG"; then
    if [[ -n "$BEFORE_SIG" && "$AFTER_SIG" != "$BEFORE_SIG" ]]; then
      break
    fi
    if [[ -z "$BEFORE_SIG" ]]; then
      break
    fi
  fi
done

AFTER_LOG="$(latest_launch_log || true)"
if [[ -z "$AFTER_LOG" ]] || ! grep -q "continuing launch" "$AFTER_LOG"; then
  echo "FAIL: relaunch log never reached 'continuing launch'" >&2
  [[ -n "$AFTER_LOG" ]] && tail -20 "$AFTER_LOG" >&2 || true
  exit 1
fi

if [[ -n "$OLD_LAUNCHER" ]] && kill -0 "$OLD_LAUNCHER" 2>/dev/null; then
  echo "FAIL: old launcher pid $OLD_LAUNCHER is still running" >&2
  exit 1
fi

if ! "$SCRIPT_DIR/t3-verify.sh" "$VARIANT" --wait-only; then
  echo "FAIL: app did not come back healthy after relaunch" >&2
  exit 1
fi

echo "PASS: relaunch killed previous instance and restarted ($VARIANT)"
echo "Log: $AFTER_LOG"
