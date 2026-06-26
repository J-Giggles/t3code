# Project Git Dashboard And VCS Reconciliation

## Purpose

Expose reliable project Git state and reconcile VCS refreshes without blocking chat or stale workspace snapshots.

## Current Commits

- `32342110d042f76e43b8c4bcd127d845a096c690` `feat(project-git): add project Git dashboard and VCS reconciliation`

## Squash / Replay History

This is the project Git topic from the June 25 replay stack.

## Added Features

- Workspace Git snapshot collection and shared Git helpers.
- Project Git dashboard data contracts.
- VCS refresh reconciliation for long-lived sessions.

## Added UI

- Project Git dashboard panels for branch, status, and repository context.

## Added Server And Runtime Behavior

- Server-side workspace Git scanning is isolated from UI render loops.
- VCS reconciliation updates project state without replacing unrelated runtime state.

## Added Tests

- Workspace Git snapshot and VCS reconciliation tests.

## Component Entrypoints

Componentization status: `complete`.

- `packages/shared/src/localTopics/projectGit/index.ts` (source, facade)
- `apps/server/src/localTopics/projectGit/index.ts` (source, internal)
- `apps/web/src/localTopics/projectGit/index.ts` (source, internal)

## Integration Points

- `apps/server/src/workspaceGit`
- `apps/server/src/vcs`
- `apps/web/src/components/projectGit`
- `packages/shared/src/git.ts`

## Focused Implementation Snippets

`packages/shared/src/localTopics/projectGit/index.ts`

```ts
export * from "../../git.ts";
```

`apps/server/src/localTopics/projectGit/index.ts`

```ts
export * from "../../workspaceGit/WorkspaceGitSnapshot.ts";
export * from "../../vcs/GitVcsDriver.ts";
export * from "../../vcs/VcsStatusBroadcaster.ts";
```

## Replay Notes

Replay after runtime so snapshots are associated with the correct worktree identity.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
