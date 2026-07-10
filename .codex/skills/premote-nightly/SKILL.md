---
name: premote-nightly
description: Promote the latest verified T3 Code nightly replay to staging and then main across giggabit-server, the four durable GitHub branches, and the Mac launcher checkout. Use when the user asks to "premote nightly", promote the latest nightly build, move a successful Linear nightly run into staging or main, or put the newest official T3 Code plus Jordan topics onto both computers.
---

# Premote Nightly

Promote the autonomous `nightly` candidate through the fleet without rebuilding it or silently losing local work. Linear records the review and outcome; the server run artifacts remain the source of technical proof.

## Required Reading

Read `references/procedure.md` and `docs/operations/premote-nightly.md` before changing a durable ref.

## Operating Rules

- Require an explicit promotion request. A nightly issue reaching `In Review` means it is eligible, not automatically approved.
- Use the latest Linear child issue under `GBT-38` only when its `linear-run.json`, nightly commit, upstream commit, and successful report agree.
- Never rebuild or edit the candidate during promotion. Repair failures through the nightly replay flow and produce a new candidate.
- Move `nightly -> staging`, prove staging, then move `staging -> main`. Do not change `main` when staging verification fails.
- Keep only `original`, `nightly`, `staging`, and `main` as durable remote branches. Store rollback refs locally under `refs/backup/` and write an external backup bundle.
- Stop a lane's launcher before resetting its checked-out worktree. Restore it on failure.
- Preserve dirty Mac state before syncing its `main` checkout. Reapply only the saved user changes and retain the backup until verified.
- Record every result on the Linear nightly run issue. Move it to Done only after Linux main, GitHub main, Mac main, and the public main route all agree.

## Completion Criteria

The promotion is complete only when all four durable Linux worktrees are clean and correctly assigned, `staging` and `main` point to the reviewed nightly candidate, GitHub has the same durable refs, the Mac checkout is on that `main` commit with prior local edits restored, T3 Code Main is running, and the Linear run contains the promotion evidence.
