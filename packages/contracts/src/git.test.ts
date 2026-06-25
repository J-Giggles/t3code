import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  VcsCreateWorktreeInput,
  GitPreparePullRequestThreadInput,
  GitRunStackedActionResult,
  GitRunStackedActionInput,
  GitResolvePullRequestResult,
  WorkspaceGitSnapshotResult,
} from "./git.ts";

const decodeCreateWorktreeInput = Schema.decodeUnknownSync(VcsCreateWorktreeInput);
const decodePreparePullRequestThreadInput = Schema.decodeUnknownSync(
  GitPreparePullRequestThreadInput,
);
const decodeRunStackedActionInput = Schema.decodeUnknownSync(GitRunStackedActionInput);
const decodeRunStackedActionResult = Schema.decodeUnknownSync(GitRunStackedActionResult);
const decodeResolvePullRequestResult = Schema.decodeUnknownSync(GitResolvePullRequestResult);
const decodeWorkspaceGitSnapshotResult = Schema.decodeUnknownSync(WorkspaceGitSnapshotResult);

describe("VcsCreateWorktreeInput", () => {
  it("accepts omitted newRefName for existing-refName worktrees", () => {
    const parsed = decodeCreateWorktreeInput({
      cwd: "/repo",
      refName: "feature/existing",
      path: "/tmp/worktree",
    });

    expect(parsed.newRefName).toBeUndefined();
    expect(parsed.refName).toBe("feature/existing");
  });

  it("accepts baseRefName metadata for a new worktree ref", () => {
    const parsed = decodeCreateWorktreeInput({
      cwd: "/repo",
      refName: "0123456789abcdef",
      newRefName: "feature/new",
      baseRefName: "origin/main",
      path: "/tmp/worktree",
    });

    expect(parsed.baseRefName).toBe("origin/main");
  });
});

describe("GitPreparePullRequestThreadInput", () => {
  it("accepts pull request references and mode", () => {
    const parsed = decodePreparePullRequestThreadInput({
      cwd: "/repo",
      reference: "#42",
      mode: "worktree",
    });

    expect(parsed.reference).toBe("#42");
    expect(parsed.mode).toBe("worktree");
  });
});

describe("GitResolvePullRequestResult", () => {
  it("decodes resolved pull request metadata", () => {
    const parsed = decodeResolvePullRequestResult({
      pullRequest: {
        number: 42,
        title: "PR threads",
        url: "https://github.com/pingdotgg/codething-mvp/pull/42",
        baseBranch: "main",
        headBranch: "feature/pr-threads",
        state: "open",
      },
    });

    expect(parsed.pullRequest.number).toBe(42);
    expect(parsed.pullRequest.headBranch).toBe("feature/pr-threads");
  });
});

describe("GitRunStackedActionInput", () => {
  it("accepts explicit stacked actions and requires a client-provided actionId", () => {
    const parsed = decodeRunStackedActionInput({
      actionId: "action-1",
      cwd: "/repo",
      action: "create_pr",
    });

    expect(parsed.actionId).toBe("action-1");
    expect(parsed.action).toBe("create_pr");
  });
});

describe("GitRunStackedActionResult", () => {
  it("decodes a server-authored completion toast", () => {
    const parsed = decodeRunStackedActionResult({
      action: "commit_push",
      branch: {
        status: "created",
        name: "feature/server-owned-toast",
      },
      commit: {
        status: "created",
        commitSha: "89abcdef01234567",
        subject: "feat: move toast state into git manager",
      },
      push: {
        status: "pushed",
        branch: "feature/server-owned-toast",
        upstreamBranch: "origin/feature/server-owned-toast",
      },
      pr: {
        status: "skipped_not_requested",
      },
      toast: {
        title: "Pushed 89abcde to origin/feature/server-owned-toast",
        description: "feat: move toast state into git manager",
        cta: {
          kind: "run_action",
          label: "Create PR",
          action: {
            kind: "create_pr",
          },
        },
      },
    });

    expect(parsed.toast.cta.kind).toBe("run_action");
    if (parsed.toast.cta.kind === "run_action") {
      expect(parsed.toast.cta.action.kind).toBe("create_pr");
    }
  });
});

describe("WorkspaceGitSnapshotResult", () => {
  it("decodes repository, worktree, remote, dirty file, and recent commit state", () => {
    const parsed = decodeWorkspaceGitSnapshotResult({
      rootPath: "/workspace",
      generatedAt: "2026-06-15T10:00:00.000Z",
      repositories: [
        {
          id: "/workspace/.git",
          label: "workspace",
          rootPath: "/workspace",
          commonGitDir: "/workspace/.git",
          remotes: [
            {
              name: "origin",
              fetchUrl: "git@github.com:example/workspace.git",
              pushUrl: "git@github.com:example/workspace.git",
            },
          ],
          worktrees: [
            {
              id: "/workspace",
              path: "/workspace",
              label: "workspace",
              branch: "main",
              headSha: "89abcdef01234567",
              headSubject: "feat: workspace git",
              upstream: "origin/main",
              aheadCount: 1,
              behindCount: 0,
              hasUncommittedChanges: true,
              stagedCount: 1,
              unstagedCount: 1,
              untrackedCount: 1,
              changedFiles: [
                {
                  path: "src/index.ts",
                  indexStatus: "M",
                  worktreeStatus: " ",
                },
              ],
              recentCommits: [
                {
                  sha: "89abcdef01234567",
                  shortSha: "89abcde",
                  subject: "feat: workspace git",
                  authorName: "Test User",
                  relativeDate: "2 minutes ago",
                  pushed: false,
                },
              ],
              statusError: null,
            },
          ],
        },
      ],
    });

    expect(parsed.repositories[0]?.worktrees[0]?.recentCommits[0]?.pushed).toBe(false);
  });
});
