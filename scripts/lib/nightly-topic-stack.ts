// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Nightly replay is a Node CLI that owns git process orchestration.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { type LocalTopicManifest, readLocalTopicManifest } from "./local-topic-stack.ts";

export type NightlyTopicStackMode = "dry-run" | "apply";
export type NightlyTopicStatus = "pending" | "applied" | "empty-skipped" | "conflict";

export interface NightlyCommandInvocation {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly description: string;
  readonly mutates: boolean;
  readonly allowFailure?: boolean;
}

export interface NightlyCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type NightlyCommandRunner = (invocation: NightlyCommandInvocation) => NightlyCommandResult;

export interface NightlyWorktreeState {
  readonly exists: boolean;
  readonly dirty: boolean;
  readonly head?: string;
}

export interface NightlyTopicStackPlanInput {
  readonly controlRoot: string;
  readonly repoFamilyRoot: string;
  readonly manifest: LocalTopicManifest;
  readonly runId: string;
  readonly dateKey: string;
  readonly upstreamRef: string;
  readonly upstreamHead: string;
  readonly originalPath: string;
  readonly original: NightlyWorktreeState;
  readonly nightlyPath: string;
  readonly nightly: NightlyWorktreeState;
}

export interface NightlyTopicStackPlan {
  readonly controlRoot: string;
  readonly repoFamilyRoot: string;
  readonly runId: string;
  readonly dateKey: string;
  readonly branchName: string;
  readonly upstreamRef: string;
  readonly originalPath: string;
  readonly nightlyPath: string;
  readonly artifactsDir: string;
  readonly blockers: ReadonlyArray<string>;
  readonly commands: ReadonlyArray<NightlyCommandInvocation>;
  readonly topics: ReadonlyArray<{
    readonly id: string;
    readonly subject: string;
    readonly commits: ReadonlyArray<string>;
  }>;
}

export interface NightlyRunTopicRecord {
  readonly id: string;
  readonly subject: string;
  readonly commit: string;
  readonly status: NightlyTopicStatus;
  readonly message?: string;
}

export interface NightlyTopicStackRunResult {
  readonly mode: NightlyTopicStackMode;
  readonly plan: NightlyTopicStackPlan;
  readonly topicRecords: ReadonlyArray<NightlyRunTopicRecord>;
}

export interface RunNightlyTopicStackOptions {
  readonly mode: NightlyTopicStackMode;
  readonly rootDir?: string;
  readonly now?: Date;
  readonly runner?: NightlyCommandRunner;
}

export interface ParsedNightlyTopicStackArgs {
  readonly mode: NightlyTopicStackMode;
  readonly rootDir?: string;
  readonly help: boolean;
}

const UPSTREAM_REMOTE = "upstream";
const UPSTREAM_REF = "upstream/main";
const NIGHTLY_WORKTREE_RELATIVE_PATH = ".worktrees/nightly-local";
const ORIGINAL_WORKTREE_RELATIVE_PATH = ".worktrees/original";
const RUNS_RELATIVE_PATH = ".t3code-nightly-runs";

function stringifyCommand(invocation: NightlyCommandInvocation): string {
  return [invocation.command, ...invocation.args].join(" ");
}

function defaultRunner(invocation: NightlyCommandInvocation): NightlyCommandResult {
  const result = NodeChildProcess.spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    encoding: "utf8",
  });

  const exitCode = typeof result.status === "number" ? result.status : 1;
  return {
    exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? result.error.message : ""),
  };
}

function runCommand(
  runner: NightlyCommandRunner,
  invocation: NightlyCommandInvocation,
): NightlyCommandResult {
  const result = runner(invocation);
  if (result.exitCode !== 0 && invocation.allowFailure !== true) {
    throw new Error(
      `${invocation.description} failed with exit code ${result.exitCode}: ${stringifyCommand(
        invocation,
      )}\n${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function gitCommand(
  cwd: string,
  args: ReadonlyArray<string>,
  description: string,
  mutates: boolean,
  allowFailure?: boolean,
): NightlyCommandInvocation {
  return {
    command: "git",
    args,
    cwd,
    description,
    mutates,
    ...(allowFailure === undefined ? {} : { allowFailure }),
  };
}

function shellCommand(
  cwd: string,
  command: string,
  args: ReadonlyArray<string>,
  description: string,
  mutates: boolean,
  allowFailure?: boolean,
): NightlyCommandInvocation {
  return {
    command,
    args,
    cwd,
    description,
    mutates,
    ...(allowFailure === undefined ? {} : { allowFailure }),
  };
}

function gitOutput(
  runner: NightlyCommandRunner,
  cwd: string,
  args: ReadonlyArray<string>,
  description: string,
): string {
  return runCommand(runner, gitCommand(cwd, args, description, false)).stdout.trim();
}

function gitOutputAllowFailure(
  runner: NightlyCommandRunner,
  cwd: string,
  args: ReadonlyArray<string>,
  description: string,
): NightlyCommandResult {
  return runCommand(runner, gitCommand(cwd, args, description, false, true));
}

export function createNightlyRunId(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

export function resolveRepoFamilyRoot(worktreeRoot: string): string {
  const normalized = NodePath.resolve(worktreeRoot);
  const marker = `${NodePath.sep}.worktrees${NodePath.sep}`;
  const markerIndex = normalized.indexOf(marker);
  return markerIndex === -1 ? normalized : normalized.slice(0, markerIndex);
}

function hasPorcelainChanges(statusOutput: string): boolean {
  return statusOutput
    .split(/\r?\n/)
    .some((line) => line.trim().length > 0 && !line.startsWith("## "));
}

function inspectWorktree(runner: NightlyCommandRunner, path: string): NightlyWorktreeState {
  if (!NodeFS.existsSync(path)) {
    return { exists: false, dirty: false };
  }

  const status = gitOutput(runner, path, ["status", "--porcelain=v1"], "inspect worktree status");
  const headResult = gitOutputAllowFailure(
    runner,
    path,
    ["rev-parse", "HEAD"],
    "inspect worktree head",
  );

  return {
    exists: true,
    dirty: hasPorcelainChanges(status),
    ...(headResult.exitCode === 0 ? { head: headResult.stdout.trim() } : {}),
  };
}

function createBackupRef(runId: string): string {
  return `refs/backup/original-before-nightly/${runId}`;
}

function needsOriginalBackup(original: NightlyWorktreeState, upstreamHead: string): boolean {
  return original.dirty || (original.head !== undefined && original.head !== upstreamHead);
}

export function createNightlyTopicStackPlan(
  input: NightlyTopicStackPlanInput,
): NightlyTopicStackPlan {
  const branchName = `dev/nightly-topic-stack-${input.dateKey}`;
  const artifactsDir = NodePath.join(input.nightlyPath, RUNS_RELATIVE_PATH, input.runId);
  const blockers: Array<string> = [];
  const commands: Array<NightlyCommandInvocation> = [];

  commands.push(
    gitCommand(input.controlRoot, ["fetch", UPSTREAM_REMOTE, "--prune"], "fetch upstream", true),
  );

  if (!input.original.exists) {
    blockers.push(`Original worktree is missing at ${input.originalPath}.`);
  } else if (needsOriginalBackup(input.original, input.upstreamHead)) {
    commands.push(
      gitCommand(
        input.originalPath,
        ["update-ref", createBackupRef(input.runId), "HEAD"],
        "backup original HEAD before reset",
        true,
      ),
    );

    if (input.original.dirty) {
      commands.push(
        gitCommand(
          input.originalPath,
          [
            "stash",
            "push",
            "--include-untracked",
            "--message",
            `nightly original backup ${input.runId}`,
          ],
          "stash dirty original changes",
          true,
        ),
      );
    }
  }

  commands.push(
    gitCommand(
      input.originalPath,
      ["reset", "--hard", input.upstreamRef],
      "reset original to upstream/main",
      true,
    ),
    gitCommand(input.originalPath, ["clean", "-fd"], "clean untracked files from original", true),
  );

  if (input.nightly.exists && input.nightly.dirty) {
    blockers.push(`Nightly worktree is dirty at ${input.nightlyPath}; refusing to reset it.`);
  }

  if (!input.nightly.exists) {
    commands.push(
      gitCommand(
        input.controlRoot,
        ["worktree", "add", input.nightlyPath, input.upstreamRef],
        "create nightly-local worktree",
        true,
      ),
    );
  }

  commands.push(
    gitCommand(
      input.nightlyPath,
      ["switch", "-C", branchName, input.upstreamRef],
      "create or reset nightly branch",
      true,
    ),
  );

  for (const topic of input.manifest.topics) {
    for (const commit of topic.commits) {
      commands.push(
        gitCommand(
          input.nightlyPath,
          ["cherry-pick", commit],
          `cherry-pick ${topic.id}`,
          true,
          true,
        ),
      );
    }
  }

  commands.push(
    shellCommand(input.nightlyPath, "vp", ["check"], "run vp check", true),
    shellCommand(input.nightlyPath, "vp", ["run", "typecheck"], "run vp run typecheck", true),
    shellCommand(
      input.controlRoot,
      "pnpm",
      ["run", "topic-plugins:check"],
      "validate local topic plugin metadata",
      false,
    ),
  );

  return {
    controlRoot: input.controlRoot,
    repoFamilyRoot: input.repoFamilyRoot,
    runId: input.runId,
    dateKey: input.dateKey,
    branchName,
    upstreamRef: input.upstreamRef,
    originalPath: input.originalPath,
    nightlyPath: input.nightlyPath,
    artifactsDir,
    blockers,
    commands,
    topics: input.manifest.topics.map((topic) => ({
      id: topic.id,
      subject: topic.subject,
      commits: topic.commits,
    })),
  };
}

function inspectPlanInput(
  runner: NightlyCommandRunner,
  controlRoot: string,
  manifest: LocalTopicManifest,
  runId: string,
): NightlyTopicStackPlanInput {
  const repoFamilyRoot = resolveRepoFamilyRoot(controlRoot);
  const dateKey = runId.slice(0, 8);
  const originalPath = NodePath.join(repoFamilyRoot, ORIGINAL_WORKTREE_RELATIVE_PATH);
  const nightlyPath = NodePath.join(repoFamilyRoot, NIGHTLY_WORKTREE_RELATIVE_PATH);
  const upstreamHead = gitOutput(
    runner,
    controlRoot,
    ["rev-parse", UPSTREAM_REF],
    "resolve upstream/main",
  );

  return {
    controlRoot,
    repoFamilyRoot,
    manifest,
    runId,
    dateKey,
    upstreamRef: UPSTREAM_REF,
    upstreamHead,
    originalPath,
    original: inspectWorktree(runner, originalPath),
    nightlyPath,
    nightly: inspectWorktree(runner, nightlyPath),
  };
}

function writeJsonFile(path: string, value: unknown): void {
  NodeFS.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeRunArtifacts(
  plan: NightlyTopicStackPlan,
  topicRecords: ReadonlyArray<NightlyRunTopicRecord>,
  status: "success" | "failed",
  message?: string,
): void {
  NodeFS.mkdirSync(plan.artifactsDir, { recursive: true });
  writeJsonFile(NodePath.join(plan.artifactsDir, "plan.json"), {
    runId: plan.runId,
    branchName: plan.branchName,
    upstreamRef: plan.upstreamRef,
    controlRoot: plan.controlRoot,
    repoFamilyRoot: plan.repoFamilyRoot,
    originalPath: plan.originalPath,
    nightlyPath: plan.nightlyPath,
    commands: plan.commands.map((command) => ({
      command: stringifyCommand(command),
      cwd: command.cwd,
      mutates: command.mutates,
      description: command.description,
    })),
  });
  writeJsonFile(NodePath.join(plan.artifactsDir, "topics.json"), topicRecords);

  if (status === "failed") {
    NodeFS.writeFileSync(NodePath.join(plan.artifactsDir, "failure.txt"), `${message ?? ""}\n`);
  }
}

function isEmptyCherryPick(runner: NightlyCommandRunner, cwd: string): boolean {
  const cherryPickHead = gitOutputAllowFailure(
    runner,
    cwd,
    ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"],
    "check cherry-pick head",
  );
  const unstagedDiff = gitOutputAllowFailure(
    runner,
    cwd,
    ["diff", "--quiet"],
    "check unstaged cherry-pick diff",
  );
  const stagedDiff = gitOutputAllowFailure(
    runner,
    cwd,
    ["diff", "--cached", "--quiet"],
    "check staged cherry-pick diff",
  );

  return cherryPickHead.exitCode === 0 && unstagedDiff.exitCode === 0 && stagedDiff.exitCode === 0;
}

function applyCherryPicks(
  plan: NightlyTopicStackPlan,
  runner: NightlyCommandRunner,
): ReadonlyArray<NightlyRunTopicRecord> {
  const records: Array<NightlyRunTopicRecord> = [];

  for (const topic of plan.topics) {
    for (const commit of topic.commits) {
      const result = runCommand(
        runner,
        gitCommand(
          plan.nightlyPath,
          ["cherry-pick", commit],
          `cherry-pick ${topic.id}`,
          true,
          true,
        ),
      );

      if (result.exitCode === 0) {
        records.push({
          id: topic.id,
          subject: topic.subject,
          commit,
          status: "applied",
        });
        continue;
      }

      if (isEmptyCherryPick(runner, plan.nightlyPath)) {
        runCommand(
          runner,
          gitCommand(plan.nightlyPath, ["cherry-pick", "--skip"], "skip empty cherry-pick", true),
        );
        records.push({
          id: topic.id,
          subject: topic.subject,
          commit,
          status: "empty-skipped",
          message: result.stderr || result.stdout,
        });
        continue;
      }

      const conflictRecord: NightlyRunTopicRecord = {
        id: topic.id,
        subject: topic.subject,
        commit,
        status: "conflict",
        message: result.stderr || result.stdout,
      };
      records.push(conflictRecord);
      writeRunArtifacts(
        plan,
        records,
        "failed",
        `Cherry-pick conflict while replaying ${topic.id} (${commit}).`,
      );
      throw new Error(`Cherry-pick conflict while replaying ${topic.id} (${commit}).`);
    }
  }

  return records;
}

function commandAlreadyHandledByCherryPickLoop(command: NightlyCommandInvocation): boolean {
  return command.command === "git" && command.args[0] === "cherry-pick";
}

function runPlannedSetupCommands(plan: NightlyTopicStackPlan, runner: NightlyCommandRunner): void {
  for (const command of plan.commands) {
    if (commandAlreadyHandledByCherryPickLoop(command)) {
      return;
    }
    if (command.description === "fetch upstream") {
      continue;
    }
    runCommand(runner, command);
  }
}

function runPlannedVerificationCommands(
  plan: NightlyTopicStackPlan,
  runner: NightlyCommandRunner,
): void {
  let afterCherryPicks = false;
  for (const command of plan.commands) {
    if (commandAlreadyHandledByCherryPickLoop(command)) {
      afterCherryPicks = true;
      continue;
    }
    if (afterCherryPicks) {
      runCommand(runner, command);
    }
  }
}

export function runNightlyTopicStack(
  options: RunNightlyTopicStackOptions,
): NightlyTopicStackRunResult {
  const runner = options.runner ?? defaultRunner;
  const currentWorktree =
    options.rootDir ??
    gitOutput(runner, process.cwd(), ["rev-parse", "--show-toplevel"], "resolve repo root");
  const controlRoot = NodePath.resolve(currentWorktree);
  const manifest = readLocalTopicManifest(controlRoot);
  const runId = createNightlyRunId(options.now ?? new Date());

  const preflightInput = inspectPlanInput(runner, controlRoot, manifest, runId);
  if (preflightInput.nightly.exists && preflightInput.nightly.dirty) {
    const plan = createNightlyTopicStackPlan(preflightInput);
    throw new Error(plan.blockers.join("\n"));
  }

  if (options.mode === "apply") {
    runCommand(
      runner,
      gitCommand(controlRoot, ["fetch", UPSTREAM_REMOTE, "--prune"], "fetch upstream", true),
    );
  }

  const plan = createNightlyTopicStackPlan(inspectPlanInput(runner, controlRoot, manifest, runId));

  if (options.mode === "dry-run") {
    return {
      mode: options.mode,
      plan,
      topicRecords: plan.topics.flatMap((topic) =>
        topic.commits.map((commit) => ({
          id: topic.id,
          subject: topic.subject,
          commit,
          status: "pending" as const,
        })),
      ),
    };
  }

  if (plan.blockers.length > 0) {
    throw new Error(plan.blockers.join("\n"));
  }

  runPlannedSetupCommands(plan, runner);
  NodeFS.mkdirSync(plan.artifactsDir, { recursive: true });

  let topicRecords: ReadonlyArray<NightlyRunTopicRecord> = [];
  try {
    topicRecords = applyCherryPicks(plan, runner);
    runPlannedVerificationCommands(plan, runner);
    writeRunArtifacts(plan, topicRecords, "success");
  } catch (error) {
    if (topicRecords.length > 0) {
      writeRunArtifacts(
        plan,
        topicRecords,
        "failed",
        error instanceof Error ? error.message : String(error),
      );
    }
    throw error;
  }

  return {
    mode: options.mode,
    plan,
    topicRecords,
  };
}

export function formatNightlyTopicStackResult(result: NightlyTopicStackRunResult): string {
  const lines = [
    `Nightly topic stack ${result.mode === "dry-run" ? "dry-run plan" : "apply run"}`,
    `Branch: ${result.plan.branchName}`,
    `Control: ${result.plan.controlRoot}`,
    `Original: ${result.plan.originalPath}`,
    `Nightly: ${result.plan.nightlyPath}`,
    `Artifacts: ${result.plan.artifactsDir}`,
  ];

  if (result.plan.blockers.length > 0) {
    lines.push("Blockers:", ...result.plan.blockers.map((blocker) => `- ${blocker}`));
  }

  lines.push("Commands:");
  for (const command of result.plan.commands) {
    lines.push(
      `- ${command.mutates ? "mutate" : "read"} ${command.description}: ${stringifyCommand(
        command,
      )}`,
    );
  }

  lines.push("Topics:");
  for (const record of result.topicRecords) {
    lines.push(`- ${record.status} ${record.id}: ${record.commit}`);
  }

  lines.push("");
  return lines.join("\n");
}

export function parseNightlyTopicStackArgs(
  args: ReadonlyArray<string>,
): ParsedNightlyTopicStackArgs {
  let mode: NightlyTopicStackMode | undefined;
  let rootDir: string | undefined;
  let help = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--dry-run") {
      mode = "dry-run";
    } else if (arg === "--apply") {
      mode = "apply";
    } else if (arg === "--root") {
      rootDir = args[++index];
    } else if (arg.startsWith("--root=")) {
      rootDir = arg.slice("--root=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    mode: mode ?? "dry-run",
    ...(rootDir === undefined ? {} : { rootDir }),
    help,
  };
}

export function nightlyTopicStackHelp(): string {
  return [
    "Usage: pnpm run topic-stack:nightly -- [--dry-run|--apply] [--root <control-worktree>]",
    "",
    "Rebuilds the local topic stack in .worktrees/nightly-local.",
    "--dry-run prints the plan without running mutating git commands.",
    "--apply fetches upstream, resets original after backup, replays manifest topics, and runs verification.",
    "",
  ].join("\n");
}
