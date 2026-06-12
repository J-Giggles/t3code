#!/usr/bin/env bash
# Resolve Vite URL for a local T3 instance, probe it, optionally screenshot the Hyprland window.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T3CODE_LOCAL_WORKSPACE="${T3CODE_LOCAL_WORKSPACE:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

VARIANT="${1:-}"
SCREENSHOT_PATH=""
WAIT_ONLY=""
CHECK_CONVEX=""
MAX_WAIT_SEC=180
CONVEX_MAX_WAIT_SEC=300

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --screenshot)
      SCREENSHOT_PATH="${2:?missing path after --screenshot}"
      shift 2
      ;;
    --wait-only)
      WAIT_ONLY=1
      shift
      ;;
    --convex)
      CHECK_CONVEX=1
      shift
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$VARIANT" != "main" && "$VARIANT" != "staging" ]]; then
  echo "Usage: $0 main|staging [--screenshot path] [--wait-only] [--convex]" >&2
  exit 1
fi

case "$VARIANT" in
  main)
    DEV_INSTANCE="t3code-local-main"
    WM_CLASS="t3code-local-t3code-main"
    T3_HOME="$HOME/.local/share/t3code-local/t3code-main"
    WORKTREE="$T3CODE_LOCAL_WORKSPACE/t3code-main"
    CONVEX_DATA_DIR="$WORKTREE/.local/convex"
    CONVEX_URL="http://127.0.0.1:3210"
    ;;
  staging)
    DEV_INSTANCE="t3code-local-staging"
    WM_CLASS="t3code-local-staging"
    T3_HOME="$HOME/.local/share/t3code-local/staging"
    WORKTREE="$T3CODE_LOCAL_WORKSPACE/t3code-staging"
    CONVEX_DATA_DIR="$WORKTREE/.local/convex"
    CONVEX_URL="http://127.0.0.1:3220"
    ;;
esac

verify_convex_health() {
  local status_script="$WORKTREE/packages/convex/scripts/convex-status.mjs"
  if [[ ! -f "$status_script" ]]; then
    echo "convex_status=missing_script" >&2
    return 1
  fi

  echo "convex_data_dir=$CONVEX_DATA_DIR"
  echo "convex_url=$CONVEX_URL"

  local deadline=$((SECONDS + CONVEX_MAX_WAIT_SEC))
  until node "$status_script" --data-dir "$CONVEX_DATA_DIR" --url "$CONVEX_URL"; do
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for Convex at $CONVEX_URL" >&2
      return 1
    fi
    sleep 5
  done
}

BASE_WEB_PORT=5733

resolve_expected_web_port() {
  cd "$WORKTREE"
  DEV_INSTANCE="$DEV_INSTANCE" bun -e "
    import { resolveOffset } from './scripts/dev-runner.ts';
    const { offset } = resolveOffset({ portOffset: undefined, devInstance: process.env.DEV_INSTANCE });
    console.log(${BASE_WEB_PORT} + offset);
  "
}

EXPECTED_PORT=""
if [[ -d "$WORKTREE" ]]; then
  if ! EXPECTED_PORT="$(resolve_expected_web_port 2>/dev/null)"; then
    echo "Warning: could not compute expected web port from dev-runner" >&2
    EXPECTED_PORT=""
  fi
fi
parse_vite_url_from_log() {
  local log_file="$1"
  local web_port=""
  web_port="$(rg -o 'webPort=[0-9]+' "$log_file" 2>/dev/null | tail -1 | cut -d= -f2 || true)"
  if [[ -n "$web_port" ]]; then
    echo "http://127.0.0.1:${web_port}"
    return
  fi
  rg -o 'Local:[^ ]*http://127\\.0\\.0\\.1:[0-9]+' "$log_file" 2>/dev/null | tail -1 | rg -o 'http://127\\.0\\.0\\.1:[0-9]+' || true
}

VITE_URL=""

if [[ -d "$T3_HOME/logs" ]]; then
  LATEST_LOG="$(ls -t "$T3_HOME/logs"/startup-*.log 2>/dev/null | head -1 || true)"
  if [[ -n "$LATEST_LOG" ]]; then
    VITE_URL="$(parse_vite_url_from_log "$LATEST_LOG")"
  fi
fi

if [[ -z "$VITE_URL" && -n "$EXPECTED_PORT" ]]; then
  VITE_URL="http://127.0.0.1:${EXPECTED_PORT}"
fi

if [[ -z "$VITE_URL" && -n "$WAIT_ONLY" ]]; then
  echo "Waiting for startup log with Vite URL (launcher may still be in preflight)..."
  deadline=$((SECONDS + MAX_WAIT_SEC))
  while [[ -z "$VITE_URL" && $SECONDS -lt $deadline ]]; do
    if [[ -d "$T3_HOME/logs" ]]; then
      LATEST_LOG="$(ls -t "$T3_HOME/logs"/startup-*.log 2>/dev/null | head -1 || true)"
      if [[ -n "$LATEST_LOG" ]]; then
        VITE_URL="$(parse_vite_url_from_log "$LATEST_LOG")"
      fi
    fi
    if [[ -z "$VITE_URL" && -n "$EXPECTED_PORT" ]]; then
      VITE_URL="http://127.0.0.1:${EXPECTED_PORT}"
    fi
    if [[ -n "$VITE_URL" ]]; then
      break
    fi
    sleep 2
  done
fi

if [[ -z "$VITE_URL" ]]; then
  echo "Could not resolve Vite URL for $VARIANT (check $T3_HOME/logs or start the app first)." >&2
  exit 1
fi

echo "variant=$VARIANT"
echo "vite_url=$VITE_URL"
echo "expected_port=${EXPECTED_PORT:-unknown}"
echo "t3_home=$T3_HOME"
echo "wm_class=$WM_CLASS"

deadline=$((SECONDS + MAX_WAIT_SEC))
until curl -sf -o /dev/null --max-time 2 "$VITE_URL" 2>/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "Timed out waiting for $VITE_URL" >&2
    exit 1
  fi
  sleep 2
done

echo "vite_ready=yes"

if [[ -n "$CHECK_CONVEX" ]]; then
  verify_convex_health
  echo "convex_ready=yes"
fi

if [[ -n "$WAIT_ONLY" ]]; then
  exit 0
fi

CDP_PORT=""
if [[ -f "$T3_HOME/agent-automation.json" ]] && command -v jq >/dev/null 2>&1; then
  CDP_PORT="$(jq -r '.remoteDebuggingPort // empty' "$T3_HOME/agent-automation.json" 2>/dev/null || true)"
fi

if command -v agent-browser >/dev/null 2>&1; then
  if [[ -n "$CDP_PORT" ]]; then
    CDP_LISTENING=no
    if curl -sf --connect-timeout 1 --max-time 2 "http://127.0.0.1:${CDP_PORT}/json/version" >/dev/null 2>&1; then
      CDP_LISTENING=yes
      echo "cdp_listening=yes (port $CDP_PORT)"
    else
      echo "cdp_listening=no (port $CDP_PORT not responding)"
    fi

    echo "Connecting agent-browser to Electron CDP port $CDP_PORT..."
    if timeout --kill-after=2s 12s agent-browser connect "$CDP_PORT" 2>/dev/null; then
      timeout --kill-after=2s 8s agent-browser snapshot -i 2>/dev/null | head -80 || true
      echo "cdp_connected=yes"
    else
      if [[ "$CDP_LISTENING" == "yes" ]]; then
        echo "cdp_connected=no (Electron CDP is up; agent-browser cannot attach — use Vite URL or Cursor browser CDP)"
      else
        echo "cdp_connected=no (restart with T3CODE_AGENT_AUTOMATION=1 via t3-launch.sh)"
      fi
      echo "Opening Vite URL as fallback..."
      timeout --kill-after=2s 12s agent-browser open "$VITE_URL" || true
      timeout --kill-after=2s 8s agent-browser wait --load networkidle 2>/dev/null || true
      timeout --kill-after=2s 8s agent-browser snapshot -i 2>/dev/null | head -80 || true
    fi
  else
    echo "Opening in agent-browser (Vite)..."
    timeout --kill-after=2s 12s agent-browser open "$VITE_URL" || true
    timeout --kill-after=2s 8s agent-browser wait --load networkidle 2>/dev/null || true
    timeout --kill-after=2s 8s agent-browser snapshot -i 2>/dev/null | head -80 || true
  fi
fi

if [[ -n "$SCREENSHOT_PATH" ]]; then
  if command -v hyprctl >/dev/null 2>&1 && command -v grim >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    GEOM="$(hyprctl clients -j 2>/dev/null | jq -r --arg c "$WM_CLASS" '
      .[] | select(.class == $c) |
      "\(.at[0]),\(.at[1]) \(.size[0])x\(.size[1])"
    ' | head -1 || true)"
    if [[ -n "$GEOM" ]]; then
      grim -g "$GEOM" "$SCREENSHOT_PATH" && echo "screenshot=$SCREENSHOT_PATH"
    else
      echo "No Hyprland window with class $WM_CLASS for screenshot." >&2
    fi
  else
    echo "hyprctl/grim/jq not available; skip screenshot." >&2
  fi
fi
