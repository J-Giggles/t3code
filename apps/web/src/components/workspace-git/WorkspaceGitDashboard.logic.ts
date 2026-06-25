import type {
  GitStackedAction,
  WorkspaceGitSnapshotResult,
  WorkspaceGitWorktreeSnapshot,
} from "@t3tools/contracts";

export type WorkspaceGitTab = "overview" | "changes" | "commits";

export function summarizeWorkspaceGitSnapshot(snapshot: WorkspaceGitSnapshotResult | null) {
  const worktrees = snapshot?.repositories.flatMap((repository) => repository.worktrees) ?? [];
  return {
    repositoryCount: snapshot?.repositories.length ?? 0,
    worktreeCount: worktrees.length,
    dirtyWorktreeCount: worktrees.filter((worktree) => worktree.hasUncommittedChanges).length,
    aheadWorktreeCount: worktrees.filter((worktree) => worktree.aheadCount > 0).length,
    behindWorktreeCount: worktrees.filter((worktree) => worktree.behindCount > 0).length,
  };
}

export function visibleChangedFiles(worktree: WorkspaceGitWorktreeSnapshot, limit = 50) {
  return {
    files: worktree.changedFiles.slice(0, limit),
    hiddenCount: Math.max(0, worktree.changedFiles.length - limit),
  };
}

export function resolveWorkspaceGitActionDisabledReason(
  worktree: WorkspaceGitWorktreeSnapshot,
  action: GitStackedAction,
  isBusy: boolean,
  hasRemote: boolean,
): string | null {
  if (isBusy) {
    return "A source control action is already running for this worktree.";
  }
  if (worktree.statusError) {
    return "Status is unavailable for this worktree.";
  }
  if (action === "commit") {
    return worktree.hasUncommittedChanges ? null : "There are no changes to commit.";
  }
  if (worktree.branch === null) {
    return "Detached HEAD cannot be pushed from this dashboard.";
  }
  if (!hasRemote) {
    return "Add a Git remote before pushing.";
  }
  if (worktree.behindCount > 0) {
    return "Pull or rebase before pushing; this branch is behind upstream.";
  }
  if (action === "push") {
    if (worktree.hasUncommittedChanges) {
      return "Commit or stash local changes before push-only.";
    }
    return worktree.aheadCount > 0 ? null : "There are no local commits to push.";
  }
  return worktree.hasUncommittedChanges || worktree.aheadCount > 0
    ? null
    : "There are no changes or local commits to push.";
}
