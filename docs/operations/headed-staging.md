# Headed Staging Verification

Use a visible T3 Code Staging Electron instance for UI verification when a change affects desktop, chat, settings, pairing, Tailscale, dev-launch, or mobile pairing flows.

## Launch

Use an isolated home/config/data root so staging does not reuse a personal desktop session:

```bash
export T3_STAGING_ROOT="${TMPDIR:-/tmp}/t3code-staging-electron"
mkdir -p "$T3_STAGING_ROOT"/{home,xdg-config,t3-home}

env \
  HOME="$T3_STAGING_ROOT/home" \
  XDG_CONFIG_HOME="$T3_STAGING_ROOT/xdg-config" \
  T3CODE_HOME="$T3_STAGING_ROOT/t3-home" \
  T3CODE_PORT_OFFSET=2000 \
  T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9332 \
  T3CODE_DEV_CHANGE_POLICY=manual \
  T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE=1 \
  T3CODE_DESKTOP_RESTART_ON_EXIT=1 \
  T3CODE_DISABLE_AUTO_UPDATE=1 \
  vp run dev:desktop
```

The default offset maps the backend to `15773` and the web app to `7733`; the dev runner may advance ports if either is busy. Check the dry run first when another local instance is active:

```bash
env \
  HOME="$T3_STAGING_ROOT/home" \
  XDG_CONFIG_HOME="$T3_STAGING_ROOT/xdg-config" \
  T3CODE_HOME="$T3_STAGING_ROOT/t3-home" \
  T3CODE_PORT_OFFSET=2000 \
  T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9332 \
  T3CODE_DEV_CHANGE_POLICY=manual \
  T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE=1 \
  T3CODE_DISABLE_AUTO_UPDATE=1 \
  node scripts/dev-runner.ts dev:desktop --dry-run
```

`T3CODE_DEV_CHANGE_POLICY=manual` keeps the running dev instance alive when T3
Code source, desktop artifacts, or server artifacts change. The supervisor
publishes a server lifecycle restart-required event and exposes a loopback-only
restart control endpoint. The Electron renderer and any authenticated
Vite/Tailscale HTTPS client connected to that backend should show the same
Restart toast.

The dev runner defaults T3 Code modes to `manual`. Set
`T3CODE_DEV_CHANGE_POLICY=auto` when you want the old immediate restart or Vite
hot-reload behavior. `T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE=1` remains a
backwards-compatible alias for manual mode during transition. Unsupported or
non-supervised servers do not advertise a clickable restart action.

`T3CODE_DESKTOP_RESTART_ON_EXIT=1` keeps headed development sessions alive after
the Electron process exits, including clean exits from closing the window. The
dev supervisor still stops normally when the supervising `vp run dev:desktop`
process receives `SIGINT`, `SIGTERM`, or `SIGHUP`.

The dev runner also starts the local observability hub unless
`T3CODE_LOCAL_OBSERVABILITY=0` is set. Open Grafana at
`http://127.0.0.1:3030` and filter logs/traces by `t3.worktree.role="staging"`
or by the isolated `T3CODE_HOME` path under `$T3_STAGING_ROOT`. The provisioned
dashboard is available at
`http://127.0.0.1:3030/d/t3code-local-observability/t3-code-local-observability?orgId=1`.

## Verification

Use product-native MCP tools for normal agent control. `preview_*` controls
websites/dev-server previews, and `app_*` controls the local T3 Code Electron
shell when the staging backend issues the `desktop-shell` capability.
The read-only `observability_*` MCP tools can inspect recent local hub errors
and fall back to the isolated staging trace/log files when LGTM is unavailable.

CDP is a staging inspection transport, not the normal agent API. For manual
headed staging, the fixed inspection port is `9332`:

```bash
curl -fsS http://127.0.0.1:9332/json/list
```

The automated E2E harness does not rely on the fixed manual port. It allocates
a unique Electron debugging port and discovers it from the isolated
`DevToolsActivePort` file under the E2E `XDG_CONFIG_HOME`.

Prefer screenshots that show the actual changed workflow and include both desktop and narrow/mobile-width checks when layout can wrap. For server state, inspect the isolated logs:

```bash
tail -f "$T3_STAGING_ROOT/t3-home/dev/logs/server.log"
```

For trace fallback state:

```bash
tail -f "$T3_STAGING_ROOT/t3-home/dev/logs/server.trace.ndjson"
```

Run the desktop smoke test against the isolated backend when relevant:

```bash
vp run build:desktop
env \
  HOME="$T3_STAGING_ROOT/home" \
  XDG_CONFIG_HOME="$T3_STAGING_ROOT/xdg-config" \
  T3CODE_HOME="$T3_STAGING_ROOT/t3-home" \
  T3CODE_PORT=15773 \
  T3CODE_DISABLE_AUTO_UPDATE=1 \
  vp run test:desktop-smoke
```

## Automated Electron E2E

Run the CI-safe headed smoke suite with:

```bash
vp run test:desktop-e2e:smoke
```

Run the full local suite against real desktop dependencies with:

```bash
T3CODE_E2E_ALLOW_TAILSCALE_MUTATION=1 \
T3CODE_E2E_ALLOW_PROVIDER_RUN=1 \
T3CODE_E2E_REQUIRE_EXTERNALS=1 \
vp run test:desktop-e2e:headed
```

The E2E launcher loads root `.env` and `.env.local` before spawning Playwright,
so local staging can also keep these opt-in flags there. Command-line
environment variables still take precedence. `T3CODE_WORKSPACE_SLUG` controls
the default desktop Tailscale Serve path when `T3CODE_TAILSCALE_SERVE_PATH` is
not explicitly set.

The E2E harness starts `node scripts/dev-runner.ts dev:desktop` with isolated
`HOME`, `XDG_CONFIG_HOME`, `T3CODE_HOME`, a unique port offset, and a unique
Electron CDP inspection port. On Linux without `DISPLAY`, the launcher re-execs
under `xvfb-run -a` when available. Set `T3CODE_E2E_KEEP_ARTIFACTS=1` to retain
the isolated home, logs, traces, and screenshots for inspection.

Full tests skip external flows unless their preflight succeeds. Tailscale Serve
route changes are only allowed when `T3CODE_E2E_ALLOW_TAILSCALE_MUTATION=1`.

## Live Public Staging Gate

The live Tailscale staging URL is not considered verified until a browser can
use the app end to end. Run:

```bash
T3CODE_STAGING_PUBLIC_URL="https://giggabit-server.tailfb378a.ts.net/staging/" \
vp run verify:staging-public
```

The command only passes after Chromium opens the public URL without a browser
error page, renders a non-empty app shell, finds at least one visible project,
creates a new chat from that project, sends `Hi`, and sees non-empty assistant
text in a timeline row before the composer returns to the send state. Failure
artifacts are written under `apps/desktop/test-results/staging-public/`.

The verifier also runs a network preflight from the primary non-tailnet
interface to the machine's Tailscale IPv4 address. This catches the same-host
browser failure where loopback or clean process checks succeed but Brave or
Chromium opens `https://giggabit-server.tailfb378a.ts.net/staging/` with
`ERR_CONNECTION_TIMED_OUT`. If that preflight fails, inspect
`network-preflight.json`, `ss -tnp`, and
`ip route get <tailnet-ip> oif <primary-interface>`. The Omarchy launcher
support script `~/.local/bin/t3code-tailscale-reconcile` repairs the expected
local route with `pkexec ip route replace local <tailnet-ip>/32 dev
<primary-interface> table local`.

## Current Scope Limit

This staging workflow is for the SQLite-backed T3 Code desktop/server stack. The Convex promotion, dual-main launcher, Hermes, and Convex replication workflow are not included in this port.
