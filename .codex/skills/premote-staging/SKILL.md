---
name: premote-staging
description: Promote an independently prepared T3 Code staging lane to main across Jordan's Linux server and Mac launcher checkout. Use when the user explicitly asks to "premote staging" or "promote staging to main". For a successful autonomous nightly replay, use premote-nightly instead.
---

# Premote Staging

## Overview

This skill runs the project-specific T3 Code promotion flow. It treats `original`, `nightly`, `staging`, and `main` as the only durable Linux lanes, promotes `staging` to the live `main` lane only after verification and backups, and then updates the Mac checkout to match.

When `staging` should be sourced from the latest Linear-reviewed nightly replay, stop and use `$premote-nightly`; it owns the `nightly -> staging -> main` transaction and Linear evidence.

## Required Reading

Read `references/procedure.md` before acting. Also read `docs/operations/premote-staging.md` from the repo if the procedure has changed since this skill was last edited.

## Operating Rules

- Use `fleet-ssh giggabit-server -- <command>` or `ssh giggabit-server` for Linux work. Prefer the fleet wrapper when Node, pnpm, or repo tools need the development PATH.
- Do not move `main` while `T3 Code Main` is running from `/home/jgigg/code/t3code`; stop the launcher first and restart it after promotion.
- Do not skip `vp check` or `vp run typecheck`. Run them with Node `24.13.1`.
- Preserve dirty state with patch files, stashes, or backup refs before removing temporary worktrees or switching the Mac checkout.
- Keep GitHub limited to the four durable lanes. Use local backup refs and an external git bundle instead of remote backup branches.
- If a required verification step fails, leave `main` untouched or restore it from the backup ref before reporting.

## Completion Criteria

The flow is complete only when Linux `main` and the Mac checkout point at the promoted commit, T3 Code Main is running again, required checks are recorded, and temporary local worktrees have either been removed or explicitly left with a reason.
