#!/usr/bin/env bash
# Pair against a path-prefixed Tailscale HTTPS staging backend and verify chat access.
#
# Usage:
#   ./.agents/scripts/t3-tailscale-pairing-e2e.sh staging
#   ./.agents/scripts/t3-tailscale-pairing-e2e.sh staging --http-base-url https://host.tail.ts.net/t3code-staging/
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VARIANT="${1:-}"
shift || true

HTTP_BASE_URL=""
T3_HOME="${T3CODE_STAGING_HOME:-$HOME/.local/share/t3code-local/staging}"
STATE_FILE="${T3CODE_TAILSCALE_ROUTING_STATE:-$HOME/.local/share/t3code-local/tailscale-routing.json}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --http-base-url)
      HTTP_BASE_URL="${2:?missing value after --http-base-url}"
      shift 2
      ;;
    --t3-home)
      T3_HOME="${2:?missing value after --t3-home}"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$VARIANT" != "staging" ]]; then
  echo "Usage: $0 staging [--http-base-url URL]" >&2
  exit 1
fi

WORKTREE="$ROOT/t3code-staging"

for cmd in tailscale jq curl bun; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required but not installed." >&2
    exit 1
  fi
done

normalize_serve_path() {
  local raw="$1"
  local path="${raw#/}"
  path="${path%/}"
  echo "/${path}"
}

resolve_https_base_from_routing_state() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "Missing Tailscale routing state at $STATE_FILE. Run ./.agents/scripts/t3-tailscale-staging-env.sh both first." >&2
    return 1
  fi

  local dns path port normalized
  dns="$(jq -r '.magicDns // empty' "$STATE_FILE")"
  path="$(jq -r '.stagingServePath // "/t3code-staging"' "$STATE_FILE")"
  port="$(jq -r '.httpsServePort // 443' "$STATE_FILE")"
  normalized="$(normalize_serve_path "$path")"

  if [[ -z "$dns" ]]; then
    dns="$(tailscale status --json | jq -r '.Self.DNSName // empty | sub("\\.$"; "")')"
  fi

  if [[ -z "$dns" ]]; then
    echo "MagicDNS unavailable; pass --http-base-url explicitly." >&2
    return 1
  fi

  if [[ "$port" == "443" ]]; then
    echo "https://${dns}${normalized}/"
  else
    echo "https://${dns}:${port}${normalized}/"
  fi
}

probe_environment_descriptor() {
  local base_url="$1"
  local trimmed="${base_url%/}"
  local code body body_file
  body_file="$(mktemp -t t3-tailscale-pairing-probe.XXXXXX)"
  local -a curl_args=(
    -sS
    --noproxy '*'
    -o "$body_file"
    -w '%{http_code}'
    --connect-timeout 5
    --max-time 15
  )
  if command -v ip >/dev/null 2>&1 && ip link show tailscale0 >/dev/null 2>&1; then
    curl_args+=(--interface tailscale0)
  fi
  code="$(curl "${curl_args[@]}" "${trimmed}/.well-known/t3/environment" 2>/dev/null || true)"
  body="$(head -c 160 "$body_file" 2>/dev/null || true)"
  rm -f "$body_file"
  if [[ "$code" =~ ^2 ]] || [[ "$body" == *'"environmentId"'* ]]; then
    echo "OK environment descriptor reachable (http ${code:-unknown})"
    return 0
  fi
  echo "FAIL environment descriptor unreachable (http ${code:-err}: ${body:-connection failed})" >&2
  return 1
}

echo "--- tailscale pairing e2e preflight (${VARIANT}) ---"

if ! "$ROOT/.agents/scripts/t3-verify.sh" staging >/dev/null; then
  echo "Staging stack is not healthy. Launch with ./.agents/scripts/t3-launch.sh staging --wait" >&2
  exit 1
fi
echo "OK staging stack healthy"

if ! "$ROOT/.agents/scripts/t3-tailscale-staging-env.sh" status >/dev/null 2>&1; then
  echo "WARN could not read Tailscale serve status; continuing"
fi

if [[ -z "$HTTP_BASE_URL" ]]; then
  HTTP_BASE_URL="$(resolve_https_base_from_routing_state)"
fi

HTTP_BASE_URL="${HTTP_BASE_URL%/}/"
echo "httpBaseUrl=${HTTP_BASE_URL}"

probe_environment_descriptor "$HTTP_BASE_URL"

SERVER_BIN="$WORKTREE/apps/server/src/bin.ts"
if [[ ! -f "$SERVER_BIN" ]]; then
  echo "Missing server CLI at $SERVER_BIN" >&2
  exit 1
fi

echo "Issuing pairing credential via server CLI…"
PAIRING_JSON="$(
  cd "$WORKTREE"
  T3CODE_HOME="$T3_HOME" \
  T3CODE_CONVEX_DATA_DIR="$WORKTREE/.local/convex" \
  CONVEX_URL="${CONVEX_URL:-http://127.0.0.1:3220}" \
  node "$SERVER_BIN" auth pairing create \
    --base-dir "$T3_HOME" \
    --base-url "$HTTP_BASE_URL" \
    --json
)"

CREDENTIAL="$(echo "$PAIRING_JSON" | jq -r '.credential // empty')"
PAIR_URL="$(echo "$PAIRING_JSON" | jq -r '.pairUrl // empty')"
if [[ -z "$CREDENTIAL" ]]; then
  echo "Failed to issue pairing credential:" >&2
  echo "$PAIRING_JSON" >&2
  exit 1
fi

if [[ -n "$PAIR_URL" ]]; then
  echo "pairUrl=${PAIR_URL}"
else
  echo "pairUrl=(not returned)"
fi

echo "Running client-runtime pairing flow…"
cd "$WORKTREE"
bun scripts/tailscale-pairing-e2e.ts \
  --http-base-url "$HTTP_BASE_URL" \
  --credential "$CREDENTIAL"

echo "OK tailscale pairing e2e passed"
