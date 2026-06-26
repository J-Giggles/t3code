# Project Git Dashboard And VCS Reconciliation

## Purpose

Expose reliable project Git state and reconcile VCS refreshes without blocking chat or stale workspace snapshots.

## Current Commits

- `caee2ec7bad7b8b722e43ab206f3d332a474fd57` `feat(project-git): add project Git dashboard and VCS reconciliation`

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

Pending legacy extraction:

- `apps/web/src/localTopics/projectGit/index.ts`
- `apps/server/src/localTopics/projectGit/index.ts`
- `packages/shared/src/localTopics/projectGit/index.ts`

## Integration Points

- `apps/server/src/workspaceGit`
- `apps/server/src/vcs`
- `apps/web/src/components/projectGit`
- `packages/shared/src/git.ts`

## Focused Implementation Snippets

`apps/server/src/workspaceGit/WorkspaceGitSnapshot.ts`

```ts
readWorkspaceGitSnapshot(workspacePath);
statusEntries;
branchName;
remoteSummary;
```

`apps/web/src/components/projectGit`

```ts
renderBranchSummary(snapshot);
renderChangedFiles(snapshot.statusEntries);
```

## Replay Notes

Replay after runtime so snapshots are associated with the correct worktree identity.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Extract dashboard state shaping into `localTopics/projectGit` modules.
