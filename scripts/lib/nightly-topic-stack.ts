// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Nightly replay is a Node CLI that owns git process orchestration.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { runProcessCommand } from "./command-runner.ts";
import {
  type LocalTopicManifest,
  readLocalTopicManifest,
  readLocalTopicPlugin,
} from "./local-topic-stack.ts";
import {
  isPathInRecordedRepairScope,
  readRecordedRepairMemory,
  restoreRecordedRepairMemory,
} from "./nightly-repair-memory.ts";
import { resolveTopicRepairPaths } from "./nightly-topic-repair-scope.ts";
import { hasMaterialPorcelainChanges } from "./nightly-worktree-status.ts";

export type NightlyTopicStackMode = "dry-run" | "apply";
export type NightlyTopicStatus =
  | "pending"
  | "applied"
  | "auto-resolved"
  | "empty-skipped"
  | "conflict";

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
  readonly upstreamHead: string;
  readonly originalBackupRef?: string;
  readonly originalPath: string;
  readonly nightlyPath: string;
  readonly artifactsDir: string;
  readonly blockers: ReadonlyArray<string>;
  readonly controlPlanePaths: ReadonlyArray<string>;
  readonly commands: ReadonlyArray<NightlyCommandInvocation>;
  readonly topics: ReadonlyArray<{
    readonly id: string;
    readonly subject: string;
    readonly commits: ReadonlyArray<string>;
    readonly repairPaths: ReadonlyArray<string>;
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
const NIGHTLY_WORKTREE_RELATIVE_PATH = ".worktrees/nightly";
const ORIGINAL_WORKTREE_RELATIVE_PATH = ".worktrees/original";
const RUNS_RELATIVE_PATH = ".t3code-nightly-runs";

function stringifyCommand(invocation: NightlyCommandInvocation): string {
  return [invocation.command, ...invocation.args].join(" ");
}

function defaultRunner(invocation: NightlyCommandInvocation): NightlyCommandResult {
  const result = runProcessCommand(invocation.command, invocation.args, invocation.cwd, {
    allowFailure: true,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
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

function topicRepairPaths(
  controlRoot: string,
  topic: LocalTopicManifest["topics"][number],
): string[] {
  try {
    const plugin = readLocalTopicPlugin(controlRoot, topic.pluginPath);
    return [...resolveTopicRepairPaths(controlRoot, plugin, replayCommitsForTopic(topic))];
  } catch {
    return [];
  }
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

function inspectWorktree(runner: NightlyCommandRunner, path: string): NightlyWorktreeState {
  if (!NodeFS.existsSync(path)) {
    return { exists: false, dirty: false };
  }

  const status = gitOutput(
    runner,
    path,
    ["status", "--porcelain=v1", "--untracked-files=all"],
    "inspect worktree status",
  );
  const headResult = gitOutputAllowFailure(
    runner,
    path,
    ["rev-parse", "HEAD"],
    "inspect worktree head",
  );

  return {
    exists: true,
    dirty: hasMaterialPorcelainChanges(status),
    ...(headResult.exitCode === 0 ? { head: headResult.stdout.trim() } : {}),
  };
}

function createBackupRef(runId: string): string {
  return `refs/backup/original-before-nightly/${runId}`;
}

function needsOriginalBackup(original: NightlyWorktreeState, upstreamHead: string): boolean {
  return original.dirty || (original.head !== undefined && original.head !== upstreamHead);
}

function replayCommitsForTopic(topic: LocalTopicManifest["topics"][number]): ReadonlyArray<string> {
  return [...topic.prerequisiteCommits, ...topic.commits, ...topic.followupCommits];
}
export function createNightlyTopicStackPlan(
  input: NightlyTopicStackPlanInput,
): NightlyTopicStackPlan {
  const branchName = "nightly";
  const artifactsDir = NodePath.join(input.nightlyPath, RUNS_RELATIVE_PATH, input.runId);
  const blockers: Array<string> = [];
  const commands: Array<NightlyCommandInvocation> = [];
  let originalBackupRef: string | undefined;

  commands.push(
    gitCommand(input.controlRoot, ["fetch", UPSTREAM_REMOTE, "--prune"], "fetch upstream", true),
  );

  if (!input.original.exists) {
    commands.push(
      gitCommand(
        input.controlRoot,
        ["worktree", "add", "-B", "original", input.originalPath, input.upstreamRef],
        "create original worktree",
        true,
      ),
    );
  } else if (needsOriginalBackup(input.original, input.upstreamHead)) {
    originalBackupRef = createBackupRef(input.runId);
    commands.push(
      gitCommand(
        input.originalPath,
        ["update-ref", originalBackupRef, "HEAD"],
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
        "create nightly worktree",
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
    gitCommand(
      input.nightlyPath,
      ["config", "rerere.enabled", "true"],
      "enable git rerere conflict memory",
      true,
    ),
    gitCommand(
      input.nightlyPath,
      ["config", "rerere.autoupdate", "true"],
      "enable git rerere autoupdate",
      true,
    ),
  );

  for (const topic of input.manifest.topics) {
    for (const commit of replayCommitsForTopic(topic)) {
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
    shellCommand(
      input.controlRoot,
      process.execPath,
      [
        NodePath.join(input.controlRoot, "scripts/reconcile-nightly-dependencies.ts"),
        "--worktree",
        input.nightlyPath,
        "--upstream-ref",
        input.upstreamRef,
        "--report",
        NodePath.join(artifactsDir, "dependency-reconciliation.json"),
      ],
      "reconcile upstream dependency versions",
      true,
    ),
    shellCommand(
      input.nightlyPath,
      "corepack",
      ["pnpm", "install", "--frozen-lockfile"],
      "install nightly dependencies",
      true,
    ),
    shellCommand(input.nightlyPath, "vp", ["check"], "run vp check", true),
    shellCommand(input.nightlyPath, "vp", ["run", "typecheck"], "run vp run typecheck", true),
    shellCommand(
      input.controlRoot,
      process.execPath,
      [NodePath.join(input.controlRoot, "scripts/validate-local-topic-plugins.ts")],
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
    upstreamHead: input.upstreamHead,
    ...(originalBackupRef === undefined ? {} : { originalBackupRef }),
    originalPath: input.originalPath,
    nightlyPath: input.nightlyPath,
    artifactsDir,
    blockers,
    controlPlanePaths: input.manifest.controlPlanePaths ?? [],
    commands,
    topics: input.manifest.topics.map((topic) => ({
      id: topic.id,
      subject: topic.subject,
      commits: replayCommitsForTopic(topic),
      repairPaths: topicRepairPaths(input.controlRoot, topic),
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

function formatTopicAuditMarkdown(
  plan: NightlyTopicStackPlan,
  topicRecords: ReadonlyArray<NightlyRunTopicRecord>,
  status: "success" | "failed",
  message?: string,
): string {
  const replayOutcomeLines =
    topicRecords.length === 0
      ? ["- No topic replay records were written before this run stopped."]
      : topicRecords.map((record) =>
          [
            `- \`${record.status}\` \`${record.id}\``,
            `\`${record.commit}\``,
            record.subject,
            record.message ? `- ${record.message.split(/\r?\n/u)[0]}` : "",
          ]
            .filter((part) => part.length > 0)
            .join(" "),
        );
  const emptyOrSkippedRecords = topicRecords.filter((record) => record.status === "empty-skipped");
  const conflictRecords = topicRecords.filter((record) => record.status === "conflict");

  return [
    "# Topic Replay Audit",
    "",
    "## Run Metadata",
    "",
    `- Run id: \`${plan.runId}\``,
    `- Date key: \`${plan.dateKey}\``,
    `- Replay branch: \`${plan.branchName}\``,
    `- Status: \`${status}\``,
    `- Control worktree: \`${plan.controlRoot}\``,
    `- Nightly worktree: \`${plan.nightlyPath}\``,
    `- Artifacts directory: \`${plan.artifactsDir}\``,
    ...(message ? [`- Failure message: ${message}`] : []),
    "",
    "## Upstream Sync",
    "",
    `- Upstream ref: \`${plan.upstreamRef}\``,
    `- Upstream head at plan time: \`${plan.upstreamHead}\``,
    `- Original worktree: \`${plan.originalPath}\``,
    `- Original backup ref: ${
      plan.originalBackupRef === undefined ? "`not-created`" : `\`${plan.originalBackupRef}\``
    }`,
    `- Original reset target: \`${plan.upstreamRef}\``,
    "",
    "## Branch Diffs Audited",
    "",
    "- [ ] Audit `upstream/main...staging` before promotion.",
    "- [ ] Audit `main...staging` before promotion.",
    `- [ ] Audit final \`upstream/main...${plan.branchName}\` after replay repair.`,
    "",
    "## Replay Outcomes",
    "",
    ...replayOutcomeLines,
    "",
    "## Topic Checklist Audit",
    "",
    ...plan.topics.map(
      (topic) =>
        `- [ ] \`${topic.id}\`: checklist reviewed; README updated if needed; evidence recorded.`,
    ),
    "",
    "## Conflict Repairs",
    "",
    ...(conflictRecords.length === 0
      ? ["- [ ] Record compatibility repairs folded into owning topics, or write `None`."]
      : conflictRecords.map(
          (record) =>
            `- [ ] \`${record.id}\` stopped on conflict at \`${record.commit}\`; record repair ownership before promotion.`,
        )),
    "",
    "## Empty Or Skipped Commits",
    "",
    ...(emptyOrSkippedRecords.length === 0
      ? ["- [ ] Record empty or skipped commits, or write `None`."]
      : emptyOrSkippedRecords.map(
          (record) =>
            `- [ ] \`${record.id}\` skipped empty commit \`${record.commit}\`; confirm behavior remains covered.`,
        )),
    "",
    "## Verification Results",
    "",
    "- [ ] `vp check`: record result.",
    "- [ ] `vp run typecheck`: record result.",
    "- [ ] `pnpm run topic-plugins:check`: record result.",
    "- [ ] Additional topic-specific verification: record commands and results.",
    "",
    "## Unresolved Risks",
    "",
    "- [ ] Record unresolved risks, or write `None`.",
    "",
    "## Promotion Sign-Off",
    "",
    "- Sign-off:",
    "- Date:",
    "- Decision:",
    "- Notes:",
    "",
  ].join("\n");
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
    upstreamHead: plan.upstreamHead,
    originalBackupRef: plan.originalBackupRef ?? null,
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
  NodeFS.writeFileSync(
    NodePath.join(plan.artifactsDir, "topic-audit.md"),
    formatTopicAuditMarkdown(plan, topicRecords, status, message),
  );

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

function activeCherryPickHead(runner: NightlyCommandRunner, cwd: string): string | undefined {
  const result = gitOutputAllowFailure(
    runner,
    cwd,
    ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"],
    "check cherry-pick head",
  );
  return result.exitCode === 0 && result.stdout.trim().length > 0
    ? result.stdout.trim()
    : undefined;
}

function isCleanCherryPickNoOpAfterFailure(
  runner: NightlyCommandRunner,
  cwd: string,
  result: NightlyCommandResult,
): boolean {
  const output = `${result.stdout}\n${result.stderr}`;
  if (
    !/(?:could not apply|cherry-pick is now empty|nothing to commit|patch is empty)/iu.test(output)
  ) {
    return false;
  }
  if (activeCherryPickHead(runner, cwd) !== undefined || unmergedFiles(runner, cwd).length > 0) {
    return false;
  }
  const unstagedDiff = gitOutputAllowFailure(
    runner,
    cwd,
    ["diff", "--quiet"],
    "check clean failed cherry-pick worktree",
  );
  const stagedDiff = gitOutputAllowFailure(
    runner,
    cwd,
    ["diff", "--cached", "--quiet"],
    "check clean failed cherry-pick index",
  );
  return unstagedDiff.exitCode === 0 && stagedDiff.exitCode === 0;
}

function unmergedFiles(runner: NightlyCommandRunner, cwd: string): ReadonlyArray<string> {
  const result = gitOutputAllowFailure(
    runner,
    cwd,
    ["diff", "--name-only", "--diff-filter=U"],
    "list unmerged files",
  );
  if (result.exitCode !== 0 || result.stdout.trim().length === 0) return [];
  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function continueAutoResolvedCherryPick(
  plan: NightlyTopicStackPlan,
  runner: NightlyCommandRunner,
): NightlyCommandResult | undefined {
  if (activeCherryPickHead(runner, plan.nightlyPath) === undefined) return undefined;
  if (unmergedFiles(runner, plan.nightlyPath).length > 0) return undefined;
  const result = runCommand(
    runner,
    gitCommand(
      plan.nightlyPath,
      ["cherry-pick", "--continue"],
      "continue rerere-resolved cherry-pick",
      true,
      true,
    ),
  );
  return result.exitCode === 0 ? result : undefined;
}

function continueRecordedRepairMemory(
  plan: NightlyTopicStackPlan,
  runner: NightlyCommandRunner,
  record: NightlyRunTopicRecord,
): NightlyCommandResult | undefined {
  const conflictIndex = gitOutputAllowFailure(
    runner,
    plan.nightlyPath,
    ["ls-files", "-u"],
    "capture conflict index for repair memory",
  );
  if (conflictIndex.exitCode !== 0 || conflictIndex.stdout.trim().length === 0) return undefined;
  const memory = readRecordedRepairMemory({
    repoFamilyRoot: plan.repoFamilyRoot,
    topicId: record.id,
    commit: record.commit,
    indexOutput: conflictIndex.stdout,
  });
  if (memory === undefined) return undefined;
  const repairPaths = plan.topics.find((topic) => topic.id === record.id)?.repairPaths ?? [];
  if (
    repairPaths.length === 0 ||
    memory.files.some((file) => !isPathInRecordedRepairScope(file.path, repairPaths))
  ) {
    return undefined;
  }

  let paths: ReadonlyArray<string>;
  try {
    paths = restoreRecordedRepairMemory(plan.nightlyPath, memory, repairPaths);
  } catch {
    return undefined;
  }
  const stage = runCommand(
    runner,
    gitCommand(
      plan.nightlyPath,
      ["add", "-A", "--", ...paths],
      "stage recorded repair memory",
      true,
      true,
    ),
  );
  if (stage.exitCode !== 0) return undefined;
  const rerere = runCommand(
    runner,
    gitCommand(plan.nightlyPath, ["rerere"], "record restored repair memory in rerere", true, true),
  );
  if (rerere.exitCode !== 0) return undefined;
  const continued = runCommand(
    runner,
    gitCommand(
      plan.nightlyPath,
      ["cherry-pick", "--continue"],
      "continue recorded repair memory",
      true,
      true,
    ),
  );
  return continued.exitCode === 0 && unmergedFiles(runner, plan.nightlyPath).length === 0
    ? continued
    : undefined;
}

function commandOutputForPacket(
  runner: NightlyCommandRunner,
  cwd: string,
  args: ReadonlyArray<string>,
  description: string,
): string {
  const result = gitOutputAllowFailure(runner, cwd, args, description);
  const output = [result.stdout, result.stderr].filter((part) => part.trim().length > 0).join("\n");
  return output.trim().length > 0 ? output.trim() : "(no output)";
}

function formatConflictPacket(input: {
  readonly plan: NightlyTopicStackPlan;
  readonly record: NightlyRunTopicRecord;
  readonly activeCherryPick?: string;
  readonly unmerged: ReadonlyArray<string>;
  readonly status: string;
  readonly lsFiles: string;
  readonly combinedDiff: string;
  readonly commitShow: string;
}): string {
  const packetPath = NodePath.join(input.plan.artifactsDir, "conflict-packet.md");
  const promptPath = NodePath.join(input.plan.artifactsDir, "hermes-conflict-prompt.md");
  return [
    "# Nightly Conflict Packet",
    "",
    "This packet is generated when the nightly topic replay finds a conflict that git rerere could not fully resolve from previous decisions.",
    "",
    "## Conflict",
    "",
    `- Topic: \`${input.record.id}\``,
    `- Subject: ${input.record.subject}`,
    `- Commit: \`${input.record.commit}\``,
    `- Active cherry-pick: \`${input.activeCherryPick ?? "unknown"}\``,
    `- Nightly worktree: \`${input.plan.nightlyPath}\``,
    `- Upstream base: \`${input.plan.upstreamRef}\` at \`${input.plan.upstreamHead}\``,
    `- Packet: \`${packetPath}\``,
    `- Hermes prompt: \`${promptPath}\``,
    "",
    "## Resolution Policy",
    "",
    "- Preserve the upstream ping.gg behavior unless the local topic explicitly owns the conflicting behavior.",
    "- Preserve the local topic intent behind the replay commit; move it onto the new upstream shape instead of restoring deleted or superseded architecture blindly.",
    "- When a conflict is resolved, run the relevant focused tests first, then `vp check` and `vp run typecheck` before promoting the result.",
    "- Keep the fix in the owning topic. The first successful rerun after this resolution should let `git rerere` remember the decision and auto-resolve repeats.",
    "",
    "## Ask Hermes",
    "",
    `- Linear: attach this brief to the matching nightly run and include a recommended resolution.`,
    `- CLI: \`hermes -z "Read ${promptPath} and propose the safest resolution."\``,
    "",
    "## Current Unmerged Files",
    "",
    ...(input.unmerged.length === 0
      ? [
          "- No unmerged files were detected. `git cherry-pick --continue` may have failed for another reason.",
        ]
      : input.unmerged.map((file) => `- \`${file}\``)),
    "",
    "## Git Status",
    "",
    "```text",
    input.status,
    "```",
    "",
    "## Conflict Index",
    "",
    "```text",
    input.lsFiles,
    "```",
    "",
    "## Commit Being Replayed",
    "",
    "```text",
    input.commitShow,
    "```",
    "",
    "## Combined Diff",
    "",
    "```diff",
    input.combinedDiff,
    "```",
    "",
  ].join("\n");
}

function formatHermesConflictPrompt(input: {
  readonly plan: NightlyTopicStackPlan;
  readonly record: NightlyRunTopicRecord;
}): string {
  const packetPath = NodePath.join(input.plan.artifactsDir, "conflict-packet.md");
  const auditPath = NodePath.join(input.plan.artifactsDir, "topic-audit.md");
  return [
    "You are helping resolve a T3 Code nightly topic replay conflict on giggabit-server.",
    "",
    `Read the conflict packet: ${packetPath}`,
    `Read the topic audit: ${auditPath}`,
    "",
    "Task:",
    `- Topic: ${input.record.id}`,
    `- Commit: ${input.record.commit}`,
    "- Explain the upstream intent, the local topic intent, and the safest resolution.",
    "- If Jordan explicitly asks you to fix it, edit the nightly worktree, preserve both intents where possible, stage the resolution, continue the cherry-pick, and run focused verification before the full gates.",
    "- Do not abort the cherry-pick. If the resolution is uncertain, say exactly which files need human review.",
    "",
    "After a successful manual resolution, rerun the nightly workflow from scratch so git rerere can replay the remembered decision automatically and continue the remaining topic stack.",
    "",
  ].join("\n");
}

function writeConflictResolutionPacket(
  plan: NightlyTopicStackPlan,
  record: NightlyRunTopicRecord,
  runner: NightlyCommandRunner,
): void {
  NodeFS.mkdirSync(plan.artifactsDir, { recursive: true });
  const packetPath = NodePath.join(plan.artifactsDir, "conflict-packet.md");
  const promptPath = NodePath.join(plan.artifactsDir, "hermes-conflict-prompt.md");
  const activeCherryPick = activeCherryPickHead(runner, plan.nightlyPath);
  const unmerged = unmergedFiles(runner, plan.nightlyPath);
  NodeFS.writeFileSync(
    packetPath,
    formatConflictPacket({
      plan,
      record,
      ...(activeCherryPick === undefined ? {} : { activeCherryPick }),
      unmerged,
      status: commandOutputForPacket(
        runner,
        plan.nightlyPath,
        ["status", "--short", "--branch"],
        "capture conflict status",
      ),
      lsFiles: commandOutputForPacket(
        runner,
        plan.nightlyPath,
        ["ls-files", "-u"],
        "capture conflict index",
      ),
      commitShow: commandOutputForPacket(
        runner,
        plan.nightlyPath,
        ["show", "--stat", "--oneline", "--decorate", "--no-renames", record.commit],
        "capture replay commit",
      ),
      combinedDiff: commandOutputForPacket(
        runner,
        plan.nightlyPath,
        ["diff", "--cc"],
        "capture combined conflict diff",
      ),
    }),
  );
  NodeFS.writeFileSync(promptPath, formatHermesConflictPrompt({ plan, record }));
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

      const autoResolved = continueAutoResolvedCherryPick(plan, runner);
      if (autoResolved !== undefined) {
        records.push({
          id: topic.id,
          subject: topic.subject,
          commit,
          status: "auto-resolved",
          message: result.stderr || result.stdout || autoResolved.stderr || autoResolved.stdout,
        });
        continue;
      }

      if (isCleanCherryPickNoOpAfterFailure(runner, plan.nightlyPath, result)) {
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
      const memoryResolved = continueRecordedRepairMemory(plan, runner, conflictRecord);
      if (memoryResolved !== undefined) {
        records.push({
          ...conflictRecord,
          status: "auto-resolved",
          message: `Applied exact recorded repair memory. ${memoryResolved.stderr || memoryResolved.stdout}`,
        });
        continue;
      }

      records.push(conflictRecord);
      writeConflictResolutionPacket(plan, conflictRecord, runner);
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

export function syncNightlyControlPlaneMetadata(
  plan: NightlyTopicStackPlan,
  runner: NightlyCommandRunner,
): { readonly changed: boolean; readonly commit?: string } {
  const artifactPath = NodePath.join(plan.artifactsDir, "control-plane-sync.json");
  NodeFS.mkdirSync(plan.artifactsDir, { recursive: true });
  if (plan.controlPlanePaths.length === 0) {
    NodeFS.writeFileSync(
      artifactPath,
      `${JSON.stringify({ changed: false, paths: [] }, null, 2)}\n`,
    );
    return { changed: false };
  }

  for (const relativePath of plan.controlPlanePaths) {
    const sourcePath = NodePath.join(plan.controlRoot, relativePath);
    const targetPath = NodePath.join(plan.nightlyPath, relativePath);
    if (!NodeFS.existsSync(sourcePath)) {
      throw new Error(`Control-plane source path does not exist: ${sourcePath}`);
    }
    NodeFS.rmSync(targetPath, { recursive: true, force: true });
    NodeFS.mkdirSync(NodePath.dirname(targetPath), { recursive: true });
    const sourceStat = NodeFS.lstatSync(sourcePath);
    NodeFS.cpSync(sourcePath, targetPath, {
      recursive: sourceStat.isDirectory(),
      preserveTimestamps: true,
    });
  }

  runCommand(
    runner,
    gitCommand(
      plan.nightlyPath,
      ["add", "--all", "--", ...plan.controlPlanePaths],
      "stage synchronized control-plane metadata",
      true,
    ),
  );
  const staged = runCommand(
    runner,
    gitCommand(
      plan.nightlyPath,
      ["diff", "--cached", "--quiet"],
      "inspect synchronized control-plane metadata",
      false,
      true,
    ),
  );
  if (staged.exitCode === 0) {
    NodeFS.writeFileSync(
      artifactPath,
      `${JSON.stringify({ changed: false, paths: plan.controlPlanePaths }, null, 2)}\n`,
    );
    return { changed: false };
  }
  if (staged.exitCode !== 1) {
    throw new Error(
      `Failed to inspect synchronized control-plane metadata: ${staged.stderr || staged.stdout}`,
    );
  }

  runCommand(
    runner,
    gitCommand(
      plan.nightlyPath,
      ["commit", "-m", "chore(topic-stack): sync control-plane metadata"],
      "commit synchronized control-plane metadata",
      true,
    ),
  );
  const commit = gitOutput(runner, plan.nightlyPath, ["rev-parse", "HEAD"], "read sync commit");
  NodeFS.writeFileSync(
    artifactPath,
    `${JSON.stringify({ changed: true, commit, paths: plan.controlPlanePaths }, null, 2)}\n`,
  );
  return { changed: true, commit };
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
    syncNightlyControlPlaneMetadata(plan, runner);
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
    "Rebuilds the local topic stack in .worktrees/nightly.",
    "--dry-run prints the plan without running mutating git commands.",
    "--apply fetches upstream, resets original after backup, replays manifest topics, and runs verification.",
    "",
  ].join("\n");
}
