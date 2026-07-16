---
name: premote-nightly
description: Promote the latest verified T3 Code nightly replay to staging and then main across giggabit-server, the four durable GitHub branches, and the Mac launcher checkout. Use when the user asks to "premote nightly", promote the latest successful nightly build, or put the newest official T3 Code plus Jordan topics onto both computers.
---

# Premote Nightly

Promote the autonomous `nightly` candidate through the fleet without rebuilding it or silently losing local work. The server run artifacts are the review surface and source of technical proof.

## Required Reading

Read `references/procedure.md` and `docs/operations/premote-nightly.md` before changing a durable ref.

## Operating Rules

- Require an explicit promotion request. A successful nightly report means the candidate is eligible, not automatically approved.
- Use the latest successful run only when its candidate commit, upstream commit, control-plane sync, and proof artifacts agree.
- Never rebuild or edit the candidate during promotion. Repair failures through the nightly replay flow and produce a new candidate.
- Move `nightly -> staging`, prove staging, then move `staging -> main`. Do not change `main` when staging verification fails.
- Treat Linux Main as an approved-SHA service. Open its promotion lock before moving the live checkout, then require a fresh strict `/main/` project-and-chat proof before approving or publishing `main`.
- Keep only `original`, `nightly`, `staging`, and `main` as durable remote branches. Store rollback refs locally under `refs/backup/` and write an external backup bundle.
- Stop staging's launcher before resetting its worktree. Use `t3code-main.service` for Main and `t3code-main-uptime promotion-abort` for any failed live candidate.
- Preserve dirty Mac state before syncing its `main` checkout. Reapply only the saved user changes and retain the backup until verified.
- Record every result in the promotion evidence directory. Mark it complete only after Linux main, GitHub main, Mac main, and the public main route all agree.

## Completion Criteria

The promotion is complete only when all four durable Linux worktrees are clean and correctly assigned, `staging` and the approved Linux `main` point to the reviewed nightly candidate, the fresh strict Main proof receipt exists, GitHub has the same durable refs, the Mac checkout is on that `main` commit with prior local edits restored, `t3code-main.service` and both timers are active, and the run artifacts contain the promotion evidence.
