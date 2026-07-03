# Project Git Dashboard And VCS Reconciliation

## Purpose

Expose reliable project Git state and reconcile VCS refreshes without blocking chat or stale workspace snapshots.

## Current Commits

- `32342110d042f76e43b8c4bcd127d845a096c690` `feat(project-git): add project Git dashboard and VCS reconciliation`

## Squash / Replay History

This is the project Git topic from the June 25 replay stack.

## Added Features

- [x] Workspace Git snapshot collection and shared Git helpers are topic-owned (`apps/server/src/workspaceGit/WorkspaceGitSnapshot.ts`, `packages/shared/src/localTopics/projectGit/index.ts`).
- [x] Project Git dashboard contracts expose branch, status, and repository context (`packages/contracts/src/project.ts`, `apps/web/src/localTopics/projectGit/index.ts`).
- [x] VCS refresh reconciliation keeps long-lived sessions current (`apps/server/src/vcs`, `apps/server/src/localTopics/projectGit/index.ts`).

## Added UI

- [x] Project Git dashboard panels render repository metrics and changes (`apps/web/src/localTopics/projectGit/index.ts`, `apps/desktop/e2e/specs/workspace-git.spec.ts`).

## Added Server And Runtime Behavior

- [x] Server-side workspace Git scanning is isolated from UI render loops (`apps/server/src/workspaceGit/WorkspaceGitSnapshot.ts`).
- [x] VCS reconciliation updates project state without replacing unrelated runtime state (`apps/server/src/vcs`, `packages/client-runtime/src/state/vcs.ts`).

## Added Tests

- [x] Workspace Git snapshot and VCS reconciliation behavior are covered by focused tests (`apps/server/src/workspaceGit/WorkspaceGitSnapshot.test.ts`, `packages/client-runtime/src/state/vcsAction.test.ts`).

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
