#!/bin/sh
# Ensure provider CLIs required in pod mode are on PATH (Codex + Tailscale).
set -eu

CODEX_PACKAGE="@openai/codex@latest"
CODEX_MARKER=/data/provider-cache/.codex-cli-ok
TAILSCALE_MARKER=/data/provider-cache/.tailscale-cli-ok
TS_SOCKET="${TS_SOCKET:-/var/run/tailscale/tailscaled.sock}"

mkdir -p /data/provider-cache

ensure_codex() {
  if command -v codex >/dev/null 2>&1; then
    touch "$CODEX_MARKER"
    codex --version 2>/dev/null || true
    return 0
  fi

  if [ -f "$CODEX_MARKER" ]; then
    echo "[pod-cli] codex missing but marker present — reinstalling ${CODEX_PACKAGE}" >&2
    rm -f "$CODEX_MARKER"
  fi

  echo "[pod-cli] Installing Codex CLI (${CODEX_PACKAGE})…"
  if npm install -g "$CODEX_PACKAGE"; then
    touch "$CODEX_MARKER"
    codex --version 2>/dev/null || true
    return 0
  fi

  echo "[pod-cli] ERROR: failed to install ${CODEX_PACKAGE}" >&2
  return 0
}

ensure_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then
    touch "$TAILSCALE_MARKER"
    tailscale version 2>/dev/null || true
  else
    echo "[pod-cli] WARN: tailscale CLI missing from pod image — rebuild t3-stack/t3-desktop" >&2
    return 0
  fi

  if [ -S "$TS_SOCKET" ]; then
    if TS_SOCKET="$TS_SOCKET" tailscale status --json >/dev/null 2>&1; then
      echo "[pod-cli] tailscale daemon reachable at $TS_SOCKET"
    else
      echo "[pod-cli] WARN: tailscale socket present but status failed (sidecar may still be joining)" >&2
    fi
  else
    echo "[pod-cli] tailscale CLI ready (no daemon socket — LOCAL_ONLY or sidecar not started)"
  fi
  return 0
}

ensure_codex
ensure_tailscale
