#!/usr/bin/env bash
# Local stack recovery: health snapshot and repair actions for main/staging/dev.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T3CODE_LOCAL_WORKSPACE="${T3CODE_LOCAL_WORKSPACE:-$(cd "$SCRIPT_DIR/../.." && pwd)}"

ACTION="${1:-health}"
VARIANT="${2:-main}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [variant]

Commands:
  health                 GET /api/local/stack-health (variant: main|staging)
  auto-repair-status     GET /api/local/stack-auto-repair/status (variant: main)
  auto-repair [retry]    POST stack-auto-repair (restore main, relaunch, queue agent)
  auto-repair-finalize   POST stack-auto-repair/finalize after relaunch
  kill-orphans           POST stack-recover kill-orphan-launchers
  clear-locks            POST stack-recover clear-stale-locks
  relaunch main|staging|dev
  promote-main           POST stack-recover promote-and-relaunch-main (main only)

Falls back to direct fs/proc helpers when the local server is unreachable.
EOF
}

resolve_variant_paths() {
  case "$VARIANT" in
    main)
      T3_HOME="$HOME/.local/share/t3code-local/main"
      RUNTIME_FILE="$T3_HOME/dev/server-runtime.json"
      ;;
    staging)
      T3_HOME="$HOME/.local/share/t3code-local/staging"
      RUNTIME_FILE="$T3_HOME/dev/server-runtime.json"
      ;;
    *)
      echo "Unknown variant: $VARIANT (expected main or staging)" >&2
      exit 1
      ;;
  esac
}

resolve_server_base_url() {
  resolve_variant_paths
  if [[ ! -f "$RUNTIME_FILE" ]] || ! command -v jq >/dev/null 2>&1; then
    return 1
  fi
  local port
  port="$(jq -r '.port // empty' "$RUNTIME_FILE" 2>/dev/null || true)"
  if [[ -z "$port" ]]; then
    return 1
  fi
  echo "http://127.0.0.1:${port}"
}

call_stack_api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local base_url
  if ! base_url="$(resolve_server_base_url)"; then
    return 1
  fi

  local -a curl_args=(
    -sS
    --connect-timeout 2
    --max-time 15
    -X "$method"
    -H "Content-Type: application/json"
  )
  if [[ -n "$body" ]]; then
    curl_args+=(-d "$body")
  fi
  curl "${curl_args[@]}" "${base_url}${path}"
}

cmd_health() {
  if response="$(call_stack_api GET "/api/local/stack-health" 2>/dev/null)"; then
    if command -v jq >/dev/null 2>&1; then
      echo "$response" | jq .
    else
      echo "$response"
    fi
    return 0
  fi

  resolve_variant_paths
  echo "server_unreachable=yes"
  echo "variant=$VARIANT"
  echo "t3_home=$T3_HOME"
  if [[ -f "$RUNTIME_FILE" ]]; then
    echo "server_runtime_path=$RUNTIME_FILE"
    cat "$RUNTIME_FILE"
  else
    echo "server_runtime_path=missing"
  fi
}

cmd_recover_action() {
  local action="$1"
  if response="$(call_stack_api POST "/api/local/stack-recover" "{\"action\":\"$action\"}" 2>/dev/null)"; then
    if command -v jq >/dev/null 2>&1; then
      echo "$response" | jq .
    else
      echo "$response"
    fi
    return 0
  fi

  echo "Local server unreachable; running direct fallback for $action" >&2
  cd "$T3CODE_LOCAL_WORKSPACE/t3code-staging"
  bun -e "
    import { applyLocalStackRecoverAction } from './apps/server/src/local/stackRecover.ts';
    const result = await applyLocalStackRecoverAction({ action: '$action' });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  "
}

cmd_auto_repair_status() {
  VARIANT="${2:-main}"
  if response="$(call_stack_api GET "/api/local/stack-auto-repair/status" 2>/dev/null)"; then
    if command -v jq >/dev/null 2>&1; then
      echo "$response" | jq .
    else
      echo "$response"
    fi
    return 0
  fi
  cmd_health
}

cmd_auto_repair() {
  local retry="${1:-false}"
  if [[ "$retry" == "retry" || "$retry" == "1" || "$retry" == "true" ]]; then
    body='{"reason":"cli-auto-repair","retryPromotion":true}'
  else
    body='{"reason":"cli-auto-repair","retryPromotion":false}'
  fi
  if response="$(call_stack_api POST "/api/local/stack-auto-repair" "$body" 2>/dev/null)"; then
    if command -v jq >/dev/null 2>&1; then
      echo "$response" | jq .
    else
      echo "$response"
    fi
    echo "Poll status: $(basename "$0") auto-repair-status main"
    return 0
  fi
  echo "Local server unreachable; cannot start auto-repair via HTTP." >&2
  exit 1
}

cmd_auto_repair_finalize() {
  if response="$(call_stack_api POST "/api/local/stack-auto-repair/finalize" "{}" 2>/dev/null)"; then
    if command -v jq >/dev/null 2>&1; then
      echo "$response" | jq .
    else
      echo "$response"
    fi
    return 0
  fi
  echo "Local server unreachable; run finalize from a healthy main instance." >&2
  exit 1
}

case "$ACTION" in
  health)
    VARIANT="${2:-main}"
    cmd_health
    ;;
  auto-repair-status)
    cmd_auto_repair_status "$@"
    ;;
  auto-repair)
    cmd_auto_repair "${2:-false}"
    ;;
  auto-repair-finalize)
    cmd_auto_repair_finalize
    ;;
  kill-orphans)
    cmd_recover_action "kill-orphan-launchers"
    ;;
  clear-locks)
    cmd_recover_action "clear-stale-locks"
    ;;
  relaunch)
    VARIANT="${2:?relaunch requires main|staging|dev}"
    cmd_recover_action "relaunch-${VARIANT}"
    ;;
  promote-main)
    VARIANT=main
    cmd_recover_action "promote-and-relaunch-main"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $ACTION" >&2
    usage >&2
    exit 1
    ;;
esac
