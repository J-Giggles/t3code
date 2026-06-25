# Omarchy Dev Launchers

The Omarchy menu entries for local T3 Code development live outside this
repository under `~/.local/bin` and `~/.local/share/applications`. They are
machine-local launchers, not product code, so upstream pulls must not overwrite
them directly.

This repository owns the renderer and installer that make those local files
reproducible. Use it to inspect or reconcile the launchers after verified
changes have reached `staging`.

## Targets

| Target     | Worktree                            | Branch     | Web port | Server port | CDP port |
| ---------- | ----------------------------------- | ---------- | -------: | ----------: | -------: |
| `original` | `~/code/t3code/.worktrees/original` | `original` |   `5733` |     `13773` |   `9230` |
| `main`     | `~/code/t3code`                     | `main`     |   `5753` |     `13793` |   `9231` |
| `staging`  | `~/code/t3code/.worktrees/staging`  | `staging`  |   `5793` |     `13833` |   `9232` |

Each rendered launcher sets:

```bash
T3CODE_DEV_CHANGE_POLICY=manual
T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE=1
T3CODE_DESKTOP_RESTART_ON_EXIT=1
```

`T3CODE_DEV_CHANGE_POLICY=manual` keeps running provider chats alive when local
source changes. The older `T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE=1` remains
for compatibility with older dev supervisors. `T3CODE_DESKTOP_RESTART_ON_EXIT=1`
keeps the headed Electron process alive after clean exits such as closing the
window.

## Dry Run

Inspect the current plan without writing local files:

```bash
pnpm run omarchy:install-dev-launchers -- --dry-run --target all
```

`--dry-run` is the default. Use `--target main`, `--target staging`, or
`--target original` to inspect one launcher pair.

The installer validates that each selected worktree exists and is on its
expected branch before reporting or writing files.

## Install

Install or reconcile the local launchers only after the renderer commit is
verified and present on `staging`:

```bash
pnpm run omarchy:install-dev-launchers -- --write --target all
```

Existing files are backed up only when their content differs. Backups sit beside
the overwritten file and use `.bak.<timestamp>` suffixes.

Verify generated shell syntax after installing:

```bash
bash -n ~/.local/bin/t3code-dev-main ~/.local/bin/t3code-dev-staging ~/.local/bin/t3code-dev-original
```

Do not restart an active `main` dev environment just to apply launcher updates.
The new launcher behavior applies on the next clean start from the Omarchy menu.

## Behavior

The rendered launcher scripts:

- refuse to launch if the target worktree is on the wrong branch
- stop only matching processes from the selected worktree
- keep `main` process matching away from `~/code/t3code/.worktrees/*`
- supervise the outer Vite+ desktop command
- restart that command after 2 seconds if it exits unexpectedly
- watch for a real Electron process after it appears
- restart the dev stack if Electron disappears for at least 4 seconds
- stop the matching dev stack and exit cleanly on `SIGINT`, `SIGTERM`, or `SIGHUP`

The `main` and `original` desktop entries use the existing
`uwsm app -t service ... ghostty ... --attached` menu style. The `staging`
desktop entry keeps the direct launcher style.
