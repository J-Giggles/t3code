#!/bin/sh
# Ensure provider CLIs required in pod mode are on PATH (Codex for default agent).
set -eu

CODEX_PACKAGE="@openai/codex@latest"
CODEX_MARKER=/data/provider-cache/.codex-cli-ok

mkdir -p /data/provider-cache

if command -v codex >/dev/null 2>&1; then
  if [ ! -f "$CODEX_MARKER" ]; then
    touch "$CODEX_MARKER"
  fi
  exit 0
fi

if [ -f "$CODEX_MARKER" ]; then
  echo "[pod-cli] codex missing but marker present — reinstalling ${CODEX_PACKAGE}" >&2
  rm -f "$CODEX_MARKER"
fi

echo "[pod-cli] Installing Codex CLI (${CODEX_PACKAGE})…"
if npm install -g "$CODEX_PACKAGE"; then
  touch "$CODEX_MARKER"
else
  echo "[pod-cli] WARN: failed to install ${CODEX_PACKAGE}" >&2
  exit 0
fi

if command -v codex >/dev/null 2>&1; then
  codex --version 2>/dev/null || true
else
  echo "[pod-cli] WARN: codex still not on PATH after install" >&2
fi
