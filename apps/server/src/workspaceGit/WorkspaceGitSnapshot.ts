// @effect-diagnostics nodeBuiltinImport:off - Workspace Git scanning uses bounded synchronous git/fs probes.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type {
  WorkspaceGitChangedFile,
  WorkspaceGitCommit,
  WorkspaceGitRemote,
  WorkspaceGitRepositorySnapshot,
  WorkspaceGitSnapshotResult,
  WorkspaceGitWorktreeSnapshot,
} from "@t3tools/contracts";
import { GitCommandError } from "@t3tools/contracts";

import type { ServerConfigShape } from "../config.ts";

const SCAN_EXCLUDED_DIRS = new Set([
  ".cache",
  ".git",
  ".local",
  ".turbo",
  "build",
  "dist",
  "local-dev-bundle",
  "node_modules",
]);

const GIT_TIMEOUT_MS = 8_000;
const GIT_MAX_BUFFER = 256 * 1024;
const MAX_SCAN_DEPTH = 4;
const MAX_CHANGED_FILES = 500;

interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface WorktreePorcelain {
  readonly path: string;
  readonly branch: string | null;
  readonly head: string | null;
}

function runGit(cwd: string, args: readonly string[], allowFailure = false): GitResult {
  const result = NodeChildProcess.spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
    timeout: GIT_TIMEOUT_MS,
  });

  const status = result.status ?? (result.error ? 1 : 0);
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";

  if (!allowFailure && status !== 0) {
    throw new GitCommandError({
      operation: "WorkspaceGitSnapshot.runGit",
      command: `git ${args.join(" ")}`,
      cwd,
      detail: stderr.trim() || result.error?.message || "git command failed",
      ...(result.error ? { cause: result.error } : {}),
    });
  }

  return { status, stdout, stderr };
}

function tryRunGit(cwd: string, args: readonly string[]): GitResult | null {
  const result = runGit(cwd, args, true);
  return result.status === 0 ? result : null;
}

function realpathOrPath(path: string): string {
  try {
    return NodeFS.realpathSync.native(path);
  } catch {
    return path;
  }
}

function isDirectory(path: string): boolean {
  try {
    return NodeFS.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function basenameLabel(path: string): string {
  return NodePath.basename(path) || path;
}

function resolveGitPath(cwd: string, gitPath: string): string {
  return NodePath.isAbsolute(gitPath) ? gitPath : NodePath.resolve(cwd, gitPath);
}

function resolveConfiguredProjectRoot(
  config: Pick<ServerConfigShape, "cwd">,
  requestedRoot?: string,
): string {
  if (requestedRoot?.trim()) {
    return NodePath.resolve(requestedRoot.trim());
  }

  const envRoot = process.env.T3CODE_LOCAL_WORKSPACE?.trim();
  if (envRoot) {
    return NodePath.resolve(envRoot);
  }

  const appRoot = process.env.T3CODE_APP_ROOT?.trim() || config.cwd;
  const appRootPath = NodePath.resolve(appRoot);
  const worktreeRoot = tryRunGit(appRootPath, ["rev-parse", "--show-toplevel"])?.stdout.trim();
  const candidate = worktreeRoot ? NodePath.resolve(worktreeRoot) : appRootPath;
  const parent = NodePath.dirname(candidate);

  if (NodePath.basename(parent) === "t3code-local") {
    return parent;
  }

  return candidate;
}

function discoverRepoRoots(rootPath: string): string[] {
  const repos = new Map<string, string>();

  function visit(dir: string, depth: number): void {
    const topLevel = tryRunGit(dir, ["rev-parse", "--show-toplevel"])?.stdout.trim();
    if (topLevel) {
      const repoRoot = NodePath.resolve(topLevel);
      repos.set(realpathOrPath(repoRoot), repoRoot);
    }

    if (depth >= MAX_SCAN_DEPTH) {
      return;
    }

    let entries: NodeFS.Dirent[];
    try {
      entries = NodeFS.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SCAN_EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      visit(NodePath.join(dir, entry.name), depth + 1);
    }
  }

  if (isDirectory(rootPath)) {
    visit(rootPath, 0);
  }

  return [...repos.values()].sort((left, right) => left.localeCompare(right));
}

function parseWorktreeList(stdout: string): WorktreePorcelain[] {
  const blocks = stdout
    .split(/\n(?=worktree )/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.flatMap((block) => {
    let path: string | null = null;
    let branch: string | null = null;
    let head: string | null = null;

    for (const line of block.split("\n")) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length).trim();
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length).trim();
        branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length).trim();
      } else if (line === "detached") {
        branch = null;
      }
    }

    return path ? [{ path, branch, head }] : [];
  });
}

function parseRemotes(stdout: string): WorkspaceGitRemote[] {
  const remotes = new Map<string, { fetchUrl: string | null; pushUrl: string | null }>();

  for (const line of stdout.split("\n")) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
    if (!match) {
      continue;
    }

    const name = match[1];
    const url = match[2];
    const kind = match[3];
    if (!name || !url || !kind) {
      continue;
    }

    const current = remotes.get(name) ?? { fetchUrl: null, pushUrl: null };
    remotes.set(name, {
      fetchUrl: kind === "fetch" ? url : current.fetchUrl,
      pushUrl: kind === "push" ? url : current.pushUrl,
    });
  }

  return [...remotes.entries()]
    .flatMap(([name, remote]) => {
      if (!remote.fetchUrl) {
        return [];
      }
      return [{ name, fetchUrl: remote.fetchUrl, pushUrl: remote.pushUrl }];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseBranchHeader(line: string): {
  readonly aheadCount: number;
  readonly behindCount: number;
} {
  const aheadMatch = /\bahead (\d+)/.exec(line);
  const behindMatch = /\bbehind (\d+)/.exec(line);
  return {
    aheadCount: aheadMatch?.[1] ? Number(aheadMatch[1]) : 0,
    behindCount: behindMatch?.[1] ? Number(behindMatch[1]) : 0,
  };
}

function parseChangedFiles(lines: readonly string[]): {
  readonly changedFiles: WorkspaceGitChangedFile[];
  readonly stagedCount: number;
  readonly unstagedCount: number;
  readonly untrackedCount: number;
} {
  let stagedCount = 0;
  let unstagedCount = 0;
  let untrackedCount = 0;
  const changedFiles: WorkspaceGitChangedFile[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("## ")) {
      continue;
    }

    const indexStatus = line.slice(0, 1);
    const worktreeStatus = line.slice(1, 2);
    const path = line.slice(3).trim();
    if (!path) {
      continue;
    }

    if (indexStatus === "?" && worktreeStatus === "?") {
      untrackedCount += 1;
    } else {
      if (indexStatus !== " ") {
        stagedCount += 1;
      }
      if (worktreeStatus !== " ") {
        unstagedCount += 1;
      }
    }

    if (changedFiles.length < MAX_CHANGED_FILES) {
      changedFiles.push({ path, indexStatus, worktreeStatus });
    }
  }

  return { changedFiles, stagedCount, unstagedCount, untrackedCount };
}

function parseRecentCommits(
  stdout: string,
  cwd: string,
  hasRemotes: boolean,
): WorkspaceGitCommit[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [sha, shortSha, authorName, relativeDate, ...subjectParts] = line.split("\t");
      if (!sha || !shortSha) {
        return [];
      }

      const pushed = hasRemotes
        ? (tryRunGit(cwd, ["branch", "-r", "--contains", sha])?.stdout.trim().length ?? 0) > 0
        : null;

      return [
        {
          sha,
          shortSha,
          authorName: authorName ?? "",
          relativeDate: relativeDate ?? "",
          subject: subjectParts.join("\t"),
          pushed,
        },
      ];
    });
}

function readWorktreeSnapshot(
  worktree: WorktreePorcelain,
  commonRoot: string,
  remotes: readonly WorkspaceGitRemote[],
): WorkspaceGitWorktreeSnapshot {
  const cwd = NodePath.resolve(worktree.path);
  const label = cwd === commonRoot ? basenameLabel(cwd) : NodePath.relative(commonRoot, cwd) || cwd;

  try {
    const status = runGit(cwd, ["status", "--porcelain=v1", "--branch"]);
    const statusLines = status.stdout.split("\n").filter(Boolean);
    const header = statusLines.find((line) => line.startsWith("## ")) ?? "";
    const parsedHeader = parseBranchHeader(header);
    const changes = parseChangedFiles(statusLines);
    const branchResult = tryRunGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branchValue = branchResult?.stdout.trim();
    const branch = branchValue && branchValue !== "HEAD" ? branchValue : worktree.branch;
    const headSha = tryRunGit(cwd, ["rev-parse", "HEAD"])?.stdout.trim() || worktree.head;
    const headSubject =
      tryRunGit(cwd, ["log", "-1", "--pretty=%s"])?.stdout.replace(/\n$/, "") || null;
    const upstream =
      tryRunGit(cwd, [
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ])?.stdout.trim() || null;
    const aheadBehind =
      upstream !== null
        ? tryRunGit(cwd, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`])
        : null;
    const [behindRaw, aheadRaw] = aheadBehind?.stdout.trim().split(/\s+/) ?? [];
    const aheadCount = aheadRaw === undefined ? parsedHeader.aheadCount : Number(aheadRaw);
    const behindCount = behindRaw === undefined ? parsedHeader.behindCount : Number(behindRaw);
    const commits = tryRunGit(cwd, [
      "log",
      "-10",
      "--date=relative",
      "--pretty=format:%H%x09%h%x09%an%x09%cr%x09%s",
    ]);

    return {
      id: realpathOrPath(cwd),
      path: cwd,
      label,
      branch,
      headSha,
      headSubject,
      upstream,
      aheadCount: Number.isFinite(aheadCount) ? aheadCount : 0,
      behindCount: Number.isFinite(behindCount) ? behindCount : 0,
      hasUncommittedChanges:
        changes.stagedCount > 0 || changes.unstagedCount > 0 || changes.untrackedCount > 0,
      stagedCount: changes.stagedCount,
      unstagedCount: changes.unstagedCount,
      untrackedCount: changes.untrackedCount,
      changedFiles: changes.changedFiles,
      recentCommits: commits ? parseRecentCommits(commits.stdout, cwd, remotes.length > 0) : [],
      statusError: null,
    };
  } catch (error) {
    return {
      id: realpathOrPath(cwd),
      path: cwd,
      label,
      branch: worktree.branch,
      headSha: worktree.head,
      headSubject: null,
      upstream: null,
      aheadCount: 0,
      behindCount: 0,
      hasUncommittedChanges: false,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      changedFiles: [],
      recentCommits: [],
      statusError: error instanceof Error ? error.message : "Unable to read worktree status.",
    };
  }
}

export function readWorkspaceGitSnapshot(input: {
  readonly config: Pick<ServerConfigShape, "cwd">;
  readonly rootPath?: string | undefined;
}): WorkspaceGitSnapshotResult {
  const rootPath = realpathOrPath(resolveConfiguredProjectRoot(input.config, input.rootPath));
  if (!isDirectory(rootPath)) {
    throw new GitCommandError({
      operation: "WorkspaceGitSnapshot.discover",
      command: "scan workspace git repositories",
      cwd: rootPath,
      detail: "Workspace Git root is not a directory.",
    });
  }

  const repositoriesByCommonDir = new Map<string, WorkspaceGitRepositorySnapshot>();

  for (const repoRoot of discoverRepoRoots(rootPath)) {
    const commonDirRaw = tryRunGit(repoRoot, ["rev-parse", "--git-common-dir"])?.stdout.trim();
    const commonGitDir = commonDirRaw
      ? realpathOrPath(resolveGitPath(repoRoot, commonDirRaw))
      : null;
    const repositoryKey = commonGitDir ?? realpathOrPath(repoRoot);
    if (repositoriesByCommonDir.has(repositoryKey)) {
      continue;
    }

    const worktrees = parseWorktreeList(
      tryRunGit(repoRoot, ["worktree", "list", "--porcelain"])?.stdout ?? "",
    );
    const rootWorktreePath = NodePath.resolve(worktrees[0]?.path ?? repoRoot);
    const remotes = parseRemotes(tryRunGit(repoRoot, ["remote", "-v"])?.stdout ?? "");
    const commonRoot = NodePath.dirname(rootWorktreePath);
    const snapshotWorktrees =
      worktrees.length > 0 ? worktrees : [{ path: repoRoot, branch: null, head: null }];

    repositoriesByCommonDir.set(repositoryKey, {
      id: repositoryKey,
      label: basenameLabel(rootWorktreePath),
      rootPath: rootWorktreePath,
      commonGitDir,
      remotes,
      worktrees: snapshotWorktrees
        .map((worktree) => readWorktreeSnapshot(worktree, commonRoot, remotes))
        .sort((left, right) => left.path.localeCompare(right.path)),
    });
  }

  return {
    rootPath,
    repositories: [...repositoriesByCommonDir.values()].sort((left, right) =>
      left.rootPath.localeCompare(right.rootPath),
    ),
    // @effect-diagnostics-next-line globalDate:off
    generatedAt: new Date().toISOString(),
  };
}
