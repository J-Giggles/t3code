# Premote Staging

This runbook promotes the verified T3 Code `staging` lane to `main` on `giggabit-server`, then updates the Mac launcher checkout to the same commit. The spelling `premote` is intentional so the project-local Codex skill can be invoked as `$premote-staging`.

## Durable Lanes

| Lane       | Linux worktree                                | Branch     | Purpose                                             |
| ---------- | --------------------------------------------- | ---------- | --------------------------------------------------- |
| `original` | `/home/jgigg/code/t3code/.worktrees/original` | `original` | Clean mirror of `upstream/main`.                    |
| `nightly`  | `/home/jgigg/code/t3code/.worktrees/nightly`  | `nightly`  | Latest upstream plus replayed Jordan topic commits. |
| `staging`  | `/home/jgigg/code/t3code/.worktrees/staging`  | `staging`  | Verified candidate before main promotion.           |
| `main`     | `/home/jgigg/code/t3code`                     | `main`     | Day-to-day running T3 Code checkout.                |

The Mac keeps only the main working checkout at `/Users/giggabit-mac/code/projects/t3code`.

## Required Checks

Run checks from the Linux `staging` worktree with Node `24.13.1`:

```bash
cd /home/jgigg/code/t3code/.worktrees/staging
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp check'
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp run typecheck'
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp run lint:mobile'
mise x node@24.13.1 -- bash -lc 'pnpm run topic-plugins:check'
```

`vp check` and `vp run typecheck` are mandatory. `lint:mobile` is expected for this stack because the replayed upstream tree can include native mobile changes. If native lint tools are missing, record the skip warnings.

Use `vp run verify:staging-public` when the staging app is running and the change affects public paths, Tailscale Serve, pairing, or app launch.

## Promotion Flow

1. Confirm the user explicitly wants `staging` to replace `main`, and confirm downtime for `T3 Code Main`.
2. Audit current refs, worktrees, dirty state, and running processes on `giggabit-server`.
3. Preserve local state:
   - Save dirty Mac changes as a patch or stash before switching the Mac checkout.
   - Save dirty Linux worktree patches before removing temporary worktrees.
   - Create local backup refs under `refs/backup/premote-staging/<timestamp>/` for `main`, `staging`, `original`, `nightly` when present, `origin/main`, `origin/staging`, and `upstream/main`.
4. Open an exact-SHA promotion lock, then stop `t3code-main.service` before moving `/home/jgigg/code/t3code`:

```bash
candidate="$(git -C /home/jgigg/code/t3code/.worktrees/staging rev-parse HEAD)"
~/.local/bin/t3code-main-uptime promotion-begin "$candidate" 1800
systemctl --user stop t3code-main.service
```

5. Move Linux `main` to the verified `staging` commit with a checked-out worktree reset:

```bash
cd /home/jgigg/code/t3code
git status --short --branch
git reset --hard staging
```

6. Start the candidate and prove the canonical Main project/chat workflow before publishing it:

```bash
systemctl --user start t3code-main.service
cd /home/jgigg/code/t3code/.worktrees/staging
T3CODE_MAIN_ROOT=/home/jgigg/code/t3code \
T3CODE_PUBLIC_VERIFY_PROJECT_ROOT=/home/jgigg/code/t3code \
T3CODE_PUBLIC_VERIFY_PROJECT_TITLE=main \
vp run verify:main-public
~/.local/bin/t3code-main-uptime promotion-approve "$candidate"
```

7. Write an external git bundle containing the local backup refs, then update the durable remote lanes with lease protection. Do not create extra backup branches on GitHub:

```bash
git push --force-with-lease=main:<old-origin-main-sha> origin main:main
git push --force-with-lease=staging:<old-origin-staging-sha> origin staging:staging
```

8. Ensure the Linux durable worktrees exist and are clean:
   - `original` at `upstream/main`
   - `nightly` at the latest verified replay candidate, or equal to `staging` until the next replay
   - `staging` at the promoted candidate
   - `main` at the promoted candidate
9. Confirm `t3code-main.service`, `t3code-main-guard.timer`, and `t3code-main-health.timer` are active.
10. Verify the app:

- `git -C /home/jgigg/code/t3code rev-parse HEAD`
- `curl -fsS https://giggabit-server.tailfb378a.ts.net/main/`
- inspect process command lines for `/home/jgigg/code/t3code`

11. Update the Mac checkout to `origin/main`, restore only intentional saved changes, and keep the Mac on the main lane.
12. Remove temporary local Linux worktrees after backup. Keep GitHub limited to `original`, `nightly`, `staging`, and `main`.

## Cleanup Rules

Temporary Linux worktrees can be removed after their dirty state is saved and their commits are reachable from a durable lane or backup ref. Prefer:

```bash
git worktree remove <path>
git branch -D <temporary-branch>
```

Never remove the durable lane worktrees: `/home/jgigg/code/t3code`, `.worktrees/original`, `.worktrees/nightly`, or `.worktrees/staging`.

## Failure Rules

If any required staging check fails, leave `main` untouched and report the failing command. If the live Main candidate fails before approval, run `~/.local/bin/t3code-main-uptime promotion-abort`; this preserves the failed state, restores the approved SHA, and restarts the service without changing `origin/main`.
