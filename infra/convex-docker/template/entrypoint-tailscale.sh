#!/bin/sh
set -eu

/start.sh &
TS_PID=$!

deadline=$(( $(date +%s) + 120 ))
while ! tailscale status >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "[tailscale] Timed out waiting for tailscaled" >&2
    exit 1
  fi
  sleep 1
done

if [ -n "${TS_AUTHKEY:-}" ]; then
  tailscale up --authkey="$TS_AUTHKEY" --hostname="${TS_HOSTNAME:-t3code-pod}" ${TS_EXTRA_ARGS:-}
else
  echo "[tailscale] TS_AUTHKEY not set — local-only mode; skipping tailscale up" >&2
fi

if [ "${TAILSCALE_SERVE:-1}" = "1" ] && tailscale status --json 2>/dev/null | grep -q '"Online":true'; then
  tailscale serve reset 2>/dev/null || true
  tailscale serve --bg --https=443 "http://127.0.0.1:${CADDY_PORT:-8080}" || true
  echo "[tailscale] serve configured on :443 -> caddy :${CADDY_PORT:-8080}"
fi

wait "$TS_PID"
