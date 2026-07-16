# Premote Staging

This runbook first proves T3 Code `staging`, pauses for fresh approval tied to that exact revision, and only then promotes it to `main` as one coordinated `giggabit-server` and Mac launcher transaction. The spelling `premote` is intentional so the project-local Codex skill can be invoked as `$premote-staging`.

## Durable Lanes

| Lane       | Linux worktree                                | Branch     | Purpose                                             |
| ---------- | --------------------------------------------- | ---------- | --------------------------------------------------- |
| `original` | `/home/jgigg/code/t3code/.worktrees/original` | `original` | Clean mirror of `upstream/main`.                    |
| `nightly`  | `/home/jgigg/code/t3code/.worktrees/nightly`  | `nightly`  | Latest upstream plus replayed Jordan topic commits. |
| `staging`  | `/home/jgigg/code/t3code/.worktrees/staging`  | `staging`  | Verified candidate before Main promotion.           |
| `main`     | `/home/jgigg/code/t3code`                     | `main`     | Day-to-day running T3 Code checkout.                |

The Mac keeps only the Main working checkout at `/Users/giggabit-mac/code/projects/t3code`.

## Required Checks

Run checks from the Linux `staging` worktree with Node `24.13.1`:

```bash
cd /home/jgigg/code/t3code/.worktrees/staging
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp check'
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp run typecheck'
mise x node@24.13.1 -- bash -lc './node_modules/.bin/vp run lint:mobile'
mise x node@24.13.1 -- bash -lc 'pnpm run topic-plugins:check'
```

`vp check` and `vp run typecheck` are mandatory. `lint:mobile` is expected when the stack includes native mobile changes; record any missing-tool warnings. Run all topic-specific unit and headed E2E commands as well.

Always run `vp run verify:staging-public` against the exact candidate. It must prove the public HTTPS app, project list, creation of a chat containing `Hi`, and a non-empty assistant response. A loopback curl or blank-page screenshot is not proof.

## Phase One: Prove Staging Without Main Authority

1. Audit Staging, its source dev topic, dirty state, worktrees, and running processes. Do not stop or edit Main.
2. Promote only the committed, verified dev topic into the reserved Staging worktree.
3. Launch T3 Code Staging and run the required static, unit, native, headed, topic-plugin, and public-path checks.
4. Record the exact Staging SHA, commands, results, public artifact paths, and source topic SHA in the local promotion evidence.
5. Confirm the proposed candidate can be applied without rewriting Main history:

```bash
git merge-base --is-ancestor main staging
git merge-base --is-ancestor origin/main staging
```

If either check fails, prepare a reviewed non-rewrite reconciliation commit in a dev worktree whose tree is exactly the proven candidate, advance Staging to it, and repeat every Staging proof. Never repair ancestry by resetting Main or force-pushing.

6. Push only the proven Staging branch with an exact lease so the Mac can fetch it. Present the exact evidence, candidate SHA, expected downtime, Mac reachability, and rollback point to the user.
7. Stop here and request fresh approval for this revision. An earlier “implement,” “keep going,” accepted plan, Staging approval, or broad promotion request is not Main authority.

## Phase Two: Freshly Approved Two-Host Transaction

After the user explicitly approves the exact proven Staging SHA:

1. Recheck that Staging still equals the approved SHA and all proof is current.
2. Preflight both machines before stopping either launcher:
   - Linux and Mac SSH are reachable.
   - Linux root Main, reserved Staging, and Mac Main are clean and have no merge, rebase, or cherry-pick in progress.
   - Linux Main and Mac Main can fast-forward to the approved candidate.
   - Stop, start, health-check, dependency-install, and launcher-provision commands exist on both hosts.
   - The Mac-side `/Users/giggabit-mac/code/config/codex/scripts/codex-config-doctor.sh` passes before portable Codex policy is synchronized.
3. Create Linux and Mac backup refs, an external verified Linux git bundle, and Mac patch/untracked archives where needed. Record every rollback artifact before downtime.
4. Open the exact-SHA Linux promotion lock:

```bash
candidate="$(git -C /home/jgigg/code/t3code/.worktrees/staging rev-parse HEAD)"
~/.local/bin/t3code-main-uptime promotion-begin "$candidate" 1800
```

5. Stop both Main launchers. Confirm no Main Electron, Vite, server, or dev-runner process owns either checkout or documented port.
6. Fast-forward Linux and Mac Main to the already-published Staging SHA without moving GitHub Main yet:

```bash
git -C /home/jgigg/code/t3code merge --ff-only staging
ssh giggabit-mac 'git -C /Users/giggabit-mac/code/projects/t3code fetch origin && git -C /Users/giggabit-mac/code/projects/t3code merge --ff-only origin/staging'
```

7. Install frozen dependencies when the lockfile changed. If a launcher or machine-local config is missing, run its documented installer, repeat the preflight, and only then relaunch. Do not improvise edits in either Main checkout.
8. Relaunch Linux and Mac Main at the same SHA. Verify process ownership, expected ports, Linux `/main/` through the real project/chat flow, and the Mac app shell.
9. Approve and publish only after both hosts pass:

```bash
~/.local/bin/t3code-main-uptime promotion-approve "$candidate"
git -C /home/jgigg/code/t3code push origin staging:staging main:main
```

10. Confirm GitHub, Linux, and Mac all resolve to the approved SHA; confirm `t3code-main.service`, `t3code-main-guard.timer`, and `t3code-main-health.timer` are active.
11. Record old/new SHAs, backup artifacts, downtime, provisioning, both host checks, proof receipts, and any rollback in the local promotion evidence. Only then clean temporary worktrees and backup material under retention policy.

## Cleanup Rules

Temporary Linux worktrees can be removed after their dirty state is saved and their commits are reachable from a durable lane or backup ref. Use normal worktree removal and delete the branch only after reachability is proven.

```bash
git worktree remove <path>
git branch -d <temporary-branch>
```

Never remove the durable lane worktrees: `/home/jgigg/code/t3code`, `.worktrees/original`, `.worktrees/nightly`, or `.worktrees/staging`.

## Failure Rules

If any Staging check fails, leave Main untouched and return the defect to a dev topic. If the two-host transaction has begun and either host fails, stop both candidate launchers, run `~/.local/bin/t3code-main-uptime promotion-abort` on Linux, restore the Mac and any published Git refs from their captured backups, and relaunch both old versions. A successful Linux-only relaunch is a failed fleet promotion when the Mac is unavailable or unhealthy.
