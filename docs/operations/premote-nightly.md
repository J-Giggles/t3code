# Premote Nightly

`$premote-nightly` promotes a successful nightly replay to `staging`, proves it, then promotes the same commit to `main` on `giggabit-server`, GitHub, and the Mac launcher checkout. The spelling `premote` is intentional and matches the project skill.

## Authority

A candidate is eligible only when these sources agree:

1. The latest Linear nightly run under `GBT-38` is `In Review` and its final report says the replay passed.
2. The issue identity matches `.worktrees/nightly/.t3code-nightly-runs/<run>/linear-run.json`.
3. `nightly-agent-report.json` identifies the current nightly HEAD and current original/upstream commit.
4. `control-plane-sync.json` proves the replay copied current workflow metadata into the candidate after topic replay.

Linear is the review surface. Git and the run artifacts are the technical source of truth. Promotion to staging remains explicit, and Main requires a second, fresh approval after the exact staging revision has passed its live public proof.

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

1. Advance `staging` to the reviewed nightly tree without rewriting history. Use a fast-forward when possible; otherwise prepare a reviewed reconciliation commit in a dev worktree and repeat all Staging checks.
2. Launch Staging and prove the exact revision through the strict public project/chat workflow.
3. Push only `staging` with an exact lease, publish the proof, and stop for fresh user approval tied to the exact SHA and stated Linux/Mac downtime. No earlier authority carries over.
4. After approval, preflight SSH, clean state, fast-forward ancestry, stop/start commands, health checks, dependency installation, and fallback launcher provisioning on both hosts before stopping either Main launcher.
5. Create rollback refs for every durable lane and remote-tracking ref, write an external verified git bundle, and preserve Mac dirty state as a stash plus patch/untracked archive.
6. Open the Linux exact-SHA promotion lock, stop both Main launchers, and fast-forward Linux and Mac Main to the proven `staging` SHA. Do not publish GitHub Main yet.
7. Install frozen dependencies or run documented machine-local launcher provisioning where required, then relaunch both hosts at the same SHA.
8. Run `vp run verify:main-public` against the canonical public Main route and verify the Mac app shell. Require the primary-interface project/chat flow, screenshot, clean exact-SHA checkouts, and fresh promotion receipt.
9. Approve the candidate with `t3code-main-uptime promotion-approve <candidate>`, then push `main`, `nightly`, and `original` with exact leases. Do not create backup branches on GitHub.
10. If either host fails before publication, roll both hosts back and restart the old versions. If publication fails, restore Linux, GitHub, and Mac from the captured refs. A split-version fleet is not success.
11. Confirm the Main service and both timers are active, add the full two-host evidence to the Linear run, and move it to Done only after both hosts and GitHub agree.

Do not combine staging and Main approval into one request, and do not reset a checked-out durable lane. Staging proof and the fresh approval boundary protect the live Main fleet.

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

If staging proof fails, restore staging and leave Main untouched. If the post-approval live Main candidate fails, run `t3code-main-uptime promotion-abort`; the guard restores the prior approved SHA while `origin/main` remains unchanged, then restore and relaunch the Mac from its matching backup. If a publication step fails, use the captured refs and the same proof gate for a coordinated rollback. Product repairs belong in a new nightly replay candidate, never as direct edits to `staging` or `main`.
