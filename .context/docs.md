# T3 Code Local — agent reference

Last refreshed: 2026-06-06T14:42:29+0100

## Omarchy launcher

| Walker name | Desktop file | WM class | Data dir |
|-------------|--------------|----------|----------|
| T3code | `t3code-local-main.desktop` | `t3code` → `t3code-local-main` | `~/.local/share/t3code-local/main` |
| T3code Staging | `t3code-local-staging.desktop` | `t3code-local-staging` | `~/.local/share/t3code-local/staging` |
| T3code Dev | `t3code-local-dev.desktop` | `t3code dev` → `t3code-local-dev` | (starts main + staging) |

Binaries: `~/.local/bin/t3code`, `t3code-local-{main,staging,dev}`. Logs: `{t3Home}/logs/runtime.log`, symlink `latest.log`.

Install/regenerate from staging worktree:

```bash
cd t3code-staging && bun run install:local-launchers
```

Source of truth: `t3code/scripts/local-desktop-launchers.ts`, `install-local-desktop-launchers.ts`.

## Dev ports

`T3CODE_DEV_INSTANCE` is hashed in `t3code/scripts/dev-runner.ts` to pick offsets from base ports **5733** (web) and **13773** (server). Typical URLs after launch:

- **main:** `http://127.0.0.1:8207` (web), server ~16247
- **staging:** `http://127.0.0.1:6657` (web), server ~14697

If ports are busy, the dev runner bumps offsets; read the latest `~/.local/share/t3code-local/{main|staging}/logs/startup-*.log` or run `t3-verify.sh`.

## Seeing the app (agents)

Agent launch (`t3-launch.sh`) sets `T3CODE_AGENT_AUTOMATION=1` and enables CDP:

| App | CDP port | agent-browser |
|-----|----------|---------------|
| main | 9222 | `agent-browser connect 9222` |
| staging | 9232 | `agent-browser connect 9232` |

1. **Electron CDP (preferred after agent launch):** `./.agents/scripts/t3-verify.sh main|staging`
2. **Vite fallback:** same script opens `VITE_DEV_SERVER_URL` if CDP is unavailable
3. **Screenshot:** add `--screenshot /tmp/t3.png` (requires `hyprctl` + `grim` on Hyprland)

`~/.local/share/t3code-local/{main|staging}/agent-automation.json` records the active CDP port.

User launchers open a **Ghostty** startup terminal and keep it open until Enter — agents must set `T3CODE_DISABLE_STARTUP_TERMINAL=1` or use `t3-launch.sh`.

## Branch workflow

- Default edits: `t3code-staging/`
- Live app: `t3code/` on `main`
- Promotion staging → main is **manual only** (terminal merge or in-app toast); agents must not auto-merge
- Main runs **stable** dev stack (`T3CODE_DEV_STACK=stable`): build-once, no HMR/Electron restarts until relaunch after promotion
- Staging is a **read-only mirror** of main activity (Convex event follower + projection snapshots); dispatch blocked unless `T3CODE_STAGING_ALLOW_DISPATCH=1`
- When staging is clean and ahead of main, both instances can show a promotion toast with **Relaunch main with updates**

See `t3code-staging/docs/t3code-local.md` and `t3code/.agents/rules/t3code-local-workflow.md`.

## Launch speed (2026-06)

Walker launchers default to **`T3CODE_LAUNCH_FAST=1`**: minimal startup UI, skip upstream notifications, faster relaunch lock polling (no fixed 2s sleep), skip Convex `dev --once` push when reusing port 3210, prefer `bun` over `mise exec`.
- Deps: skip `dev-runner --dry-run` when `bun.lock` is not newer than `node_modules/@t3tools/monorepo`.
- Override: unset `T3CODE_LAUNCH_FAST` for full clack preflight; unset `T3CODE_CONVEX_SKIP_PUSH_ON_REUSE` to push Convex functions every relaunch.

## Tailscale remote testing (main + staging)

Tailscale Serve can expose **both** local instances at once on the same MagicDNS name using path prefixes on HTTPS 443:

| App | Tailscale HTTPS | Local server |
|-----|-----------------|--------------|
| Main | `https://<machine>.<tailnet>.ts.net/t3code-main/` | `main/dev/server-runtime.json` port |
| Staging | `https://<machine>.<tailnet>.ts.net/t3code-staging/` | `staging/dev/server-runtime.json` port |

**Dual setup (recommended):**

```bash
./.agents/scripts/t3-tailscale-staging-env.sh both
./.agents/scripts/t3-tailscale-staging-env.sh status
./.agents/scripts/t3-tailscale-staging-env.sh probe --repeat 10 --interval-ms 2000
./.agents/scripts/t3-tailscale-staging-env.sh down-staging   # remove staging route only
```

The script writes `network-accessible` desktop settings and manages Tailscale Serve paths externally (avoids each app overwriting the other's route). Pair mobile using each path-prefixed **Tailscale HTTPS** URL — not raw `100.x` IPs.

HTTP probe: `./.agents/scripts/t3-tailscale-remote-probe.sh staging --http-base-url https://host/t3code-staging/`

## Fallow (dual-worktree)

When the Cursor workspace root is `t3code-local/`, Fallow must not treat `t3code/` and `t3code-staging/` as one project — every clone would be a false cross-worktree duplicate.

- Config: `.fallowrc.jsonc` at workspace root ignores `t3code/**` and scopes analysis to `t3code-staging/`
- VS Code/Cursor: `.vscode/settings.json` sets `fallow.configPath` to `${workspaceFolder}/.fallowrc.jsonc`
- Optional: open `t3code-local.code-workspace` so Cursor always loads that config at the workspace root
- After config changes: Command Palette → **Fallow: Restart Language Server**

If you open a single worktree folder directly (`t3code-staging/` only), Fallow auto-discovers that repo root and does not need the workspace ignore rule.

## Agent-maintained notes

- **Anonymous local Convex (2026-06):** Shared data at `~/.local/share/t3code-local/convex/`. All `convex dev` / `--once` spawns must set `CONVEX_AGENT_MODE=anonymous` when `CONVEX_DEPLOYMENT` starts with `anonymous:` (via `withLocalAnonymousConvexCliEnv` in `packages/convex/scripts/convex-shared-deployment.mjs`) or the CLI blocks on an account-link prompt and startup hangs. Cold boot of a large shared SQLite DB can take ~1–2 minutes; ready marker is written after `GET /version` succeeds.
- **Fixed local desktop ports (2026-06):** `scripts/local-desktop-env.ts` defines stable main/staging URLs (web/server/CDP). `t3-start.sh`, `t3-launch.sh`, and `local-desktop-launcher-run.ts` call `free-local-desktop-ports.ts` before launch; `dev-runner` keeps hashed offsets for `t3code-local-main` / `t3code-local-staging` instead of bumping when ports are busy.
- **T3code Dev solo-launch guard (2026-06):** While `t3code-local-dev.bundle.pid` points at a live dev-bundle supervisor, solo `main`/`staging` launches prompt to quit Dev and relaunch (clack confirm / `[y/N]`). Pass `--force-relaunch` or `T3CODE_FORCE_SOLO_LAUNCH=1` to skip the prompt (required for agent launches).

- Project memory convention: use `.context/docs.md` for durable project facts and `.cursor/rules/*.mdc` only for actionable Cursor instructions; agents should propose Memory Candidates with evidence and confidence before writing new memory.
- **Local Convex (2026-06):** Walker **T3code** and **T3code Staging** set `T3CODE_PERSISTENCE=convex` and share one local backend data dir: `~/.local/share/t3code-local/convex/` (port `3210` from `packages/convex/.env.local`). Per-instance `T3CODE_HOME` (`main` / `staging`) still isolates logs and desktop settings. `bun run dev` runs `@t3tools/convex#dev` + web + desktop; `convex-dev.mjs` reuses a healthy backend on 3210 or starts a new one. SQLite → Convex import: `bun run migrate:sqlite-to-convex -- --preset local-main|local-staging --backup`.
