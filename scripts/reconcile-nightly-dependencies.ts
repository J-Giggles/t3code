#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Nightly replay reconciliation is a Node CLI around git and pnpm.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { runProcessCommand } from "./lib/command-runner.ts";
import { reconcileUpstreamExactDependencyVersions } from "./lib/nightly-dependency-reconciliation.ts";

function command(command: string, args: ReadonlyArray<string>, cwd: string): string {
  return runProcessCommand(command, args, cwd).stdout;
}

function parseArgs(args: ReadonlyArray<string>): {
  readonly worktree: string;
  readonly upstreamRef: string;
  readonly report: string;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Expected --worktree, --upstream-ref, and --report arguments.");
    }
    values.set(key, value);
  }
  const worktree = values.get("--worktree");
  const upstreamRef = values.get("--upstream-ref");
  const report = values.get("--report");
  if (worktree === undefined || upstreamRef === undefined || report === undefined) {
    throw new Error("Expected --worktree, --upstream-ref, and --report arguments.");
  }
  return {
    worktree: NodePath.resolve(worktree),
    upstreamRef,
    report: NodePath.resolve(report),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const trackedChanges = command(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=no"],
    args.worktree,
  );
  if (trackedChanges.trim().length > 0) {
    throw new Error(
      `Nightly worktree has tracked changes before dependency reconciliation:\n${trackedChanges}`,
    );
  }
  const packagePaths = command(
    "git",
    ["ls-tree", "-r", "--name-only", args.upstreamRef],
    args.worktree,
  )
    .split(/\r?\n/u)
    .filter((path) => path === "package.json" || path.endsWith("/package.json"));
  const changedPackagePaths: Array<string> = [];
  const changes: Array<Record<string, string>> = [];
  for (const packagePath of packagePaths) {
    const currentPath = NodePath.join(args.worktree, packagePath);
    if (!NodeFS.existsSync(currentPath)) continue;
    const current = JSON.parse(NodeFS.readFileSync(currentPath, "utf8")) as Record<string, unknown>;
    const upstream = JSON.parse(
      command("git", ["show", `${args.upstreamRef}:${packagePath}`], args.worktree),
    ) as Record<string, unknown>;
    const reconciled = reconcileUpstreamExactDependencyVersions(current, upstream);
    if (reconciled.changes.length === 0) continue;
    NodeFS.writeFileSync(currentPath, `${JSON.stringify(reconciled.manifest, undefined, 2)}\n`);
    changedPackagePaths.push(packagePath);
    changes.push(...reconciled.changes.map((change) => ({ packagePath, ...change })));
  }

  command(
    "corepack",
    ["pnpm", "install", "--lockfile-only", "--no-frozen-lockfile"],
    args.worktree,
  );
  command("git", ["add", "--", "pnpm-lock.yaml", ...changedPackagePaths], args.worktree);
  const staged = runProcessCommand("git", ["diff", "--cached", "--quiet"], args.worktree, {
    allowFailure: true,
  });
  let commit: string | undefined;
  if (staged.exitCode !== 0) {
    command(
      "git",
      ["commit", "-m", "chore(nightly): reconcile upstream dependency versions"],
      args.worktree,
    );
    commit = command("git", ["rev-parse", "HEAD"], args.worktree).trim();
  }
  NodeFS.mkdirSync(NodePath.dirname(args.report), { recursive: true });
  NodeFS.writeFileSync(
    args.report,
    `${JSON.stringify({ upstreamRef: args.upstreamRef, changes, commit: commit ?? null }, undefined, 2)}\n`,
  );
  process.stdout.write(
    `${changes.length} upstream dependency pin${changes.length === 1 ? "" : "s"} reconciled${commit === undefined ? " without a generated commit" : ` in ${commit.slice(0, 10)}`}\n`,
  );
}

main();
