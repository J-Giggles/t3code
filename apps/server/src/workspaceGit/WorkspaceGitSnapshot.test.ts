// @effect-diagnostics nodeBuiltinImport:off - Tests create temporary git repositories with Node fs/process helpers.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readWorkspaceGitSnapshot } from "./WorkspaceGitSnapshot.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-workspace-git-"));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, args: readonly string[]): void {
  NodeChildProcess.execFileSync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_AUTHOR_NAME: "Test User",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test User",
    },
    stdio: "pipe",
  });
}

function initRepo(dir: string, fileName: string): void {
  NodeFS.mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-b", "main"]);
  NodeFS.writeFileSync(NodePath.join(dir, fileName), "initial\n");
  git(dir, ["add", fileName]);
  git(dir, ["commit", "-m", `Add ${fileName}`]);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    NodeFS.rmSync(dir, { recursive: true, force: true });
  }
});

describe("readWorkspaceGitSnapshot", () => {
  it("discovers repos, remotes, worktrees, dirty state, ahead/behind, and recent commits", () => {
    const workspace = makeTempDir();
    initRepo(workspace, "README.md");

    const nested = NodePath.join(workspace, "nested-repo");
    initRepo(nested, "nested.txt");

    const remoteRoot = makeTempDir();
    const remote = NodePath.join(remoteRoot, "nested.git");
    NodeFS.mkdirSync(remote);
    git(remote, ["init", "--bare"]);
    git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
    git(nested, ["remote", "add", "origin", remote]);
    git(nested, ["push", "-u", "origin", "HEAD:main"]);

    const remoteClone = NodePath.join(remoteRoot, "remote-clone");
    git(remoteRoot, ["clone", remote, remoteClone]);
    NodeFS.writeFileSync(NodePath.join(remoteClone, "remote.txt"), "remote\n");
    git(remoteClone, ["add", "remote.txt"]);
    git(remoteClone, ["commit", "-m", "Remote update"]);
    git(remoteClone, ["push", "origin", "main"]);

    NodeFS.writeFileSync(NodePath.join(nested, "local.txt"), "local\n");
    git(nested, ["add", "local.txt"]);
    git(nested, ["commit", "-m", "Local update"]);
    git(nested, ["fetch", "origin"]);

    const worktree = NodePath.join(workspace, "nested-worktree");
    git(nested, ["worktree", "add", "-b", "feature/test", worktree]);
    NodeFS.writeFileSync(NodePath.join(worktree, "dirty.txt"), "dirty\n");

    const snapshot = readWorkspaceGitSnapshot({
      rootPath: workspace,
      config: { cwd: workspace },
    });

    expect(snapshot.rootPath).toBe(NodeFS.realpathSync.native(workspace));
    expect(snapshot.repositories.length).toBe(2);

    const nestedRepo = snapshot.repositories.find((repo) => repo.rootPath === nested);
    expect(nestedRepo?.remotes.map((remote) => remote.name)).toEqual(["origin"]);
    expect(nestedRepo?.worktrees.map((entry) => entry.path).sort()).toEqual(
      [nested, worktree].sort(),
    );

    const mainWorktree = nestedRepo?.worktrees.find((entry) => entry.path === nested);
    expect(mainWorktree?.branch).toBe("main");
    expect(mainWorktree?.aheadCount).toBe(1);
    expect(mainWorktree?.behindCount).toBe(1);
    expect(mainWorktree?.recentCommits[0]?.subject).toBe("Local update");

    const dirtyWorktree = nestedRepo?.worktrees.find((entry) => entry.path === worktree);
    expect(dirtyWorktree?.branch).toBe("feature/test");
    expect(dirtyWorktree?.untrackedCount).toBe(1);
    expect(dirtyWorktree?.hasUncommittedChanges).toBe(true);
    expect(dirtyWorktree?.changedFiles[0]?.path).toBe("dirty.txt");
  });
});
