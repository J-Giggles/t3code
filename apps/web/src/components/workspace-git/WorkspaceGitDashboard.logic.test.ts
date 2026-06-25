import { describe, expect, it } from "vitest";

import type { WorkspaceGitSnapshotResult, WorkspaceGitWorktreeSnapshot } from "@t3tools/contracts";

import {
  resolveWorkspaceGitActionDisabledReason,
  summarizeWorkspaceGitSnapshot,
  visibleChangedFiles,
} from "./WorkspaceGitDashboard.logic";

function worktree(overrides: Partial<WorkspaceGitWorktreeSnapshot>): WorkspaceGitWorktreeSnapshot {
  return {
    id: overrides.path ?? "/repo",
    path: overrides.path ?? "/repo",
    label: "repo",
    branch: "main",
    headSha: "abc123",
    headSubject: "Initial",
    upstream: "origin/main",
    aheadCount: 0,
    behindCount: 0,
    hasUncommittedChanges: false,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    changedFiles: [],
    recentCommits: [],
    statusError: null,
    ...overrides,
  };
}

describe("WorkspaceGitDashboard.logic", () => {
  it("summarizes repositories and worktree state", () => {
    const snapshot: WorkspaceGitSnapshotResult = {
      rootPath: "/workspace",
      generatedAt: "2026-06-15T00:00:00.000Z",
      repositories: [
        {
          id: "/workspace/.git",
          label: "workspace",
          rootPath: "/workspace",
          commonGitDir: "/workspace/.git",
          remotes: [],
          worktrees: [
            worktree({ path: "/workspace", hasUncommittedChanges: true }),
            worktree({ path: "/workspace/app", aheadCount: 2, behindCount: 1 }),
          ],
        },
      ],
    };

    expect(summarizeWorkspaceGitSnapshot(snapshot)).toEqual({
      repositoryCount: 1,
      worktreeCount: 2,
      dirtyWorktreeCount: 1,
      aheadWorktreeCount: 1,
      behindWorktreeCount: 1,
    });
  });

  it("limits visible changed files", () => {
    const changedFiles = Array.from({ length: 52 }, (_, index) => ({
      path: `file-${index}.ts`,
      indexStatus: "M",
      worktreeStatus: " ",
    }));

    expect(visibleChangedFiles(worktree({ changedFiles }), 50)).toMatchObject({
      files: changedFiles.slice(0, 50),
      hiddenCount: 2,
    });
  });

  it("explains disabled push states", () => {
    expect(
      resolveWorkspaceGitActionDisabledReason(
        worktree({ branch: null, aheadCount: 1 }),
        "push",
        false,
        true,
      ),
    ).toContain("Detached HEAD");

    expect(
      resolveWorkspaceGitActionDisabledReason(
        worktree({ aheadCount: 1, hasUncommittedChanges: true }),
        "push",
        false,
        true,
      ),
    ).toContain("push-only");

    expect(
      resolveWorkspaceGitActionDisabledReason(worktree({ aheadCount: 1 }), "push", false, true),
    ).toBeNull();
  });
});
