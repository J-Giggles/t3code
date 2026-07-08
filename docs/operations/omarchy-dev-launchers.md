# Omarchy Dev Launchers

The Omarchy menu entries for local T3 Code development live outside this
repository under `~/.local/bin` and `~/.local/share/applications`. They are
machine-local launchers, not product code, so upstream pulls must not overwrite
them directly.

This repository owns the renderer and installer that make those local files
reproducible. Use it to inspect or reconcile the launchers after verified
changes have reached `staging`.

## Targets

| Target     | Worktree                                 | Branch                             | Web port | Server port | CDP port | HTTPS path  |
| ---------- | ---------------------------------------- | ---------------------------------- | -------: | ----------: | -------: | ----------- |
| `original` | `~/code/t3code/.worktrees/original`      | `original`                         |   `5733` |     `13773` |   `9230` | `/original` |
| `main`     | `~/code/t3code`                          | `main`                             |   `5753` |     `13793` |   `9231` | `/main`     |
| `staging`  | `~/code/t3code/.worktrees/staging`       | `staging`                          |   `5793` |     `13833` |   `9232` | `/staging`  |
| `nightly`  | `~/code/t3code/.worktrees/nightly-local` | `dev/nightly-topic-stack-YYYYMMDD` |   `5833` |     `13873` |   `9234` | `/nightly`  |

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

`--dry-run` is the default. Use `--target main`, `--target staging`,
`--target nightly`, or `--target original` to inspect one launcher pair.

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

Install or reconcile only the nightly launcher after a successful replay:

```bash
pnpm run omarchy:install-dev-launchers -- --write --target nightly
```

The nightly launcher expects `.worktrees/nightly-local` to be on a branch named
`dev/nightly-topic-stack-YYYYMMDD`. Rebuild that worktree first with
`pnpm run topic-stack:nightly -- --apply`.

## Kill Command

Each generated launcher supports an explicit kill mode that stops only matching
processes from that target worktree:

```bash
~/.local/bin/t3code-dev-nightly --kill
```

Use the kill mode before a new nightly replay if the existing nightly app is
still running.

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
`uwsm app -t service ... ghostty ... --attached` menu style. The `staging` and
`nightly` desktop entries keep the direct launcher style.

## Nightly HTTPS Verification

After launching `T3 Code Nightly`, verify the public HTTPS route from a browser
context with:

```bash
vp run verify:nightly-public
```

That command opens `https://giggabit-server.tailfb378a.ts.net/nightly/`, proves the
primary network interface can reach the route, creates a chat with `Hi`, and
waits for a non-empty assistant response. Artifacts are written under
`apps/desktop/test-results/nightly-public/`.
