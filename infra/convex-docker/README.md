# Per-worktree remote dev workstation pods

Provision and run isolated Docker stacks (Postgres + Convex + T3 server/web) per git worktree.

## Quick start

```bash
# From workspace root — start stack + open browser (recommended)
pnpm run apps              # main pod (Caddy :8081, noVNC, pairing)
pnpm run apps:staging      # staging pod (Caddy :8080, noVNC, pairing)

# Or step by step:
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

### Why pairing repeats (read this before wiping pod volumes)

Pairing links a **browser origin** to a **server session** in the pod's Postgres + `t3code_home` volumes. You must pair again when:

- Agents run `destroy` or `docker volume rm` during tests (common — wipes auth state)
- You open raw Vite (`:6657` / `:8207`) instead of Caddy (`:8080` / `:8081`)
- Convex gets a fresh database (cold `up` after volume delete)

**Agent fix:** after pod start, always run and open:

```bash
./.agents/scripts/t3-convex-docker.sh bootstrap-pairing-url t3code-staging
# or: pnpm run pod:pair
```

`pnpm run pod:open` opens the pairing URL automatically when the stack is ready. Use `down` (not `destroy`) to stop pods without losing pairing.

See `.cursor/rules/convex-docker-pod-pairing.mdc` for full agent instructions.

**Clipboard (noVNC desktop):** With the pod desktop running, **Ctrl+C** inside the VNC session copies to your host clipboard, and **Ctrl+V** pastes from the host into the container. The noVNC **Clipboard** panel is a fallback if browser permissions block auto-sync.

## With Tailscale

Pod images include the **Tailscale CLI**; the **tailscale sidecar** provides the daemon when an auth key is configured.

1. Save a one-line auth key (never commit):

   ```bash
   mkdir -p ~/.local/share/t3code-local/convex-docker
   cp infra/convex-docker/template/ts-authkey.example ~/.local/share/t3code-local/convex-docker/ts-authkey
   # edit ts-authkey — replace with your tskey-auth-...
   ```

2. Re-provision (reads key from env, `~/.local/share/t3code-local/convex-docker/ts-authkey`, or `{worktree}/.local/convex-docker/ts-authkey`):

   ```bash
   ./.agents/scripts/t3-convex-docker.sh provision t3code-staging
   ./.agents/scripts/t3-convex-docker.sh up t3code-staging
   ./.agents/scripts/t3-convex-docker.sh tailscale-status t3code-staging
   ```

Or export for one session:

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

Pod images install at **build time** and verify on boot via `install-pod-cli-tools.sh`:

| Tool | Image | Runtime |
|------|-------|---------|
| **Codex CLI** (`@openai/codex`) | `Dockerfile.t3-pod` | `/usr/local/bin/codex` — clears “not on PATH” provider error |
| **Tailscale CLI** | `Dockerfile.t3-pod` | `/usr/bin/tailscale` — talks to sidecar via `/var/run/tailscale/tailscaled.sock` |

Tailscale **networking** requires the sidecar profile (`TS_AUTHKEY` or `ts-authkey` file at provision). LOCAL_ONLY pods still have both CLIs on PATH.

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
