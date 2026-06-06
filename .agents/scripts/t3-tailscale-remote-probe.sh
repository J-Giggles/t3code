#!/usr/bin/env bash
# Probe Tailscale-reachable T3 server endpoints for mobile / remote client pairing.
#
# Usage:
#   ./.agents/scripts/t3-tailscale-remote-probe.sh staging
#   ./.agents/scripts/t3-tailscale-remote-probe.sh main --http-base-url https://machine.tail.ts.net/
#   ./.agents/scripts/t3-tailscale-remote-probe.sh staging --repeat 5 --interval-ms 2000
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VARIANT="${1:-}"
shift || true

HTTP_BASE_URL=""
REPEAT=1
INTERVAL_MS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --http-base-url)
      HTTP_BASE_URL="${2:?missing value after --http-base-url}"
      shift 2
      ;;
    --repeat)
      REPEAT="${2:?missing value after --repeat}"
      shift 2
      ;;
    --interval-ms)
      INTERVAL_MS="${2:?missing value after --interval-ms}"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$VARIANT" != "main" && "$VARIANT" != "staging" ]]; then
  echo "Usage: $0 main|staging [--http-base-url URL] [--repeat N] [--interval-ms MS]" >&2
  exit 1
fi

case "$VARIANT" in
  main)
    WORKTREE="$ROOT/t3code"
    DEV_INSTANCE="t3code-local-main"
    ;;
  staging)
    WORKTREE="$ROOT/t3code-staging"
    DEV_INSTANCE="t3code-local-staging"
    ;;
esac

for cmd in tailscale curl jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required but not installed." >&2
    exit 1
  fi
done

SERVER_PORT="$(
  cd "$WORKTREE"
  T3CODE_DEV_INSTANCE="$DEV_INSTANCE" bun -e "
    import { resolveOffset } from './scripts/dev-runner.ts';
    const { offset } = resolveOffset({ portOffset: undefined, devInstance: process.env.T3CODE_DEV_INSTANCE });
    console.log(13773 + offset);
  "
)"

readarray -t TAILNET_IPS < <(
  tailscale status --json | jq -r '
    .Self.TailscaleIPs[]?
    | select(type == "string")
    | select(test("^100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\."))
  '
)

MAGIC_DNS="$(
  tailscale status --json | jq -r '
    .Self.DNSName // empty
    | if length > 0 then sub("\\.$"; "") else empty end
  '
)"

probe_http() {
  local base_url="$1"
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
  if [[ -n "$MAGIC_DNS" && "$base_url" == "https://${MAGIC_DNS}"* ]]; then
    if command -v ip >/dev/null 2>&1 && ip link show tailscale0 >/dev/null 2>&1; then
      curl_args+=(--interface tailscale0)
    fi
  fi
  code="$(curl "${curl_args[@]}" "${trimmed}/.well-known/t3/environment" 2>/dev/null || true)"
  body="$(head -c 160 "$body_file" 2>/dev/null || true)"
  rm -f "$body_file"
  if [[ "$code" =~ ^2 ]]; then
    echo "OK http=${code}:environment descriptor reachable"
    return 0
  fi
  if [[ "$body" == *'"environmentId"'* ]]; then
    echo "OK http=${code:-status-unavailable}:environment descriptor reachable"
    return 0
  fi
  echo "FAIL http=${code:-err}:${body:-connection failed}"
  return 1
}

run_probe() {
  local failures=0
  local -a candidates=()

  if [[ -n "$HTTP_BASE_URL" ]]; then
    candidates+=("explicit|$HTTP_BASE_URL")
  else
    for ip in "${TAILNET_IPS[@]:-}"; do
      [[ -n "$ip" ]] || continue
      candidates+=("tailscale-ip:${ip}|http://${ip}:${SERVER_PORT}/")
    done

    if [[ -n "$MAGIC_DNS" ]]; then
      candidates+=("tailscale-https|https://${MAGIC_DNS}/")
    fi
  fi

  echo "devInstance=${DEV_INSTANCE} serverPort=${SERVER_PORT}"
  echo "magicDns=${MAGIC_DNS:-"(none)"} tailnetIpv4=${TAILNET_IPS[*]:-"(none)"}"

  if [[ "${#candidates[@]}" -eq 0 ]]; then
    echo "FAIL no candidate base URLs (pass --http-base-url or join Tailscale)"
    return 1
  fi

  local entry label base_url result ok=0
  for entry in "${candidates[@]}"; do
    label="${entry%%|*}"
    base_url="${entry#*|}"
    if result="$(probe_http "$base_url")"; then
      echo "OK ${label} base=${base_url} ${result}"
    else
      echo "FAIL ${label} base=${base_url} ${result}"
      failures=$((failures + 1))
      ok=1
    fi
  done

  [[ "$failures" -eq 0 ]]
}

attempt=1
while [[ "$attempt" -le "$REPEAT" ]]; do
  echo "--- tailscale remote probe attempt ${attempt}/${REPEAT} (${VARIANT}) ---"
  if run_probe; then
    exit 0
  fi
  if [[ "$attempt" -ge "$REPEAT" ]]; then
    exit 1
  fi
  attempt=$((attempt + 1))
  if [[ "$INTERVAL_MS" -gt 0 ]]; then
    sleep "$(awk "BEGIN { print ${INTERVAL_MS}/1000 }")"
  fi
done
