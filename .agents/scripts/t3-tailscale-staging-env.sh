#!/usr/bin/env bash
# Tailscale HTTPS routing for T3 Code local main + staging on the same machine.
#
# Dual setup (recommended): both on :443 with distinct path prefixes:
#   /t3code-main    → main server
#   /t3code-staging → staging server
#
# Usage:
#   ./.agents/scripts/t3-tailscale-staging-env.sh both
#   ./.agents/scripts/t3-tailscale-staging-env.sh status
#   ./.agents/scripts/t3-tailscale-staging-env.sh probe
#   ./.agents/scripts/t3-tailscale-staging-env.sh down-staging
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STAGING_HOME="${T3CODE_STAGING_HOME:-$HOME/.local/share/t3code-local/staging}"
MAIN_HOME="${T3CODE_MAIN_HOME:-$HOME/.local/share/t3code-local/main}"
STATE_FILE="${T3CODE_TAILSCALE_ROUTING_STATE:-$HOME/.local/share/t3code-local/tailscale-routing.json}"

STAGING_SETTINGS="$STAGING_HOME/dev/desktop-settings.json"
MAIN_SETTINGS="$MAIN_HOME/dev/desktop-settings.json"
STAGING_RUNTIME="$STAGING_HOME/dev/server-runtime.json"
MAIN_RUNTIME="$MAIN_HOME/dev/server-runtime.json"

HTTPS_SERVE_PORT=443
MAIN_SERVE_PATH="/t3code-main"
STAGING_SERVE_PATH="/t3code-staging"
NO_LAUNCH=""

usage() {
  cat <<EOF
Usage: $(basename "$0") <command> [options]

Commands:
  both           Route main and staging on :443 via /t3code-main and /t3code-staging
  up             Staging only on --serve-path (legacy: --serve-port for port-based)
  down-staging   Remove staging Tailscale Serve path; keep main route
  down           Alias for down-staging
  status         Show all Tailscale Serve routes and local server ports
  probe          Probe both HTTPS endpoints (or one with --variant)

Options:
  --main-path PATH       Tailscale path for main (default: /t3code-main)
  --staging-path PATH    Tailscale path for staging (default: /t3code-staging)
  --serve-path PATH      For 'up' only: staging path prefix
  --serve-port PORT      Legacy port-based staging (e.g. 8443); disables path mode for that command
  --variant main|staging For probe: probe one instance only
  --no-launch            Write settings only; do not relaunch desktop apps
  --repeat N             Probe attempts (default: 1)
  --interval-ms MS       Delay between probe attempts

Examples:
  $(basename "$0") both
  $(basename "$0") probe --repeat 5 --interval-ms 2000
  $(basename "$0") down-staging
EOF
}

require_cmds() {
  for cmd in tailscale jq curl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "$cmd is required but not installed." >&2
      exit 1
    fi
  done
}

magic_dns_host() {
  tailscale status --json | jq -r '
    .Self.DNSName // empty
    | if length > 0 then sub("\\.$"; "") else empty end
  '
}

read_runtime_port() {
  local runtime_file="$1"
  if [[ -f "$runtime_file" ]]; then
    jq -r '.port // empty' "$runtime_file" 2>/dev/null || true
  fi
}

normalize_serve_path() {
  local raw="$1"
  local path="${raw#/}"
  path="${path%/}"
  echo "/${path}"
}

write_desktop_settings() {
  local settings_file="$1"
  local serve_path="$2"
  mkdir -p "$(dirname "$settings_file")"
  # Path-based dual routing is managed by this script; avoid each app overwriting Serve on startup.
  jq -n \
    --arg servePath "$(normalize_serve_path "$serve_path")" \
    '{
      serverExposureMode: "network-accessible",
      tailscaleServeEnabled: false,
      tailscaleServePath: $servePath
    }' >"$settings_file"
  echo "Wrote $settings_file (network-accessible; path ${serve_path}; Tailscale Serve managed externally)"
}

https_base_url() {
  local host="$1"
  local serve_path="$2"
  local port="${3:-$HTTPS_SERVE_PORT}"
  local normalized
  normalized="$(normalize_serve_path "$serve_path")"
  if [[ "$port" == "443" ]]; then
    echo "https://${host}${normalized}/"
  else
    echo "https://${host}:${port}${normalized}/"
  fi
}

ensure_tailscale_serve_path() {
  local local_port="$1"
  local serve_path="$2"
  local label="$3"
  local normalized
  normalized="$(normalize_serve_path "$serve_path")"
  echo "[$label] Tailscale Serve https:${HTTPS_SERVE_PORT}${normalized} → http://127.0.0.1:${local_port}"
  tailscale serve --bg "--https=${HTTPS_SERVE_PORT}" "--set-path=${normalized}" "http://127.0.0.1:${local_port}"
}

ensure_tailscale_serve_port() {
  local local_port="$1"
  local serve_port="$2"
  local label="$3"
  echo "[$label] Tailscale Serve https:${serve_port} → http://127.0.0.1:${local_port}"
  tailscale serve --bg "--https=${serve_port}" "http://127.0.0.1:${local_port}"
}

wait_for_runtime_port() {
  local runtime_file="$1"
  local label="$2"
  local deadline=$((SECONDS + 120))
  while [[ "$SECONDS" -lt "$deadline" ]]; do
    local port
    port="$(read_runtime_port "$runtime_file")"
    if [[ -n "$port" ]]; then
      echo "$port"
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for $label server at $runtime_file" >&2
  return 1
}

save_dual_routing_state() {
  mkdir -p "$(dirname "$STATE_FILE")"
  jq -n \
    --arg savedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --argjson httpsServePort "$HTTPS_SERVE_PORT" \
    --arg mainServePath "$(normalize_serve_path "$MAIN_SERVE_PATH")" \
    --arg stagingServePath "$(normalize_serve_path "$STAGING_SERVE_PATH")" \
    --arg mainPort "$(read_runtime_port "$MAIN_RUNTIME")" \
    --arg stagingPort "$(read_runtime_port "$STAGING_RUNTIME")" \
    --arg magicDns "$(magic_dns_host)" \
    '{
      mode: "dual-path",
      savedAt: $savedAt,
      httpsServePort: $httpsServePort,
      mainServePath: $mainServePath,
      stagingServePath: $stagingServePath,
      mainLocalPort: (if $mainPort == "" then null else ($mainPort | tonumber) end),
      stagingLocalPort: (if $stagingPort == "" then null else ($stagingPort | tonumber) end),
      magicDns: (if $magicDns == "" then null else $magicDns end)
    }' >"$STATE_FILE"
}

probe_http_url() {
  local label="$1"
  local base_url="$2"
  local trimmed="${base_url%/}"
  local code body body_file
  body_file="$(mktemp -t t3-tailscale-probe.XXXXXX)"
  local -a curl_args=(
    -sS
    --noproxy '*'
    -o "$body_file"
    -w '%{http_code}'
    --connect-timeout 3
    --max-time 10
  )
  if command -v ip >/dev/null 2>&1 && ip link show tailscale0 >/dev/null 2>&1; then
    curl_args+=(--interface tailscale0)
  fi
  code="$(curl "${curl_args[@]}" "${trimmed}/.well-known/t3/environment" 2>/dev/null || true)"
  body="$(head -c 120 "$body_file" 2>/dev/null || true)"
  rm -f "$body_file"
  if [[ "$code" =~ ^2 ]]; then
    echo "OK  $label $base_url (http $code)"
    return 0
  fi
  if [[ "$body" == *'"environmentId"'* ]]; then
    echo "OK  $label $base_url (environment response; status ${code:-unavailable})"
    return 0
  fi
  echo "FAIL $label $base_url (http ${code:-err}: ${body:-connection failed})"
  return 1
}

probe_public_path_meta() {
  local label="$1"
  local base_url="$2"
  local expected_prefix="$3"
  local trimmed="${base_url%/}"
  local body body_file
  body_file="$(mktemp -t t3-tailscale-meta-probe.XXXXXX)"
  local -a curl_args=(
    -sS
    --noproxy '*'
    -o "$body_file"
    --connect-timeout 3
    --max-time 10
  )
  if command -v ip >/dev/null 2>&1 && ip link show tailscale0 >/dev/null 2>&1; then
    curl_args+=(--interface tailscale0)
  fi
  if ! curl "${curl_args[@]}" "$trimmed/" >/dev/null 2>&1; then
    rm -f "$body_file"
    echo "FAIL $label $base_url (html fetch failed)"
    return 1
  fi
  body="$(head -c 4000 "$body_file" 2>/dev/null || true)"
  rm -f "$body_file"
  local normalized
  normalized="$(normalize_serve_path "$expected_prefix")"
  if [[ "$body" == *"name=\"t3code-public-path-prefix\""* && "$body" == *"content=\"${normalized}\""* ]]; then
    echo "OK  $label $base_url (public path meta ${normalized})"
    return 0
  fi
  echo "FAIL $label $base_url (missing public path meta ${normalized})"
  return 1
}

probe_local_stack_health() {
  local label="$1"
  local runtime_file="$2"
  local port body body_file
  port="$(read_runtime_port "$runtime_file")"
  if [[ -z "$port" ]]; then
    echo "SKIP $label stack-health (no server-runtime.json port)"
    return 0
  fi
  body_file="$(mktemp -t t3-stack-health-probe.XXXXXX)"
  body="$(curl -sS --connect-timeout 2 --max-time 8 -o "$body_file" "http://127.0.0.1:${port}/api/local/stack-health" 2>/dev/null || true)"
  if [[ -s "$body_file" ]] && grep -q '"checkedAt"' "$body_file" 2>/dev/null; then
    echo "OK  $label stack-health http://127.0.0.1:${port}/api/local/stack-health"
    rm -f "$body_file"
    return 0
  fi
  rm -f "$body_file"
  echo "FAIL $label stack-health http://127.0.0.1:${port}/api/local/stack-health"
  return 1
}

probe_dual_urls_once() {
  local dns="$1"
  local failures=0
  local main_url staging_url
  main_url="$(https_base_url "$dns" "$MAIN_SERVE_PATH")"
  staging_url="$(https_base_url "$dns" "$STAGING_SERVE_PATH")"
  probe_http_url "main" "$main_url" || failures=$((failures + 1))
  probe_http_url "staging" "$staging_url" || failures=$((failures + 1))
  probe_public_path_meta "main-meta" "$main_url" "$MAIN_SERVE_PATH" || failures=$((failures + 1))
  probe_public_path_meta "staging-meta" "$staging_url" "$STAGING_SERVE_PATH" || failures=$((failures + 1))
  probe_local_stack_health "main" "$MAIN_RUNTIME" || failures=$((failures + 1))
  probe_local_stack_health "staging" "$STAGING_RUNTIME" || failures=$((failures + 1))
  [[ "$failures" -eq 0 ]]
}

probe_dual_urls_with_retry() {
  local dns="$1"
  local attempts="${2:-3}"
  local delay="${3:-2}"
  local attempt=1

  while [[ "$attempt" -le "$attempts" ]]; do
    if [[ "$attempts" -gt 1 ]]; then
      echo "--- probe attempt ${attempt}/${attempts} ---"
    fi
    if probe_dual_urls_once "$dns"; then
      return 0
    fi
    if [[ "$attempt" -ge "$attempts" ]]; then
      break
    fi
    attempt=$((attempt + 1))
    sleep "$delay"
  done

  return 1
}

cmd_status() {
  require_cmds
  local dns main_port staging_port
  dns="$(magic_dns_host)"
  main_port="$(read_runtime_port "$MAIN_RUNTIME")"
  staging_port="$(read_runtime_port "$STAGING_RUNTIME")"

  echo "MagicDNS: ${dns:-"(none)"}"
  echo ""
  echo "Tailscale Serve:"
  tailscale serve status 2>/dev/null || echo "  (not configured)"
  echo ""
  echo "Local server ports:"
  echo "  main:    ${main_port:-"(not running)"}"
  echo "  staging: ${staging_port:-"(not running)"}"

  if [[ -n "$dns" ]]; then
    echo ""
    echo "Expected pairing base URLs (dual path setup):"
    echo "  main:    $(https_base_url "$dns" "$MAIN_SERVE_PATH")"
    echo "  staging: $(https_base_url "$dns" "$STAGING_SERVE_PATH")"
  fi

  if [[ -f "$STATE_FILE" ]]; then
    echo ""
    echo "Saved routing state:"
    cat "$STATE_FILE"
  fi
}

print_pairing_help() {
  local dns="$1"
  local main_url staging_url
  main_url="$(https_base_url "$dns" "$MAIN_SERVE_PATH")"
  staging_url="$(https_base_url "$dns" "$STAGING_SERVE_PATH")"

  echo ""
  echo "Tailscale HTTPS URLs (save both on mobile as separate environments):"
  echo "  Main:    $main_url"
  echo "  Staging: $staging_url"
  echo ""
  echo "In each desktop app: Settings → Connections → use the Tailscale HTTPS pairing link."
  echo "Do not use raw 100.x IP URLs — they are not proxied by Tailscale Serve."
}

cmd_both() {
  require_cmds

  write_desktop_settings "$MAIN_SETTINGS" "$MAIN_SERVE_PATH"
  write_desktop_settings "$STAGING_SETTINGS" "$STAGING_SERVE_PATH"

  if [[ "$NO_LAUNCH" != "1" ]]; then
    echo "Relaunching main…"
    "$SCRIPT_DIR/t3-launch.sh" main --wait
    echo "Relaunching staging…"
    "$SCRIPT_DIR/t3-launch.sh" staging --wait
  else
    echo "Skipped launches (--no-launch). Restart both desktop apps manually."
  fi

  local main_port staging_port
  main_port="$(wait_for_runtime_port "$MAIN_RUNTIME" "main")"
  staging_port="$(wait_for_runtime_port "$STAGING_RUNTIME" "staging")"

  ensure_tailscale_serve_path "$main_port" "$MAIN_SERVE_PATH" "main"
  ensure_tailscale_serve_path "$staging_port" "$STAGING_SERVE_PATH" "staging"

  save_dual_routing_state

  local dns
  dns="$(magic_dns_host)"
  if [[ -n "$dns" ]]; then
    print_pairing_help "$dns"
  fi

  echo ""
  echo "Verifying endpoints…"
  local failures=0
  if [[ -n "$dns" ]]; then
    probe_dual_urls_with_retry "$dns" 3 2 || failures=$((failures + 1))
  fi

  echo ""
  tailscale serve status 2>/dev/null || true

  if [[ "$failures" -gt 0 ]]; then
    echo ""
    echo "Some probes failed. Check both apps are running: $(basename "$0") status" >&2
    exit 1
  fi

  echo ""
  echo "Dual Tailscale routing is ready."
}

cmd_up() {
  require_cmds

  write_desktop_settings "$STAGING_SETTINGS" "${UP_SERVE_PATH:-$STAGING_SERVE_PATH}"

  if [[ "$NO_LAUNCH" != "1" ]]; then
    echo "Relaunching staging…"
    "$SCRIPT_DIR/t3-launch.sh" staging --wait
  fi

  local staging_port
  staging_port="$(wait_for_runtime_port "$STAGING_RUNTIME" "staging")"

  if [[ -n "${UP_SERVE_PORT:-}" ]]; then
    ensure_tailscale_serve_port "$staging_port" "$UP_SERVE_PORT" "staging"
  else
    ensure_tailscale_serve_path "$staging_port" "$STAGING_SERVE_PATH" "staging"
  fi

  local dns
  dns="$(magic_dns_host)"
  if [[ -n "$dns" ]]; then
    if [[ -n "${UP_SERVE_PORT:-}" ]]; then
      echo "Staging URL: $(https_base_url "$dns" "/" "$UP_SERVE_PORT")"
    else
      echo "Staging URL: $(https_base_url "$dns" "$STAGING_SERVE_PATH")"
    fi
  fi
}

cmd_down_staging() {
  require_cmds
  local normalized
  normalized="$(normalize_serve_path "$STAGING_SERVE_PATH")"
  echo "Disabling staging Tailscale Serve path ${normalized}…"
  tailscale serve "--https=${HTTPS_SERVE_PORT}" "--set-path=${normalized}" off 2>/dev/null || true
  echo "Staging serve entry removed. Main path $(normalize_serve_path "$MAIN_SERVE_PATH") is unchanged."
  tailscale serve status 2>/dev/null || true
}

cmd_probe() {
  require_cmds
  local dns failures=0
  dns="$(magic_dns_host)"
  if [[ -z "$dns" ]]; then
    echo "MagicDNS not available." >&2
    exit 1
  fi

  local repeat="${PROBE_REPEAT:-1}"
  local interval_ms="${PROBE_INTERVAL_MS:-0}"
  local attempt=1

  while [[ "$attempt" -le "$repeat" ]]; do
    echo "--- probe attempt ${attempt}/${repeat} ---"
    if [[ -z "${PROBE_VARIANT:-}" ]]; then
      probe_dual_urls_once "$dns" || failures=$((failures + 1))
    else
      local variant_url variant_path
      if [[ "$PROBE_VARIANT" == "main" ]]; then
        variant_path="$MAIN_SERVE_PATH"
      else
        variant_path="$STAGING_SERVE_PATH"
      fi
      variant_url="$(https_base_url "$dns" "$variant_path")"
      probe_http_url "$PROBE_VARIANT" "$variant_url" || failures=$((failures + 1))
      probe_public_path_meta "${PROBE_VARIANT}-meta" "$variant_url" "$variant_path" ||
        failures=$((failures + 1))
    fi
    if [[ "$attempt" -ge "$repeat" ]]; then
      break
    fi
    attempt=$((attempt + 1))
    if [[ "$interval_ms" -gt 0 ]]; then
      sleep "$(awk "BEGIN { print ${interval_ms}/1000 }")"
    fi
  done

  [[ "$failures" -eq 0 ]]
}

COMMAND="${1:-}"
shift || true

PROBE_REPEAT=""
PROBE_INTERVAL_MS=""
PROBE_VARIANT=""
UP_SERVE_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --main-path)
      MAIN_SERVE_PATH="${2:?missing value after --main-path}"
      shift 2
      ;;
    --staging-path)
      STAGING_SERVE_PATH="${2:?missing value after --staging-path}"
      shift 2
      ;;
    --serve-path)
      STAGING_SERVE_PATH="${2:?missing value after --serve-path}"
      shift 2
      ;;
    --serve-port)
      UP_SERVE_PORT="${2:?missing value after --serve-port}"
      shift 2
      ;;
    --variant)
      PROBE_VARIANT="${2:?missing value after --variant}"
      shift 2
      ;;
    --no-launch)
      NO_LAUNCH=1
      shift
      ;;
    --repeat)
      PROBE_REPEAT="${2:?missing value after --repeat}"
      shift 2
      ;;
    --interval-ms)
      PROBE_INTERVAL_MS="${2:?missing value after --interval-ms}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$COMMAND" in
  both) cmd_both ;;
  up) cmd_up ;;
  down|down-staging) cmd_down_staging ;;
  status) cmd_status ;;
  probe) cmd_probe ;;
  "")
    usage >&2
    exit 1
    ;;
  *)
    echo "Unknown command: $COMMAND" >&2
    usage >&2
    exit 1
    ;;
esac
