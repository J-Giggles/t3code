# Per-worktree remote dev workstation pods

Provision and run isolated Docker stacks (Postgres + Convex + T3 server/web) per git worktree.

## Quick start

```bash
# From workspace root
./.agents/scripts/t3-convex-docker.sh provision t3code-staging
./.agents/scripts/t3-convex-docker.sh up t3code-staging
./.agents/scripts/t3-convex-docker.sh keys t3code-staging
./.agents/scripts/t3-convex-docker.sh deploy t3code-staging
./.agents/scripts/t3-convex-docker.sh health t3code-staging
```

## Browser app, pairing, and code projects

1. Start desktop (server runs in `t3-desktop` when desktop profile is active):

   ```bash
   ./.agents/scripts/t3-convex-docker.sh desktop t3code-main start --novnc
   ```

2. Get the browser pairing URL (uses Caddy origin):

   ```bash
   ./.agents/scripts/t3-convex-docker.sh bootstrap-pairing-url t3code-main
   ```

3. Open the Caddy URL (e.g. `http://127.0.0.1:8081`), complete pairing, then create a project under `/workspace/code` (host `code/` folder).

4. Convex dashboard: open `http://127.0.0.1:6791` or `http://127.0.0.1:8081/dashboard/` and paste the admin key from `{worktree}/.local/convex-docker/admin.key` (after `keys` command).

**Note:** Pairing is per browser origin — `:8081` (Caddy) and `:8207` (direct Vite) are separate.

**Clipboard (noVNC desktop):** With the pod desktop running, **Ctrl+C** inside the VNC session copies to your host clipboard, and **Ctrl+V** pastes from the host into the container. The noVNC **Clipboard** panel is a fallback if browser permissions block auto-sync.

## With Tailscale

```bash
export TS_AUTHKEY=tskey-auth-...
./.agents/scripts/t3-convex-docker.sh provision t3code-staging
./.agents/scripts/t3-convex-docker.sh up t3code-staging
./.agents/scripts/t3-convex-docker.sh tailscale-status t3code-staging
```

## Desktop over SSH X11

```bash
tailscale ssh -Y user@t3code-staging
./.agents/scripts/t3-convex-docker.sh desktop t3code-staging start
```

## Project dev servers

```bash
./.agents/scripts/t3-convex-docker.sh dev-start t3code-staging my-app
./.agents/scripts/t3-convex-docker.sh dev-list t3code-staging
```

## Completion tests

```bash
./.agents/scripts/t3-convex-docker-verify.sh --suite quick
./.agents/scripts/t3-convex-docker-verify.sh --suite full --skip-manual
```

From staging worktree:

```bash
cd t3code-staging && pnpm run test:pod-completion
```

## Pod base image

`t3-stack` and `t3-desktop` build from `template/Dockerfile.t3-pod`. Override the Node/OS base at provision time:

```bash
POD_BASE_IMAGE=node:24-trixie-slim ./.agents/scripts/t3-convex-docker.sh provision t3code-staging
./.agents/scripts/t3-convex-docker.sh up t3code-staging --with-desktop
```

Default: `node:24-bookworm-slim`. Other official Node tags to try: `node:24-trixie-slim` (Debian testing), `node:24-bullseye-slim` (older Debian). There is no `node:24-noble-slim` on Docker Hub; for Ubuntu use `ubuntu:24.04` and install Node yourself.

## Layout

- `template/` — compose + Dockerfile + entrypoints
- `lib/provision.mjs` — per-worktree manifest + port allocation
- `.generated/{slug}/` — rendered compose (gitignored)

Manifest: `{worktree}/.local/convex-docker/manifest.json`

Admin keys are stored per manifest worktree (`t3code-main/.local/convex-docker/admin.key`), mounted into containers at `/pod-secrets/admin.key` (not from the mounted product code tree).

## Provider CLIs

Pod images install **Codex CLI** (`@openai/codex`) at build time and verify on boot via `install-pod-cli-tools.sh`. Codex OAuth is required for live model responses — the CLI alone clears the “not on PATH” provider error.

### Codex login in pods (headless)

Do **not** copy `auth.json` from the host into the pod — sharing refresh tokens revokes them on both sides.

From a pod terminal (or `docker exec` with `HOME=/data/t3code-home`):

```bash
HOME=/data/t3code-home codex login --device-auth
```

1. Open https://auth.openai.com/codex/device in your **host** browser.
2. Enter the one-time code from the terminal.
3. In T3 Code → **Settings → Providers → Refresh provider status**.

Plain `codex login` (browser callback to `localhost:1455`) does not work inside the container.

The pod sets `CODEX_HOME=/data/t3code-home/.codex` and `HOME=/data/t3code-home` so CLI auth matches the T3 server process.
