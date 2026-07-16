# Premote Nightly Procedure

Use this procedure for the explicit `nightly -> staging -> main` T3 Code promotion.

## Durable Lanes

- Linux `original`: `/home/jgigg/code/t3code/.worktrees/original`, clean `upstream/main` mirror.
- Linux `nightly`: `/home/jgigg/code/t3code/.worktrees/nightly`, reviewed upstream plus local topics.
- Linux `staging`: `/home/jgigg/code/t3code/.worktrees/staging`, final verification lane.
- Linux `main`: `/home/jgigg/code/t3code`, live working lane.
- Mac: `/Users/giggabit-mac/code/projects/t3code`, `main` only.

## Transaction

1. Resolve the latest run directory under `.worktrees/nightly/.t3code-nightly-runs/`. Require a successful report, no unresolved fundamental decision, and exact agreement between its candidate SHA and Nightly HEAD.
2. Audit all durable worktrees, refs, origin leases, launchers, and dirty state. Require no cherry-pick, merge, or rebase in progress.
3. Verify the candidate:
   - report status is `success`;
   - run artifact `upstreamAfter` equals Linux `original` and current `upstream/main`;
   - run artifact candidate SHA equals Linux `nightly` HEAD;
   - `control-plane-sync.json` exists for the run;
   - `vp check`, `vp run typecheck`, `vp run lint:mobile`, and `pnpm run topic-plugins:check` pass;
   - required headed or public-path proof is present for affected topics.
4. Capture the old SHAs and create local backup refs under `refs/backup/premote-nightly/<timestamp>/`. Create a git bundle outside the repository containing the old and candidate refs. Do not create remote backup branches.
5. Preserve dirty Mac state as a named stash plus patch and untracked-file archive. Record their paths and verify they are non-empty when changes existed.
6. Stop T3 Code Staging, reset the checked-out staging worktree to the nightly candidate, and push `staging` with `--force-with-lease=staging:<old-origin-staging>`.
7. Launch and prove staging through the real public route. Run `vp run verify:staging-public` when public access is applicable. On failure, restore staging from its backup ref and leave main untouched.
8. Open an exact-SHA Main promotion lock with `t3code-main-uptime promotion-begin <candidate> 1800`. Stop `t3code-main.service`, reset the checked-out Linux main worktree to staging, and start the service. Do not push `main` yet.
9. Run `vp run verify:main-public` against `https://giggabit-server.tailfb378a.ts.net/main/`. Require the primary-interface project/chat proof, screenshot, exact candidate SHA, clean checkout, and `promotionProof.written: true`.
10. Approve the candidate with `t3code-main-uptime promotion-approve <candidate>`. Only then push `main` with `--force-with-lease=main:<old-origin-main>`. Publish `nightly` and `original` with their own leases so GitHub exposes only the four current durable lanes.
11. On the Mac, fetch `origin`, update `main` to the exact promoted SHA, then restore the saved local changes. Verify the checkout and keep the stash/patch until the restored work is inspected.
12. Confirm `t3code-main.service`, the guard timer, and the health timer are active. Write old and new SHAs, checks, proof receipt and screenshot, Mac sync evidence, backup locations, and any warnings into the promotion evidence directory. Mark it complete only after every completion criterion passes.

## Failure Handling

- Before main moves: restore staging if needed, restart staging, and leave main unchanged.
- Before Main approval: run `t3code-main-uptime promotion-abort`; it preserves the failed candidate, restores the prior approved SHA, and restarts Main. Leave `origin/main` untouched.
- After Main approval or publication: restore Linux main and `origin/main` from the local backup ref using the captured lease, establish the restored SHA as the approved Main through the same proof gate, and retain the failed promotion evidence.
- Never resolve a failed promotion by editing a durable worktree. Return the defect to the nightly replay topic and produce a new Nightly Run.
