# Premote Staging Procedure

Use this procedure to promote T3 Code `staging` to `main` for Jordan's local fleet.

## Lanes

- `original`: `/home/jgigg/code/t3code/.worktrees/original`, branch `original`, tracks `upstream/main`.
- `nightly`: `/home/jgigg/code/t3code/.worktrees/nightly`, branch `nightly`, latest upstream plus replayed local topics.
- `staging`: `/home/jgigg/code/t3code/.worktrees/staging`, branch `staging`, final verification lane.
- `main`: `/home/jgigg/code/t3code`, branch `main`, live day-to-day lane.
- Mac launcher checkout: `/Users/giggabit-mac/code/projects/t3code`, branch `main` after promotion.

## Workflow

1. Confirm the user explicitly wants staging promoted and accepts downtime for T3 Code Main.
2. Audit:
   - `fleet-doctor`
   - remote `git status --short --branch` for all durable lanes
   - `git worktree list --porcelain`
   - running `t3code-dev-main`, `dev-runner`, Electron, and Vite+ processes
3. Verify staging under Node `24.13.1`:
   - `mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp check'`
   - `mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp run typecheck'`
   - `mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp run lint:mobile'`
   - `mise x node@24.13.1 -- bash -lc 'pnpm run topic-plugins:check'`
4. Save backups:
   - dirty Mac patch or stash
   - dirty Linux temporary-worktree patches
   - `refs/backup/premote-staging/<timestamp>/{main,staging,original,nightly,origin-main,origin-staging,upstream-main}` where refs exist
5. Open the protected Main window and stop only the systemd-owned runtime:
   - `candidate="$(git -C /home/jgigg/code/t3code/.worktrees/staging rev-parse HEAD)"`
   - `~/.local/bin/t3code-main-uptime promotion-begin "$candidate" 1800`
   - `systemctl --user stop t3code-main.service`
6. Move the live checkout locally:
   - `cd /home/jgigg/code/t3code`
   - `git reset --hard "$candidate"`
7. Start and strictly prove the candidate before publishing:
   - `systemctl --user start t3code-main.service`
   - from staging, run `T3CODE_MAIN_ROOT=/home/jgigg/code/t3code T3CODE_PUBLIC_VERIFY_PROJECT_ROOT=/home/jgigg/code/t3code T3CODE_PUBLIC_VERIFY_PROJECT_TITLE=main vp run verify:main-public`
   - require `promotionProof.written: true`, the exact candidate, a project/chat response, and screenshot
   - `~/.local/bin/t3code-main-uptime promotion-approve "$candidate"`
   - on any failure, run `~/.local/bin/t3code-main-uptime promotion-abort` and stop
8. Push safely without creating extra remote branches:
   - write an external git bundle containing the local backup refs
   - `git push --force-with-lease=main:<old-origin-main-sha> origin main:main`
   - `git push --force-with-lease=staging:<old-origin-staging-sha> origin staging:staging`
   - push `nightly` only after the durable nightly worktree exists and is clean
9. Ensure durable Linux worktrees exist:
   - Reset `original` to `upstream/main` after backup.
   - Create or update `.worktrees/nightly` on branch `nightly`. If no newer replay candidate exists, it may temporarily match `staging`.
   - Keep `.worktrees/staging` on branch `staging`.
   - Keep `/home/jgigg/code/t3code` on branch `main`.
10. Verify the durable runtime:
    - `systemctl --user is-active t3code-main.service t3code-main-guard.timer t3code-main-health.timer`
    - `git -C /home/jgigg/code/t3code rev-parse HEAD`
    - `~/.local/bin/t3code-main-uptime status`
    - proof artifacts show the canonical public `/main/` workflow passed
11. Update Mac:
    - fetch origin
    - switch to `main`
    - reset to `origin/main`
    - reapply only intentional saved edits
12. Local cleanup:
    - Remove temporary Linux worktrees after backup.
    - Delete extra local branches only when their commits are reachable from durable branches or backup refs.

- Keep the remote limited to `original`, `nightly`, `staging`, and `main`.
