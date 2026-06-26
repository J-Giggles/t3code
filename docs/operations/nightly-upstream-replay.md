# Nightly Upstream Replay

This workflow keeps the resettable upstream mirror fresh and rebuilds the local
topic stack in a rolling candidate worktree. It does not promote anything to
`staging`.

## Worktrees

- `/home/jgigg/code/t3code/.worktrees/original` is a resettable mirror of
  `upstream/main`. The nightly script creates a backup ref for dirty or
  divergent state, stashes dirty changes with untracked files, then resets the
  worktree to `upstream/main`.
- `/home/jgigg/code/t3code/.worktrees/nightly-local` is the rebuild candidate.
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
branch.

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

Existing topics can remain in legacy locations until touched. Mark pending
entrypoints in `plugin.json` and the plugin README so future refactors have an
explicit target.

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

1. Verifies `nightly-local` is not dirty.
2. Fetches `upstream --prune`.
3. Creates `refs/backup/original-before-nightly/YYYYMMDD-HHMMSS` when
   `original` is dirty or not at `upstream/main`.
4. Stashes dirty `original` changes with untracked files.
5. Resets `original` to `upstream/main` and removes untracked files.
6. Creates or reuses `.worktrees/nightly-local`.
7. Creates or resets branch `dev/nightly-topic-stack-YYYYMMDD`.
8. Cherry-picks manifest topics in order.
9. Records empty cherry-picks and skips them with `git cherry-pick --skip`.
10. Stops on conflicts and leaves `nightly-local` ready for human repair.
11. Runs `vp check`, `vp run typecheck`, and
    `pnpm run topic-plugins:check`.

Run artifacts are written under:

```text
.worktrees/nightly-local/.t3code-nightly-runs/YYYYMMDD-HHMMSS/
```

Conflict artifacts include `plan.json`, `topics.json`, and `failure.txt`.

## Promotion

Promotion is manual only:

```bash
cd /home/jgigg/code/t3code/.worktrees/staging
git status --short
git update-ref refs/backup/staging-before-nightly-promote/$(date +%Y%m%d-%H%M%S) staging
git merge --ff-only dev/nightly-topic-stack-YYYYMMDD
vp check
vp run typecheck
vp run verify:staging-public
```

If fast-forward fails, stop and resolve manually. Do not force-push, reset, or
rewrite `staging` as part of nightly replay.

## Future Work

A systemd timer can call the dry-run first and then apply mode once the manual
workflow has proven stable. Keep the timer out of the repo until the operator
contract, failure notification path, and artifact retention policy are clear.
