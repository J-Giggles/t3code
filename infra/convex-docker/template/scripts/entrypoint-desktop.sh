#!/bin/sh
set -eu

export HOME=/data/t3code-home
export XDG_CONFIG_HOME=/data/provider-config
export CODEX_HOME="${CODEX_HOME:-/data/t3code-home/.codex}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-/dev/null}"
export CI=true
export WORKTREE_PATH=/workspace/t3code
export T3CODE_PROTECTED_WRITE_ROOTS=/workspace/t3code
cd /workspace/t3code
export PATH="/usr/local/bin:/workspace/t3code/node_modules/.bin:/root/.bun/bin:${PATH}"

if [ -f /opt/pod-scripts/install-pod-cli-tools.sh ]; then
  /bin/sh /opt/pod-scripts/install-pod-cli-tools.sh
fi

if [ "${POD_SLUG:-}" = "t3code-main" ]; then
  export T3CODE_DEV_INSTANCE=t3code-local-main
  export T3CODE_DESKTOP_VARIANT=local-main
else
  export T3CODE_DEV_INSTANCE=t3code-local-staging
  export T3CODE_DESKTOP_VARIANT=local-staging
fi

# Wait until xdpyinfo can reach the virtual display before starting x11vnc/Electron.
wait_for_x_display() {
  display="$1"
  max_attempts="${2:-120}"
  attempt=0
  while [ "$attempt" -lt "$max_attempts" ]; do
    if xdpyinfo -display "$display" >/dev/null 2>&1; then
      echo "[desktop] X display $display is ready (${attempt} waits)"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.25
  done
  echo "[desktop] ERROR: timed out waiting for X display $display" >&2
  return 1
}

if [ "${T3CODE_DESKTOP_DISPLAY:-novnc}" = "novnc" ]; then
  echo "[desktop] Starting Xvfb on :99 for noVNC (host DISPLAY=${DISPLAY:-unset} ignored)"
  Xvfb :99 -screen 0 1920x1080x24 -ac &
  export DISPLAY=:99
  wait_for_x_display ":99"
  if command -v autocutsel >/dev/null 2>&1; then
    echo "[desktop] Starting autocutsel for VNC clipboard sync"
    autocutsel -fork &
    autocutsel -selection PRIMARY -fork &
  fi
  if command -v x11vnc >/dev/null 2>&1; then
    echo "[desktop] Starting x11vnc on :5900 for noVNC"
    x11vnc -display :99 -forever -shared -nopw -listen 127.0.0.1 -rfbport 5900 -xkb &
  else
    echo "[desktop] WARN: x11vnc missing — noVNC will not connect" >&2
  fi
elif [ -z "${DISPLAY:-}" ]; then
  echo "[desktop] DISPLAY not set and novnc disabled; cannot start Electron" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
fi

export T3CODE_HOME="$HOME"
export T3CODE_CONTAINER_MODE=1
export T3CODE_OPEN_DEVTOOLS=0

if [ "${T3CODE_CONVEX_DOCKER:-}" = "1" ]; then
  export CONVEX_INTERNAL_URL="${CONVEX_INTERNAL_URL:-http://127.0.0.1:3210}"
  export CONVEX_INTERNAL_SITE_URL="${CONVEX_INTERNAL_SITE_URL:-http://127.0.0.1:3211}"
  export CONVEX_URL="$CONVEX_INTERNAL_URL"
  export CONVEX_SITE_URL="$CONVEX_INTERNAL_SITE_URL"
  export CONVEX_SELF_HOSTED_URL="$CONVEX_INTERNAL_URL"
fi

export HOST=0.0.0.0
export VITE_DEV_SERVER_URL="${VITE_DEV_SERVER_URL:-http://127.0.0.1:${CADDY_PORT:-8080}}"
export ELECTRON_EXTRA_LAUNCH_ARGS="--no-sandbox --ozone-platform=x11"

# Electron backend defaults to 127.0.0.1; published pod ports need 0.0.0.0.
mkdir -p /data/t3code-home/dev
node -e "
  const fs = require('fs');
  const settingsPath = '/data/t3code-home/dev/desktop-settings.json';
  const current = fs.existsSync(settingsPath)
    ? JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    : {};
  if (current.serverExposureMode !== 'network-accessible') {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ ...current, serverExposureMode: 'network-accessible' }, null, 2) + '\n',
    );
  }
" || echo "[desktop] WARN: could not seed desktop-settings.json" >&2

echo "[desktop] Building Electron main process bundle"
pnpm exec vp pack --filter @t3tools/desktop

echo "[desktop] Launching Electron (DISPLAY=$DISPLAY CDP=${CDP_PORT:-9232})"
exec pnpm exec vp run --filter @t3tools/desktop start -- \
  --remote-debugging-port="${CDP_PORT:-9232}" \
  --no-sandbox
