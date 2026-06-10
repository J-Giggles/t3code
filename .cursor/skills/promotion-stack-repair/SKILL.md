---
name: promotion-stack-repair
description: Repair local main desktop stack after a failed promotion relaunch. Use when promotion-repair-agent-request.json exists, stack-auto-repair ran, or main is stuck on Starting local backend after promote.
---

# Promotion stack repair

You are repairing **T3 Code Local** after a failed **Promote & Relaunch Main** (or equivalent HTTP/mobile promotion).

## Context

- Product changes live in **`t3code-staging/`** on branch `staging` only.
- Main worktree **`t3code/`** is the live app — do not edit unless the user explicitly asks to promote.
- Auto-repair may have already: reset main git to `promotion-pre-snapshot.json`, killed orphan launchers, cleared locks, and scheduled a main relaunch.

## Your job

1. Read `~/.local/share/t3code-local/main/promotion-repair-agent-request.json` if present (health snapshot + startup log tail + blockers).
2. Read latest `~/.local/share/t3code-local/main/logs/startup-*.log` and confirm no `main.cjs` restart storm.
3. Fix root cause in **`t3code-staging`** (quiesce, coordinated relaunch, orphan janitor, stack-health gates) — minimal diff.
4. Verify:
   - `cd t3code-staging && bun fmt && bun lint`
   - Focused Vitest on touched `apps/server/src/local/*`
   - `cd /path/to/t3code-local && ./.agents/scripts/t3-verify.sh staging`
5. Append durable gotcha to `.context/docs.md` if you learn something stable.
6. **Do not** merge to main or run promotion unless the user explicitly asks in this thread.

## Readiness gates (must pass before promotion retry)

- `serverReady` + `webReady` + `convexReady`
- No orphan launcher PIDs
- No active `relaunch-quiesce.json`
- Not blocked by T3code Dev bundle when promoting main

Check via:

```bash
./.agents/scripts/t3-recover.sh health main
./.agents/scripts/t3-recover.sh auto-repair-status
```

## API reference (reachable while server is up)

- `GET /api/local/stack-health`
- `GET /api/local/stack-auto-repair/status`
- `POST /api/local/stack-auto-repair` — `{ "reason": "...", "retryPromotion": false }`
- `POST /api/local/stack-auto-repair/finalize` — after relaunch when healthy

## Prevention checklist

- [ ] `dev-electron.mjs` respects quiesce during tsdown rebuilds
- [ ] Detached promotion spawns use `T3CODE_TURBO_UI=stream` + `T3CODE_LAUNCH_FAST=1`
- [ ] Main promotion blocked when Dev bundle running (unless force env set)
- [ ] Pre-promotion snapshot written before merge
