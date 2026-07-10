# Nightly Upstream Replay

This workflow keeps the resettable upstream mirror fresh and rebuilds the local
topic stack in a rolling candidate worktree. It does not promote anything to
`staging`.

## Worktrees

- `/home/jgigg/code/t3code/.worktrees/original` is a resettable mirror of
  `upstream/main`. The nightly script creates a backup ref for dirty or
  divergent state, stashes dirty changes with untracked files, then resets the
  worktree to `upstream/main`.
- `/home/jgigg/code/t3code/.worktrees/nightly` is the durable rebuild candidate.
  It is reused across runs. If it is dirty, the script fails closed before
  running mutating git commands.
- `/home/jgigg/code/t3code/.worktrees/staging` is updated only by manual
  promotion after verification.

## Topic Metadata

The replay order comes from
`docs/operations/jordan-topic-stack.manifest.json`. Every entry references a
repo-internal plugin folder under `local-plugins/<topic>/`. These folders are
not installable Codex plugins; do not add `.codex-plugin/plugin.json`.

Each plugin folder must keep `plugin.json` and `README.md` synchronized with the
manifest. The README snippets should stay focused and name the source file
paths they describe. When commits are squashed, split, renamed, dropped, or
materially changed, update the manifest and matching plugin README in the same
branch. `plugin.json` uses schema v2, and `pnpm run topic-plugins:check` is
strict by default.

Schema v2 topics also carry a required `replayContract` in `plugin.json`. It is
the machine-readable repair policy for that feature:

- `intent` states the user-facing or operator-facing goal.
- `preserve` lists behavior that must survive upstream refactors.
- `safeAutoRepair` lists mechanical or architectural adaptations an agent may
  make without asking Jordan.
- `stopForHuman` identifies product, architecture, security, or workflow
  decisions that must not be guessed.
- `autonomy` and `risk` bound whether the nightly wrapper may launch a repair
  worker.
- `verification` names proof commands and must be a subset of the topic's
  top-level verification commands. These commands must be headless and safe to
  run in the nightly worktree immediately after a repaired cherry-pick. Public
  staging/nightly verifiers and headed Electron checks remain later evidence,
  not repair-acceptance commands.

The README remains the human-readable feature inventory. The Replay Contract
does not replace its checked features and evidence paths.

Topic README `Added Features`, `Added UI`, `Added Server And Runtime Behavior`,
and `Added Tests` sections must contain checked Replay Checklist Items. Each
non-N/A item must include backticked evidence, such as a source path, test path,
command, or public route. The validator rejects empty sections, unchecked items,
missing evidence, stale evidence paths, and topics whose checklist is too thin
for their topic kind.

Validate metadata with:

```bash
pnpm run topic-plugins:check
```

## Componentization

New local topic code should live behind package-local topic modules, then be
imported from main files as thin wiring. Examples:

```text
apps/web/src/localTopics/remoteAccess/index.ts
apps/server/src/localTopics/remoteAccess/index.ts
packages/client-runtime/src/localTopics/remoteAccess/index.ts
```

Code, mixed, and test topics must list existing package-local component
entrypoints with `componentization.status = "complete"`. Docs-only topics use
`componentization.status = "not-applicable"`. Do not add public package exports
for `localTopics`; existing public files should stay as façades or thin wiring.

## Dry Run

Run:

```bash
pnpm run topic-stack:nightly -- --dry-run
```

Dry-run mode performs only read-only inspection. It prints the complete plan,
including the mutating commands that apply mode would run, but it does not fetch,
reset, create worktrees, cherry-pick, run checks, or write run artifacts.

## Apply

Run:

```bash
pnpm run topic-stack:nightly -- --apply
```

Apply mode:

1. Verifies `nightly` is not dirty.
2. Fetches `upstream --prune`.
3. Creates the reserved `.worktrees/original` lane on branch `original` when it
   is missing.
4. Creates `refs/backup/original-before-nightly/YYYYMMDD-HHMMSS` when
   `original` is dirty or not at `upstream/main`.
5. Stashes dirty `original` changes with untracked files.
6. Resets `original` to `upstream/main` and removes untracked files.
7. Creates or reuses `.worktrees/nightly`.
8. Creates or resets branch `nightly`.
9. Enables repo-local `git rerere` and `rerere.autoupdate` for repeat conflict
   memory.
10. Cherry-picks manifest topics in order.
11. Records empty cherry-picks and skips them with `git cherry-pick --skip`.
12. Auto-continues a cherry-pick when `rerere` has already applied a complete
    prior resolution.
13. Stops on new conflicts and leaves `nightly` ready for the scheduled
    wrapper's bounded repair worker or a human decision.
14. Reconciles exact dependency pins against `upstream/main`, preserving local
    additions while restoring any downgraded upstream versions, refreshes the
    lockfile, and creates a generated nightly-only reconciliation commit when
    needed.
15. Runs `corepack pnpm install --frozen-lockfile` in the rebuilt Nightly Lane.
16. Runs `vp check`, `vp run typecheck`, and the local topic plugin validator
    directly with the pinned Node runtime.
17. Writes a `topic-audit.md` stub for the run.

Run artifacts are written under:

```text
.worktrees/nightly/.t3code-nightly-runs/YYYYMMDD-HHMMSS/
```

Run artifacts include `plan.json`, `topics.json`, and `topic-audit.md`.
Successful completed replays also write `dependency-reconciliation.json` with
every restored upstream dependency pin and the generated reconciliation commit.
Conflict artifacts also include `failure.txt`, `conflict-packet.md`,
`hermes-conflict-prompt.md`, `conflict-brief.md`,
`conflict-brief.telegram.html`, `conflict-decision-card.telegram.html`,
`applied-topics.telegram.html`, `applied-topics.telegram.txt`,
`topic-stack-checklist.telegram.html`, `topic-stack-checklist.telegram.txt`,
`conflict-brief.raw.md`, and, when the brief cannot be generated or delivered,
`conflict-brief-error.txt`.

## Conflict Memory And Hermes Repair

Nightly replay uses a conservative conflict policy:

1. `git rerere` handles conflicts whose resolution has already been recorded in
   this repository. If the remembered resolution leaves no unmerged files, the
   script runs `git cherry-pick --continue` and records the topic commit as
   `auto-resolved`.
2. Exact Repair Memory handles conflict classes such as delete/modify entries
   that `git rerere` does not represent. A successful autonomous repair records
   only the declared path snapshots under `.t3code-nightly-repair-memory/`,
   keyed by topic commit and the complete `git ls-files -u` fingerprint. The
   replay engine reuses that recipe only when every conflict stage blob matches.
   If `rerere` resolves part of the same conflict first, the engine may reuse an
   exact subset of those recorded stage entries and restores only the residual
   conflicted paths. A changed upstream blob returns to autonomous analysis.
3. New conflicts are treated as auto-repair candidates by default. The
   scheduled wrapper reads the owning topic's Replay Contract and launches a
   bounded Codex worker whenever the topic is not marked `manual-decision`.
   Safe repair includes adapting code, imports, lockfiles, schemas, tests, and
   thin integration wiring to a new upstream shape while preserving the topic
   intent. Dependency repair preserves newer upstream manifest versions and
   regenerates compatible lock data; it never downgrades a manifest merely to
   reuse an older topic lockfile fragment.
4. When a conflict needs evidence, the run writes `conflict-packet.md` with the
   topic id, commit, unmerged files, conflict index, replay commit summary, and
   combined diff. It also writes `hermes-conflict-prompt.md`, which can be used
   directly in Telegram or with `hermes -z`.
5. The scheduled wrapper sends the first upstream summary as a compact Telegram
   HTML card. `telegram-upstream-summary.telegram.html` records the grouped
   official-change overview, commit preview, replay decision, and short local
   topic preview; `telegram-upstream-summary.md` is the plain fallback.
6. A successful repair completes the cherry-pick and reruns the entire replay
   from a clean base. Before accepting the repair, the wrapper parses the
   worker's schema-validated decision, rejects undeclared working-tree paths
   before staging, and explicitly records the staged resolution with
   `git rerere`. After the complete topic stack applies, the wrapper independently runs every headless
   Replay Contract verification command for each repaired topic. This ordering
   lets later topic dependencies land before proof while still rejecting a
   broken final stack.
7. The scheduled wrapper asks Hermes to turn conflict evidence into a
   Telegram-ready `Conflict Brief`. The brief is feature-level, not file-level,
   includes the attempted repair outcome, and always gives a recommendation
   plus confidence, risks, and proof needed. This happens only when autonomous
   repair was skipped, incomplete, failed, or classified as fundamental.
   For Telegram targets, the wrapper sends short HTML-formatted sections and a
   separate `Decision Card` with a one-time Telegram keyboard for auto-repair,
   show feature options, and defer. It also sends an `Applied Topics` card and a
   `Topic Stack Checklist` so every topic can be scanned without opening files.
   `conflict-brief.md` is bounded for Telegram and always keeps the final reply
   prompt; `conflict-brief.telegram.html` records the formatted sections;
   `conflict-decision-card.telegram.html` records the approval card;
   `applied-topics.telegram.html` records cleanly applied topics;
   `topic-stack-checklist.telegram.html` records the checklist; and
   `conflict-brief.raw.md` keeps the full Hermes draft. If direct Telegram
   formatting, Hermes generation, or delivery fails, the replay result remains
   the same conflict failure and the error is recorded beside the packet.
8. The final result notification is also sent as a compact Telegram HTML card.
   `telegram-summary.telegram.html` records the delivered status, replay
   summary, conflicts, proof summary, and report/catalog paths;
   `telegram-summary.md` remains the plain fallback.

Ask Hermes from the notification room with:

```text
@jgigg_hermes_bot read /home/jgigg/code/t3code/.worktrees/nightly/.t3code-nightly-runs/<run>/hermes-conflict-prompt.md and propose the safest resolution.
```

The scheduled wrapper performs that loop automatically when the Replay Contract
allows it. If a human-approved follow-up is needed, Hermes or another agent must
still edit only the `nightly` worktree, preserve both upstream and local topic
intent, stage the resolved files, run focused tests, and continue the
cherry-pick. Do not abort. Rerun the nightly workflow from scratch afterward so
`rerere` proves the decision before the remaining topics continue.

The script fills mechanical data in `topic-audit.md`, including the run id,
upstream head, original backup ref when one was needed, replay outcomes, and one
unchecked topic checklist placeholder per manifest topic. The operator must
complete the audit before promotion.

## Promotion

Promotion is manual only:

```bash
cd /home/jgigg/code/t3code/.worktrees/staging
git status --short
git update-ref refs/backup/staging-before-nightly-promote/$(date +%Y%m%d-%H%M%S) staging
git merge --ff-only nightly
vp check
vp run typecheck
vp run verify:staging-public
```

Before running the promotion commands, read and complete the run's
`topic-audit.md`. Promotion requires the audited branch diffs, topic checklist
confirmations, verification results, unresolved risks, and `Promotion Sign-Off`
section to be filled in by a human. If fast-forward fails, stop and resolve
manually. Do not force-push, reset, or rewrite `staging` as part of nightly
replay.

## Future Work

The server-owned scheduled wrapper is documented in
`docs/operations/nightly-upstream-agent.md`. It fetches upstream first, skips
cleanly when `upstream/main` has not changed, runs apply mode when replay is
needed, writes a full report, and sends a Hermes Telegram notification.
