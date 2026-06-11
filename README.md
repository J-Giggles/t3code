# T3 Code Local

Omarchy workspace for dogfooding [T3 Code](https://github.com/pingdotgg/t3code) with two side-by-side git worktrees:

| Path | Branch | Role |
|------|--------|------|
| `t3code/` | `main` | Live coding app (promotion target) |
| `t3code-staging/` | `staging` | Product development |

This repository holds the **workspace shell** — launch scripts, Cursor rules, agent automation, and CCS context — not the T3 Code product source. Product code lives in [J-Giggles/t3code](https://github.com/J-Giggles/t3code) and is checked out into the worktree directories below.

## Quick start

```bash
git clone git@github.com:J-Giggles/t3code-local.git ~/code/t3code-local
cd ~/code/t3code-local

# Attach t3code + t3code-staging worktrees (clones J-Giggles/t3code)
./.agents/scripts/bootstrap-worktrees.sh

cd t3code-staging && pnpm install
cd t3code-staging && pnpm run install:local-launchers

cd ~/code/t3code-local
pnpm run start:dev    # main + staging together
# or: pnpm run start:main | start:staging
```

Open `t3code-local.code-workspace` in Cursor for the full workspace (Fallow + agent rules).

## Layout

```
t3code-local/          ← this repo
├── .agents/scripts/   ← launch, verify, bootstrap
├── .cursor/rules/     ← agent workflow rules
├── .context/          ← Codebase Context Specification (CCS)
├── AGENTS.md
├── t3code/            ← git worktree [main]   (ignored — bootstrap creates it)
└── t3code-staging/    ← git worktree [staging] (ignored — bootstrap creates it)
```

## Git remotes (inside `t3code/`)

After bootstrap, the product repo uses:

- `origin` → `git@github.com:J-Giggles/t3code.git`
- `upstream` → `git@github.com:pingdotgg/t3code.git`

Override clone URLs when bootstrapping:

```bash
T3CODE_REPO=git@github.com:YOU/t3code.git \
T3CODE_UPSTREAM=git@github.com:pingdotgg/t3code.git \
  ./.agents/scripts/bootstrap-worktrees.sh
```

## Launch modes

| Mode | Command | Walker entry |
|------|---------|--------------|
| Main only | `pnpm run start:main` | T3code |
| Staging only | `pnpm run start:staging` | T3code Staging |
| Dev (both) | `pnpm run start:dev` | T3code Dev |

Agents (non-interactive, no Ghostty prompt):

```bash
./.agents/scripts/t3-launch.sh staging --wait
./.agents/scripts/t3-verify.sh staging
```

Electron CDP when `T3CODE_AGENT_AUTOMATION=1`: main **9222**, staging **9232**.

## Staging → test → promote

1. Implement on `t3code-staging/` (`staging` branch)
2. Verify with `./.agents/scripts/t3-verify.sh staging`
3. Merge `staging` → `main` in the `t3code/` worktree when ready (in-app toast or `git merge staging`)

See `AGENTS.md` and `.cursor/rules/staging-implement-test-promote.mdc` for the full agent workflow.

## Docs

- `AGENTS.md` — cross-harness instructions for agents in this workspace
- `.context/docs.md` — ports, launchers, runtime paths, gotchas
