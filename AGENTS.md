# T3 Code Local Workspace

This directory is the **workspace root** for dogfooding two T3 Code worktrees on Omarchy (Hyprland + Walker launcher).

## Worktrees

| Role | Path | Branch |
|------|------|--------|
| Live coding app | `t3code/` | `main` |
| Product development | `t3code-staging/` | `staging` |

### Do not edit or stop main during self-improvement

When improving T3 Code itself (product code, launchers, agents, workflows), work **only** in `t3code-staging/` on branch `staging`. **Do not** edit `t3code/` (`main`), merge into `main`, promote, or change anything wired to the live main instance unless the user explicitly asks in the current turn.

**Dev mode (`T3code Dev`) runs main and staging together** — that does not make main fair game. The main half is still the live app (`t3code/` on branch `main`, `t3code-local-main`). Leave it running and unchanged: no file edits under `t3code/`, no restarts, no relaunch of Dev mode, and no `start:main` / `t3-launch.sh main` cycles to test your work. Verify and interact with the **staging half only** (`t3code-staging`, `t3code-local-staging`, `t3-launch.sh staging`).

The live main instance is the user's running session — often hosting active Cursor agent work. **Do not** stop, restart, relaunch, or kill main (including via Dev mode teardown) to verify or test staging changes. Killing or restarting main terminates in-flight agent processes even when staging keeps running.

### Agent session continuity (live main + staging dev)

| Goal | Safe launcher | Notes |
|------|----------------|-------|
| Live agents on other projects | **T3code** (`start:main`) | Keep main running; never relaunch Dev while agents are active |
| Edit staging product code | **T3code Staging** (`start:staging`) | Solo staging relaunch never tears down main |
| Main + staging side by side | **T3code Dev** (`start:dev`) | **Dev attach:** if main is healthy, relaunch keeps main and starts staging only (`T3CODE_DEV_ATTACH_MAIN=1`, auto when `T3CODE_AGENT_AUTOMATION=1`) |
| Force full Dev kill | `T3CODE_DEV_FORCE_FULL_RELAUNCH=1` | Stops both stacks before Turbo (old behavior) |

On **main** (desktop or Tailscale mobile via `/t3code-main/`): promotion toast is **Promote & Relaunch Main** — merges staging, relaunches main with updates; Tailscale Serve stays up and mobile reconnects when the server is back. On **staging**: **Promote & Relaunch Staging** merges and relaunches staging only (main agents keep running).

## Launch contract

Launch must **always** work from **three entry points**, with the **same three modes** at each:

| Mode | What it starts | Walker name | Desktop / CLI |
|------|----------------|-------------|-----------------|
| **Normal** | Main only (live app) | **T3code** | `t3code-local-main` / `t3code` |
| **Dev** | Main + staging together, with logs | **T3code Dev** | `t3code-local-dev` / `t3code dev` |
| **Staging** | Staging only (product dev) | **T3code Staging** | `t3code-local-staging` |

Dev mode opens a startup terminal that shows log locations (`~/.local/share/t3code-local/{main|staging}/logs/latest.log`) and runs both instances side by side.

### 1. Omarchy apps launcher (Walker)

Use the three Walker entries above. One-time install/regenerate:

```bash
cd ~/code/t3code-local && pnpm run install:launchers
# or: cd t3code-staging && pnpm run install:local-launchers
```

### 2. Workspace root (`t3code-local/`)

```bash
cd ~/code/t3code-local
pnpm run start:main      # Normal — main only
pnpm run start:staging   # Staging only
pnpm run start:dev       # Dev — main + staging + logs

# aliases: pnpm run t3code | t3code:staging | t3code:dev
```

### 3. Either worktree (`t3code/` or `t3code-staging/`)

The same three scripts work from **both** worktree roots (they resolve back to the shared launcher):

```bash
cd ~/code/t3code-local/t3code          && pnpm run start:main
cd ~/code/t3code-local/t3code          && pnpm run start:staging
cd ~/code/t3code-local/t3code          && pnpm run start:dev

cd ~/code/t3code-local/t3code-staging  && pnpm run start:main
cd ~/code/t3code-local/t3code-staging  && pnpm run start:staging
cd ~/code/t3code-local/t3code-staging  && pnpm run start:dev
```

`pnpm run start:*` works the same everywhere. When changing launcher behavior, keep all three entry points and all three modes working; regenerate launchers after edits to `local-desktop-launchers.ts`.

**Agents** (non-interactive, no Ghostty startup terminal): `pnpm run launch` inside a worktree, or `./.agents/scripts/t3-launch.sh main|staging` from workspace root.

Product changes default to **`t3code-staging`**. See `t3code/.agents/rules/t3code-local-workflow.md` and `t3code/AGENTS.md` inside each worktree.

### Before staging work

Before undertaking any product work in `t3code-staging`, **merge `main` into `staging` first**. That pulls any floating changes from the live worktree into staging automatically so agents do not build on a stale branch.

```bash
cd ~/code/t3code-local/t3code-staging
git merge main -m "Merge branch 'main' into staging"
```

Resolve merge conflicts before implementing. Do not use `reset --hard`. If `main` has uncommitted changes, stop and report — only merge committed history.

## Agent launch and verify (Omarchy)

Use workspace scripts (non-interactive, no startup terminal):

```bash
# Launch like the Walker entry (background dev stack)
./.agents/scripts/t3-launch.sh main          # or staging
./.agents/scripts/t3-launch.sh main --wait   # block until Vite responds

# See the running app (Vite UI + optional Hyprland screenshot)
./.agents/scripts/t3-verify.sh main
./.agents/scripts/t3-verify.sh staging --screenshot /tmp/t3-staging.png
```

For product UI verification, agents should prefer the already-running, visible **T3code Staging** window. First run `./.agents/scripts/t3-verify.sh staging`; if it reports `vite_ready=yes` and Electron CDP is reachable on port **9232**, attach to that headed instance and use browser automation to click buttons, fill fields, inspect the DOM, and exercise user workflows while the window remains visible. Omarchy **T3code Dev** and promotion **Promote & Relaunch Dev** keep the Ghostty startup terminal path and force staging into agent automation mode with CDP port **9232** plus `~/.local/share/t3code-local/staging/agent-automation.json`. If staging is not running or was not launched with agent automation, start it with `./.agents/scripts/t3-launch.sh staging --wait`. Use `./.agents/scripts/t3-verify.sh staging --screenshot /tmp/t3-staging-check.png` when visual state matters, and report any CDP or screenshot limitations explicitly.

See **Launch contract** above for Walker/desktop IDs and the three modes. Runtime logs: `~/.local/share/t3code-local/{main|staging}/logs/latest.log`.

After changing launcher behavior in the repo, refresh from **staging**:

```bash
cd t3code-staging && pnpm run install:local-launchers
```

## Agent project context (CCS)

Before large or unfamiliar tasks, refresh workspace context:

```bash
./.agents/scripts/refresh-project-context.sh
```

Then read `.context/index.md` and `.context/docs.md`. Rules in `.cursor/rules/` tell agents when to regenerate this.

## Agent memory protocol

Use `.context/` as the durable project memory for this workspace. During substantial work, track candidate learnings, but only persist verified, stable conventions.

At the end of substantial investigation or implementation, propose **Memory Candidates** with:

- Learned fact or rule
- Evidence/source
- Confidence
- Suggested destination

Destinations:

- `.context/docs.md` for durable project facts, workflows, commands, ports, and gotchas
- `.context/index.md` for high-level orientation only
- `.cursor/rules/*.mdc` for Cursor instructions future agents must actively follow
- `AGENTS.md` only for cross-harness instructions that should apply to every agent in this workspace

Do not save secrets, private env values, customer data, speculation, or one-off debugging noise as project memory.

## Task completion

When wrapping up work in a thread, agents should:

1. **Recommend next steps** — Based on what was done, suggest concrete follow-ups (tests to add, related bugs, promotion to `main`, docs updates, manual checks, etc.). Keep recommendations proportional to the work; do not pad with generic suggestions.

2. **Commit when scope is done** — If the original request for the thread is complete and there are uncommitted changes, commit them before finishing. Do not leave completed work only in the working tree.

   - Commit from the correct worktree (`t3code-staging` for product changes unless the task explicitly targeted `main` or workspace root files).
   - Review `git status` and `git diff` first; do not commit secrets or unrelated edits.
   - Write a concise commit message (1–2 sentences) focused on **why**, matching recent repo style.
   - Do **not** push unless the user asked to publish in that thread.

If scope is incomplete, say what remains instead of committing partial work unless the user asked for incremental commits.

## Session hook

Cursor runs `.cursor/hooks/session-start.sh` when you open this workspace. It refreshes `.context/` in the background and sets `T3CODE_AGENT_AUTOMATION=1` for the session.

## Cursor rules in this workspace

| Rule | Purpose |
|------|---------|
| `t3code-local-workspace.mdc` | Worktrees, launch, verify, staging-first |
| `t3code-local-project-context.mdc` | When/how to run context generators |

Worktree-specific rules remain under `t3code/.cursor/rules/` and `t3code-staging/.cursor/rules/`.
