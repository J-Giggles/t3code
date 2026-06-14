#!/bin/sh
set -eu

export T3CODE_HOME=/data/t3code-home
export HOME="$T3CODE_HOME"
export XDG_CONFIG_HOME=/data/provider-config
export CODEX_HOME="${CODEX_HOME:-/data/t3code-home/.codex}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-/dev/null}"
export CI=true
export WORKTREE_PATH=/workspace/t3code
export T3CODE_PROTECTED_WRITE_ROOTS=/workspace/t3code
mkdir -p "$HOME" "$XDG_CONFIG_HOME" /data/provider-cache

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

# Pod network shares the backend namespace; Convex listens on :3210/:3211 inside, not host-published ports.
if [ "${T3CODE_CONVEX_DOCKER:-}" = "1" ]; then
  export CONVEX_INTERNAL_URL="${CONVEX_INTERNAL_URL:-http://127.0.0.1:3210}"
  export CONVEX_INTERNAL_SITE_URL="${CONVEX_INTERNAL_SITE_URL:-http://127.0.0.1:3211}"
  export CONVEX_URL="$CONVEX_INTERNAL_URL"
  export CONVEX_SITE_URL="$CONVEX_INTERNAL_SITE_URL"
  export CONVEX_SELF_HOSTED_URL="$CONVEX_INTERNAL_URL"
  export VITE_CONVEX_URL="$CONVEX_INTERNAL_URL"
fi

if [ ! -d node_modules ] || [ ! -f node_modules/.pod-deps-ok ]; then
  echo "[t3-stack] Installing monorepo dependencies (first boot)…"
  if CI=true pnpm install --frozen-lockfile; then
    touch node_modules/.pod-deps-ok
  else
    echo "[t3-stack] WARN: pnpm install failed — retrying without frozen lockfile" >&2
    CI=true pnpm install && touch node_modules/.pod-deps-ok
  fi
fi

# Resolve pod admin key (manifest worktree), not mounted product code tree.
ADMIN_KEY_FILE=/pod-secrets/admin.key
if [ ! -f "$ADMIN_KEY_FILE" ] && [ -f /workspace/t3code/.local/convex-docker/admin.key ]; then
  ADMIN_KEY_FILE=/workspace/t3code/.local/convex-docker/admin.key
fi

if [ -f "$ADMIN_KEY_FILE" ]; then
  export CONVEX_SELF_HOSTED_ADMIN_KEY="$(tr -d '\n\r' <"$ADMIN_KEY_FILE")"
  if [ -z "$CONVEX_SELF_HOSTED_ADMIN_KEY" ] || [ "$CONVEX_SELF_HOSTED_ADMIN_KEY" = "run-keys-command-to-generate" ]; then
    echo "[t3-stack] WARN: admin key missing or placeholder — run: t3-convex-docker.sh keys ${POD_SLUG:-<slug>}" >&2
  else
    export CONVEX_SELF_HOSTED_URL="${CONVEX_INTERNAL_URL:-http://127.0.0.1:3210}"
    mkdir -p /data/t3code-home/convex/local/default
    node -e "
      const fs = require('fs');
      const key = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
      const slug = process.env.POD_SLUG || 't3code-staging';
      const cfgPath = '/data/t3code-home/convex/local/default/config.json';
      const cloud = process.env.T3CODE_CONVEX_DOCKER === '1'
        ? 3210
        : Number(process.env.CONVEX_SELF_HOSTED_URL?.split(':').pop() || 3210);
      const site = process.env.T3CODE_CONVEX_DOCKER === '1'
        ? 3211
        : Number(process.env.CONVEX_SITE_URL?.split(':').pop() || 3211);
      const cfg = {
        adminKey: key,
        deploymentName: slug,
        ports: { cloud, site },
      };
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
    " || echo "[t3-stack] WARN: could not write convex config.json" >&2
    if command -v bun >/dev/null 2>&1; then
      printf 'CONVEX_SELF_HOSTED_URL=%s\nCONVEX_SELF_HOSTED_ADMIN_KEY=%s\n' \
        "${CONVEX_INTERNAL_URL:-http://127.0.0.1:3210}" \
        "$CONVEX_SELF_HOSTED_ADMIN_KEY" > /tmp/convex-pod-deploy.env
      if (cd packages/convex && bunx convex deploy --typecheck disable --env-file /tmp/convex-pod-deploy.env); then
        echo "[t3-stack] Convex functions deployed to ${CONVEX_INTERNAL_URL:-http://127.0.0.1:3210}"
      else
        echo "[t3-stack] WARN: convex deploy failed — run: t3-convex-docker.sh deploy ${POD_SLUG:-<slug>}" >&2
      fi
    fi
  fi
fi
# Start dev-manager for project dev servers
node /opt/pod-scripts/dev-manager.mjs watch &
DEV_MGR_PID=$!

# Browser stack: server + web (no electron in default stack service)
STACK_MODE="dev:browser"
if [ "${T3CODE_POD_WITH_DESKTOP:-0}" = "1" ]; then
  STACK_MODE="dev:pod-web"
  echo "[t3-stack] Desktop profile active — convex + web only (Electron owns :${SERVER_PORT:-14697})"
else
  echo "[t3-stack] Starting server on :${SERVER_PORT:-14697} and web on :${WEB_PORT:-6657}"
fi
# Vite defaults to localhost (::1); published pod ports and Caddy need 0.0.0.0.
export HOST=0.0.0.0
T3CODE_CONTAINER_MODE=1 \
T3CODE_CONVEX_DOCKER=1 \
T3CODE_PERSISTENCE=convex \
T3CODE_CONVEX_SKIP_PUSH_ON_REUSE=1 \
T3CODE_PROTECTED_WRITE_ROOTS=/workspace/t3code \
  node scripts/dev-runner.ts "$STACK_MODE" &
RUNNER_PID=$!

cleanup() {
  kill "$DEV_MGR_PID" "$RUNNER_PID" 2>/dev/null || true
}
trap cleanup INT TERM

wait "$RUNNER_PID"
