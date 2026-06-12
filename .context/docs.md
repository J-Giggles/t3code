# T3 Code Local — agent reference

Last refreshed: 2026-06-12T16:12:13+0100

## Omarchy launcher

| Walker name | Desktop file | WM class | Data dir |
|-------------|--------------|----------|----------|
| T3code | `t3code-local-main.desktop` | `t3code` → `t3code-local-main` | `~/.local/share/t3code-local/main` |
| T3code Staging | `t3code-local-staging.desktop` | `t3code-local-staging` | `~/.local/share/t3code-local/staging` |
| T3code Dev | `t3code-local-dev.desktop` | `t3code dev` → `t3code-local-dev` | (starts main + staging) |

Binaries: `~/.local/bin/t3code`, `t3code-local-{main,staging,dev}`. Logs: `{t3Home}/logs/runtime.log`, symlink `latest.log`.

Install/regenerate from staging worktree:

```bash
cd t3code-staging && pnpm run install:local-launchers
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
- Staging is a **read-only mirror** of main activity (separate Convex on 3220, seeded from main, incremental event follower); dispatch blocked unless `T3CODE_STAGING_ALLOW_DISPATCH=1`
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

- **Desktop persistence default (2026-06-11):** Runtime default is `T3CODE_PERSISTENCE=convex` — orchestration, projections, auth, attachments, client state, and server settings use local Convex via `ConvexHttpClient`. `dual` is migration/tests only (SQLite + Convex). Legacy SQLite tree remains but normal launchers/agents do not set `dual`. Server settings: Convex `serverSettings` table is primary with `settings.json` mirror (ported from main). Auth Convex schema uses `scopesJson` + optional `proofKeyThumbprint` on pairing links (not legacy `role`).
- **Relay vs desktop DB (2026-06-11):** `infra/relay` (staging-only until promote) uses PlanetScale Postgres for T3 Connect cloud control plane (environment links, mobile push, DPoP). Desktop orchestration source of truth stays in local Convex; relay agent-activity rows are a derived cache fed by `AgentAwarenessRelay` HTTP publish — not stored in Convex or `state.sqlite`.
- **SQLite removal deferred (2026-06-11):** Phase 4 aggressive cleanup (delete SQL repos, dual-write, migrations) deferred until runtime Convex path is verified stable; keep `migrate:sqlite-to-convex` and `@sqlite-legacy` tests until explicit sign-off.
- **Convex data in worktrees (2026-06-10):** Main SQLite state at `t3code/.local/convex` (3210); staging at `t3code-staging/.local/convex` (3220). Promotion/migration archives under each worktree's `db-backups/` (auto-prune keeps 2 `pre-promotion-*` dirs). One-time migration: `cd t3code-staging/packages/convex && pnpm run migrate-to-worktree`. `T3CODE_HOME` (logs/Electron) stays at `~/.local/share/t3code-local/{main|staging}`.
- **Agent launch = Walker Exec (2026-06-10):** `t3-launch.sh` runs `~/.local/bin/t3code-local-{main|staging|dev}` with only `T3CODE_DISABLE_STARTUP_TERMINAL=1` added (same binary as Walker `.desktop` Exec). Dev relaunch skips pre-port-free (handled in `local-desktop-dev-run.ts`). Verify Convex: `./.agents/scripts/t3-verify.sh staging --convex` (uses `convex-status.mjs`, 300s timeout for cold boot).
- **Convex prune retention (2026-06-10):** Fork/edit/fork-from-message depend on **never pruning** `threadMessages` + `turns`. Safe to prune ephemeral `threadActivities` kinds (`tool.updated`, `context-window.updated`, …) via `cd t3code-staging/packages/convex && pnpm run prune-local [--dry-run] [main|staging|both]`. Staging launcher sets `T3CODE_CONVEX_SKIP_EPHEMERAL_ACTIVITIES=1` so new streaming noise is not persisted. Policy module: `@t3tools/convex/pruneRetention`. SQLite file may not shrink until a separate VACUUM pass; most bulk is still `tool.completed` payloads (storage-audit follow-up).

- **Anonymous local Convex (2026-06):** Data dirs are per worktree (see above). All `convex dev` / `--once` spawns must set `CONVEX_AGENT_MODE=anonymous` when `CONVEX_DEPLOYMENT` starts with `anonymous:` (via `withLocalAnonymousConvexCliEnv` in `packages/convex/scripts/convex-shared-deployment.mjs`) or the CLI blocks on an account-link prompt and startup hangs. Cold boot of a large SQLite DB can take ~1–2 minutes; ready marker is written after `GET /version` succeeds. Backend watchdog in `convex-dev.mjs` clears stale markers and restarts a dead `convex-local-backend`.
- **Fixed local desktop ports (2026-06):** `scripts/local-desktop-env.ts` defines stable main/staging URLs (web/server/CDP). `t3-start.sh`, `t3-launch.sh`, and `local-desktop-launcher-run.ts` call `free-local-desktop-ports.ts` before launch; `dev-runner` keeps hashed offsets for `t3code-local-main` / `t3code-local-staging` instead of bumping when ports are busy.
- **T3code Dev solo-launch guard (2026-06):** While `t3code-local-dev.bundle.pid` points at a live dev-bundle supervisor, solo `main`/`staging` launches prompt to quit Dev and relaunch (clack confirm / `[y/N]`). Pass `--force-relaunch` or `T3CODE_FORCE_SOLO_LAUNCH=1` to skip the prompt (required for agent launches).
- **Dev attach + staging isolation (2026-06):** `start:dev` probes main health; when healthy it keeps main processes and starts staging Turbo tasks only (`local-desktop-dev-bundle-attach.ts`). Solo `start:staging` tears down staging only (`tearDownDevBundleForSoloRelaunch({ preserveVariant: "main" })`). `free-local-desktop-ports.ts dev` frees staging ports only in attach mode. Env: `T3CODE_DEV_ATTACH_MAIN=1` (force attach), `T3CODE_DEV_FORCE_FULL_RELAUNCH=1` (kill both). Staging desktop promotion relaunches staging with attach; **main** promotion (including Tailscale mobile `POST /t3code-main/api/local/promotion-apply`) merges and relaunches main via `promotion-relaunch-request.json` + desktop watcher.

- **Tailscale path-prefixed pairing E2E (2026-06-11):** After dual-path Serve setup (`./.agents/scripts/t3-tailscale-staging-env.sh both`), verify path-preserved remote auth + orchestration over staging with `./.agents/scripts/t3-tailscale-pairing-e2e.sh staging`. Reads `~/.local/share/t3code-local/tailscale-routing.json` for `https://{magicDns}/t3code-staging/` unless `--http-base-url` is passed. Bun helper: `t3code-staging/scripts/tailscale-pairing-e2e.ts`.

- Project memory convention: use `.context/docs.md` for durable project facts and `.cursor/rules/*.mdc` only for actionable Cursor instructions; agents should propose Memory Candidates with evidence and confidence before writing new memory.
- **Local Convex promotion (2026-06):** Default promotion **pushes merged Convex code/schema to the existing main backend** (`convex-promotion-push.mjs`) and **preserves main SQLite data**. Full staging→main SQLite replace is **opt-in only** via `T3CODE_PROMOTION_COPY_CONVEX_DB=1` (`convex-promotion-sync.mjs`, stops both backends, integrity checks, backup to `db-backups/pre-promotion-{ts}/`). Manual `t3code-main` upgrades: `git merge staging` + `pnpm run dev` — never run promotion sync unless you intentionally want staging's data on main. Launcher reconciliation rewrites deployment identity when package `.env.local` disagrees with shared `config.json`.
- **Local Convex daily workflow (2026-06-10):** Walker fast relaunch (`T3CODE_LAUNCH_FAST=1`, `T3CODE_CONVEX_SKIP_PUSH_ON_REUSE=1`) is the default for UI/server/desktop edits. After changing `packages/convex/convex/**` or `schema.ts`, run `cd t3code-staging/packages/convex && pnpm run push-local-staging` before trusting the app. Promotion pushes schema to main (not full DB copy by default); main may cold-boot ~1–2 min on large DB after relaunch.
- **Portability / Docker (2026-06-10):** Full desktop stack stays Omarchy-native (Walker, Hyprland, Electron CDP). `.devcontainer/` is lint/install only. Other Linux PCs: `install:local-launchers` + same worktree layout; Tailscale for remote. Defer full Docker unless CI or headless server-only dev is required.
- **Promotion relaunch hardening (2026-06-10):** Main promotion in dev mode can trigger a dev-electron restart storm when tsdown cleans `dist-electron/main.cjs` during merge rebuilds; detached promotion spawns can leave orphan `local-desktop-launcher-run.ts` processes at high CPU. Mitigations: `relaunch-quiesce.json` under `$T3CODE_HOME`, coordinated relaunch via detached `gtk-launch` with `T3CODE_TURBO_UI=stream` + `T3CODE_LAUNCH_FAST=1`, Dev-bundle gate on main promotion (`T3CODE_PROMOTION_FORCE_FULL_RELAUNCH=1` to override). Remote recovery: `GET /api/local/stack-health`, `POST /api/local/stack-recover`, `GET /api/local/recover` (HTML), CLI `./.agents/scripts/t3-recover.sh health|kill-orphans|clear-locks|relaunch main|staging|dev`. **Auto-repair:** `POST /api/local/stack-auto-repair` restores main from `promotion-pre-snapshot.json`, clears orphans/locks, schedules main relaunch (HTTP returns before kill); on new main server boot, `finalizePromotionAutoRepair` queues skill `promotion-stack-repair` via `promotion-repair-agent-request.json` + `t3-agent-repair-promotion.sh`. Optional `retryPromotion: true` after readiness gates pass. CLI: `./.agents/scripts/t3-recover.sh auto-repair [retry]`.
