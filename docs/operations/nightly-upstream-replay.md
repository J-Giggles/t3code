# Nightly Upstream Replay

This workflow keeps the resettable `original` mirror current and rebuilds the local topic stack in the durable `nightly` candidate. It does not update `staging` or `main`.

## Durable Worktrees

- `/home/jgigg/code/t3code/.worktrees/original`: branch `original`, resettable mirror of `upstream/main`.
- `/home/jgigg/code/t3code/.worktrees/nightly`: branch `nightly`, latest upstream plus all local topics.
- `/home/jgigg/code/t3code/.worktrees/staging`: branch `staging`, updated only by explicit promotion.
- `/home/jgigg/code/t3code`: branch `main`, live working checkout.

A materially dirty nightly worktree fails closed. Original may be backed up, stashed with untracked files, and reset because product changes never belong there.

## Topic Metadata

Replay order is defined by `docs/operations/jordan-topic-stack.manifest.json`. Each entry points to `local-plugins/<topic>/plugin.json` and `README.md`. These folders are repo-internal feature contracts, not installable Codex plugins.

Schema v2 topics declare:

- componentized package-local entrypoints;
- owned paths and integration points;
- checked README inventory under `Added Features`, `Added UI`, `Added Server And Runtime Behavior`, and `Added Tests`;
- top-level verification commands;
- a Replay Contract defining intent, preserved behavior, safe repairs, human stop conditions, autonomy, and risk.

Validate all metadata with:

```bash
pnpm run topic-plugins:check
```

Local feature implementation should live under package-local modules such as `apps/web/src/localTopics/<topic>/index.ts`, with upstream-facing files kept as thin wiring.

## Commands

Read-only plan:

```bash
pnpm run topic-stack:nightly -- --dry-run
```

Apply directly:

```bash
pnpm run topic-stack:nightly -- --apply
```

Scheduled Linear-aware wrapper:

```bash
pnpm run nightly:upstream-agent -- --root /home/jgigg/code/t3code
```

The wrapper is the production entrypoint because it fetches first, creates a Linear issue only for actionable work, invokes bounded repair, and records the final issue status.

## Apply Sequence

1. Reject a dirty nightly lane.
2. Fetch `upstream --prune`.
3. Create original if missing; back up and stash divergent or dirty original state.
4. Reset original to `upstream/main` and remove untracked files there.
5. Create or reset nightly from original.
6. Enable `git rerere` and `rerere.autoupdate`.
7. Cherry-pick topic prerequisite, primary, and follow-up commits in manifest order.
8. Skip genuinely empty cherry-picks and continue complete remembered resolutions.
9. Pause on a new conflict for the wrapper's Replay Contract repair worker.
10. Reconcile stale dependency pins against current upstream and refresh the lockfile when required.
11. Copy current manifest-declared control-plane metadata into nightly and commit the generated delta.
12. Run frozen installation, `vp check`, `vp run typecheck`, and local topic validation under the pinned Node runtime.
13. Write the run audit and machine-readable artifacts.

## Repair Policy

Routine conflicts are resolved autonomously when the topic feature still has one unambiguous implementation on top of upstream:

1. `git rerere` reuses a prior Git conflict resolution.
2. Exact Repair Memory reuses declared path snapshots only when the topic commit and all unmerged stage blobs match exactly.
3. Otherwise a bounded Codex worker adapts code, imports, tests, schemas, dependencies, and thin wiring inside the topic's approved scope.
4. The parent validates paths, rejects conflict markers and unrelated edits, stages only approved files, records rerere, and reruns the full stack from clean upstream.
5. Repaired-topic verification runs against the completed stack.

The run stops for Jordan only when preserving the desired local feature requires a materially different product, architecture, security, or operator choice. Linear then receives one feature-level overview containing the collision, meaningful options, and an explicit recommendation. Individual conflict files remain in the technical artifact, not the decision request.

An optional internal `hermes -z` summarizer may produce `conflict-brief.md`; it does not send messages or own the decision workflow.

## Artifacts

Run artifacts live under:

```text
.worktrees/nightly/.t3code-nightly-runs/YYYYMMDD-HHMMSS/
```

Core files include:

```text
plan.json
topics.json
topic-audit.md
nightly-agent-report.md
nightly-agent-report.json
topic-catalog.md
linear-run.json
linear-summary.md
dependency-reconciliation.json
control-plane-sync.json
```

Conflict and repair runs may also include:

```text
failure.txt
conflict-packet.md
hermes-conflict-prompt.md
conflict-brief.md
conflict-brief.raw.md
conflict-brief-error.txt
autonomous-repair-prompt-attempt-<n>.md
autonomous-repair-result-schema-attempt-<n>.json
autonomous-repair-result-attempt-<n>.json
autonomous-repair-command-attempt-<n>.log
linear-repair-evidence-attempt-<n>.md
```

`topic-audit.md` records the base, backups, topic outcomes, verification, risk, and promotion sign-off. `topic-catalog.md` is the feature/test index for agents answering questions about the stack.

## Nightly Launcher

The durable nightly profile uses:

```text
web: 5833
server: 13873
cdp: 9234
public route: https://giggabit-server.tailfb378a.ts.net/nightly/
T3CODE_HOME: ~/.local/share/t3code-dev/nightly
XDG_CONFIG_HOME: ~/.config/t3code-dev/nightly
```

Reconcile and launch it with:

```bash
pnpm run omarchy:install-dev-launchers -- --write --target nightly
~/.local/bin/t3code-dev-nightly
vp run verify:nightly-public
```

Stop only this lane with `~/.local/bin/t3code-dev-nightly --kill` before a rebuild.

## Nightly Launcher

The Omarchy launcher target for this rebuilt worktree is `nightly`. It expects
`.worktrees/nightly-local` to be on `dev/nightly-topic-stack-YYYYMMDD`, serves
the app through `https://giggabit-server.tailfb378a.ts.net/nightly/`, and uses isolated
ports and app data:

```text
web: 5833
server: 13873
cdp: 9234
T3CODE_HOME: ~/.local/share/t3code-dev/nightly
XDG_CONFIG_HOME: ~/.config/t3code-dev/nightly
```

After a successful apply run, reconcile the launcher files:

```bash
pnpm run omarchy:install-dev-launchers -- --write --target nightly
```

Launch from the Omarchy menu entry `T3 Code Nightly`, or from a terminal:

```bash
~/.local/bin/t3code-dev-nightly
```

Stop only the nightly worktree processes with:

```bash
~/.local/bin/t3code-dev-nightly --kill
```

Verify the public HTTPS route with:

```bash
vp run verify:nightly-public
```

This verifier opens the `/nightly/` Tailscale URL from a Playwright browser,
performs the same primary-interface network preflight as the staging verifier,
creates a chat with `Hi`, and requires a non-empty assistant response.

## Promotion

Do not merge or reset staging from this workflow. A successful Linear run reaches `In Review`, then the explicit `$premote-nightly` flow verifies the issue and artifacts, advances `nightly -> staging`, proves staging, and only then advances `staging -> main` across Linux, GitHub, and the Mac. See `docs/operations/premote-nightly.md`.
