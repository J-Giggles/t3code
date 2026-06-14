#!/bin/sh
set -eu

NOVNC_SRC=/usr/share/novnc
NOVNC_WEB=/tmp/novnc-web
NOVNC_PORT="${NOVNC_PORT:-6080}"

rm -rf "$NOVNC_WEB"
cp -a "$NOVNC_SRC/." "$NOVNC_WEB/"
cp /opt/pod-novnc/clipboard-bridge.js "$NOVNC_WEB/app/clipboard-bridge.js"

if ! grep -q 'clipboard-bridge.js' "$NOVNC_WEB/vnc.html"; then
  sed -i 's|</body>|    <script type="module" src="app/clipboard-bridge.js"></script>\n </body>|' "$NOVNC_WEB/vnc.html"
fi

echo "[novnc] Serving noVNC on :${NOVNC_PORT} with host clipboard bridge"
exec websockify --web "$NOVNC_WEB" "$NOVNC_PORT" 127.0.0.1:5900
