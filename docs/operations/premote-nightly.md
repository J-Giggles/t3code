# Premote Nightly

`$premote-nightly` promotes a successful nightly replay to `staging`, proves it, then promotes the same commit to `main` on `giggabit-server`, GitHub, and the Mac launcher checkout. The spelling `premote` is intentional and matches the project skill.

## Authority

A candidate is eligible only when these sources agree:

1. The latest Linear nightly run under `GBT-38` is `In Review` and its final report says the replay passed.
2. The issue identity matches `.worktrees/nightly/.t3code-nightly-runs/<run>/linear-run.json`.
3. `nightly-agent-report.json` identifies the current nightly HEAD and current original/upstream commit.
4. `control-plane-sync.json` proves the replay copied current workflow metadata into the candidate after topic replay.

Linear is the review surface. Git and the run artifacts are the technical source of truth. Promotion remains an explicit user action.

## Preflight

Run on `giggabit-server` with Node `24.13.1`:

```bash
cd /home/jgigg/code/t3code/.worktrees/nightly
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp check'
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp run typecheck'
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp run lint:mobile'
mise x node@24.13.1 -- bash -lc 'pnpm run topic-plugins:check'
```

Inspect `topic-audit.md`, `nightly-agent-report.json`, and proof artifacts from the matching run. A failed run, unresolved fundamental conflict, dirty nightly worktree, stale upstream base, or mismatched Linear issue blocks promotion.

## Promotion Order

1. Create local rollback refs for all four lanes and their remote-tracking refs under `refs/backup/premote-nightly/<timestamp>/`.
2. Write a git bundle outside the checkout before moving any durable ref.
3. Preserve Mac dirty state as both a stash and a patch/untracked archive.
4. Stop the staging launcher and reset `.worktrees/staging` to the reviewed nightly SHA.
5. Push `staging` with an exact `--force-with-lease` and prove the public staging workflow.
6. Open an exact-SHA promotion lock, stop `t3code-main.service`, reset `/home/jgigg/code/t3code` to the proven staging SHA, and start the service. Keep `origin/main` unchanged.
7. Run `vp run verify:main-public` against the canonical public Main route. Require the primary-interface project/chat flow, screenshot, clean exact-SHA checkout, and fresh promotion receipt.
8. Approve the candidate with `t3code-main-uptime promotion-approve <candidate>`.
9. Push `main`, `nightly`, and `original` with exact leases. Do not create backup branches on GitHub; the remote should contain only the four durable lanes.
10. Fetch and update the Mac `main` checkout to the exact promoted SHA, then restore its preserved local changes.
11. Confirm the Main service and both timers are active. Add a promotion evidence comment to the Linear run and move it to Done.

Do not combine staging and main into a single blind reset. Staging is the rollback boundary that protects the live main lane.

## Linear Evidence

The completion comment records:

- Linear run identifier and replay run ID;
- old and new SHAs for `original`, `nightly`, `staging`, and `main`;
- origin lease SHAs and local backup locations;
- required check results and headed/public proof;
- Linux launcher and public main verification;
- Mac HEAD and restored dirty-state status;
- rollback or warning details, if any.

Keep the issue `In Review` when a promotion is incomplete. A failed promotion returns to `Todo` only when additional agent repair is required.

## Rollback

If staging proof fails, restore staging and leave main untouched. If the live Main candidate fails before approval, run `t3code-main-uptime promotion-abort`; the guard restores the prior approved SHA and restarts the service while `origin/main` remains unchanged. If a post-approval publication step fails, use the backup refs and the same proof gate for rollback. Product repairs belong in a new nightly replay candidate, never as direct edits to `staging` or `main`.
