#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalDate:off - Server-local ops orchestration for scheduled git replay and Linear reporting.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { runProcessCommand, type ProcessCommandResult } from "./command-runner.ts";
import {
  readLocalTopicManifest,
  readLocalTopicPlugin,
  type LocalTopicManifestTopic,
  type LocalTopicPlugin,
  type LocalTopicReplayAutonomy,
  type LocalTopicReplayContract,
} from "./local-topic-stack.ts";
import { resolveRepoFamilyRoot } from "./nightly-topic-stack.ts";
import {
  hasMaterialPorcelainChanges,
  isInternalNightlyArtifactPath,
} from "./nightly-worktree-status.ts";
import {
  isPathInRecordedRepairScope,
  isSafeRecordedRepairPath,
  writeRecordedRepairMemory,
} from "./nightly-repair-memory.ts";
import { resolveTopicRepairPaths } from "./nightly-topic-repair-scope.ts";
import {
  createLinearNightlyRun,
  finalizeLinearNightlyRun,
  formatLinearNightlyFinalComment,
  readLinearNightlyConfig,
  writeLinearNightlyRunArtifact,
  type LinearNightlyConfig,
  type LinearNightlyRun,
} from "./linear-nightly-control.ts";

export type NightlyAgentStatus = "success" | "failed" | "skipped";

export type CommandResult = ProcessCommandResult;

interface ParsedNightlyAgentArgs {
  readonly rootDir?: string;
  readonly force: boolean;
  readonly linearNotify: boolean;
  readonly publicVerify: boolean;
  readonly autoRepair: boolean;
  readonly repairCommand?: string;
  readonly maxRepairAttempts: number;
  readonly help: boolean;
}

export interface NightlyReplayDecisionInput {
  readonly force: boolean;
  readonly upstreamBefore?: string;
  readonly upstreamAfter?: string;
  readonly originalHead?: string;
  readonly originalExists: boolean;
  readonly nightlyExists: boolean;
  readonly nightlyDirty: boolean;
  readonly previousRunStatus?: NightlyAgentStatus;
  readonly previousRunUpstreamAfter?: string;
}

export interface NightlyReplayDecision {
  readonly apply: boolean;
  readonly blocker?: string;
  readonly reason: string;
}

export interface PausedNightlyReplayInput {
  readonly nightlyDirty: boolean;
  readonly activeCherryPick: boolean;
  readonly hasConflictArtifacts: boolean;
  readonly autoRepair: boolean;
  readonly maxRepairAttempts: number;
  readonly cherryPickMatchesTopic: boolean;
  readonly topicAutonomy?: LocalTopicReplayAutonomy;
}

export interface TopicRecord {
  readonly id: string;
  readonly subject: string;
  readonly commit: string;
  readonly status: string;
  readonly message?: string;
}

export interface TopicSummary {
  readonly id: string;
  readonly pluginPath: string;
  readonly title: string;
  readonly subject: string;
  readonly commits: ReadonlyArray<string>;
  readonly verification: ReadonlyArray<string>;
  readonly repairPaths?: ReadonlyArray<string>;
  readonly replayContract?: LocalTopicReplayContract;
  readonly checklist: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly replayStatuses: ReadonlyArray<string>;
}

export type AutonomousRepairDecision = "repaired" | "fundamental-conflict" | "incomplete";
export type AutonomousRepairStatus =
  | "skipped"
  | "repaired"
  | "fundamental-conflict"
  | "incomplete"
  | "failed";

export interface AutonomousRepairWorkerResult {
  readonly decision: AutonomousRepairDecision;
  readonly summary: string;
  readonly changedFiles: ReadonlyArray<string>;
  readonly testsRun: ReadonlyArray<string>;
  readonly risks: ReadonlyArray<string>;
  readonly rerereReady: boolean;
}

export interface AutonomousRepairAttempt {
  readonly attempt: number;
  readonly topicId: string;
  readonly commit: string;
  readonly status: AutonomousRepairStatus;
  readonly decision?: AutonomousRepairDecision;
  readonly autonomy?: string;
  readonly risk?: string;
  readonly promptPath: string;
  readonly resultPath: string;
  readonly commandLogPath?: string;
  readonly memoryPath?: string;
  readonly verificationResults?: ReadonlyArray<CommandResult>;
  readonly message: string;
}

export interface NightlyAgentReportInput {
  readonly status: NightlyAgentStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly controlRoot: string;
  readonly repoFamilyRoot: string;
  readonly originalPath: string;
  readonly nightlyPath: string;
  readonly nightlyHead?: string;
  readonly artifactDir: string;
  readonly reportPath: string;
  readonly topicCatalogPath: string;
  readonly decisionReason: string;
  readonly upstreamBefore?: string;
  readonly upstreamAfter?: string;
  readonly upstreamCommits: ReadonlyArray<string>;
  readonly topicSummaries: ReadonlyArray<TopicSummary>;
  readonly topicRecords: ReadonlyArray<TopicRecord>;
  readonly commandResults: ReadonlyArray<CommandResult>;
  readonly conflictFiles: ReadonlyArray<string>;
  readonly conflictArtifacts: ReadonlyArray<string>;
  readonly conflictBriefPath?: string;
  readonly conflictBriefError?: string;
  readonly autoRepairAttempts?: ReadonlyArray<AutonomousRepairAttempt>;
  readonly proofArtifacts: ReadonlyArray<string>;
  readonly errorMessage?: string;
}

export interface NightlyRunningNoticeInput {
  readonly startedAt: string;
  readonly controlRoot: string;
  readonly originalPath: string;
  readonly nightlyPath: string;
}

export interface NightlyUpstreamNoticeInput {
  readonly decisionReason: string;
  readonly willReplay: boolean;
  readonly blocker?: string;
  readonly upstreamBefore?: string;
  readonly upstreamAfter?: string;
  readonly upstreamCommits: ReadonlyArray<string>;
  readonly topicSummaries: ReadonlyArray<TopicSummary>;
}

const REPLAY_CHECKLIST_HEADINGS = [
  "Added Features",
  "Added UI",
  "Added Server And Runtime Behavior",
  "Added Tests",
] as const;

const runCommand = runProcessCommand;

function gitOutput(cwd: string, args: ReadonlyArray<string>): string | undefined {
  const result = runCommand("git", args, cwd, { allowFailure: true });
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

function gitDirty(path: string): boolean {
  if (!NodeFS.existsSync(path)) return false;
  return hasMaterialPorcelainChanges(
    gitOutput(path, ["status", "--porcelain=v1", "--untracked-files=all"]) ?? "",
  );
}

function nowRunId(now: Date): string {
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

function resolveControlRoot(rootDir?: string): string {
  if (rootDir !== undefined) {
    return NodePath.resolve(rootDir);
  }
  const root = gitOutput(process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (root === undefined) {
    throw new Error("Could not resolve git worktree root.");
  }
  return NodePath.resolve(root);
}

export function decideNightlyReplay(input: NightlyReplayDecisionInput): NightlyReplayDecision {
  if (input.nightlyDirty) {
    return {
      apply: false,
      blocker: "Nightly worktree is dirty; refusing to reset or replay it.",
      reason: "nightly-dirty",
    };
  }
  if (input.force) {
    return { apply: true, reason: "forced" };
  }
  if (!input.originalExists) {
    return { apply: true, reason: "original-missing" };
  }
  if (!input.nightlyExists) {
    return { apply: true, reason: "nightly-missing" };
  }
  if (input.upstreamBefore === undefined) {
    return { apply: true, reason: "upstream-tracking-missing" };
  }
  if (input.upstreamAfter === undefined) {
    return {
      apply: false,
      blocker: "Could not resolve upstream/main after fetch.",
      reason: "upstream-missing-after-fetch",
    };
  }
  if (input.upstreamBefore !== input.upstreamAfter) {
    return { apply: true, reason: "upstream-changed" };
  }
  if (input.originalHead !== input.upstreamAfter) {
    return { apply: true, reason: "original-not-at-upstream" };
  }
  if (
    input.previousRunStatus === "failed" &&
    input.previousRunUpstreamAfter === input.upstreamAfter
  ) {
    return { apply: true, reason: "retry-failed-run" };
  }
  return { apply: false, reason: "upstream-unchanged" };
}

export function shouldResumePausedNightlyReplay(input: PausedNightlyReplayInput): boolean {
  return (
    input.nightlyDirty &&
    input.activeCherryPick &&
    input.hasConflictArtifacts &&
    input.autoRepair &&
    input.maxRepairAttempts > 0 &&
    input.cherryPickMatchesTopic &&
    input.topicAutonomy !== undefined &&
    input.topicAutonomy !== "manual-decision"
  );
}

export function parseAutonomousRepairWorkerResult(
  content: string,
): AutonomousRepairWorkerResult | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const decision = record.decision;
  const stringArray = (field: string): ReadonlyArray<string> | undefined => {
    const candidate = record[field];
    return Array.isArray(candidate) && candidate.every((item) => typeof item === "string")
      ? candidate
      : undefined;
  };
  const changedFiles = stringArray("changedFiles");
  const testsRun = stringArray("testsRun");
  const risks = stringArray("risks");
  if (
    !["repaired", "fundamental-conflict", "incomplete"].includes(String(decision)) ||
    typeof record.summary !== "string" ||
    changedFiles === undefined ||
    testsRun === undefined ||
    risks === undefined ||
    typeof record.rerereReady !== "boolean"
  ) {
    return undefined;
  }
  return {
    decision: decision as AutonomousRepairDecision,
    summary: record.summary,
    changedFiles,
    testsRun,
    risks,
    rerereReady: record.rerereReady,
  };
}

export function isSafeAutonomousRepairPath(path: string): boolean {
  return isSafeRecordedRepairPath(path);
}

export function unexpectedAutonomousRepairPaths(
  currentPaths: ReadonlyArray<string>,
  allowedPaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const allowed = new Set(allowedPaths);
  return [...new Set(currentPaths)]
    .filter((path) => !isInternalNightlyArtifactPath(path) && !allowed.has(path))
    .sort();
}

export function outOfScopeAutonomousRepairPaths(
  changedPaths: ReadonlyArray<string>,
  repairPaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return [...new Set(changedPaths)]
    .filter((path) => !isPathInRecordedRepairScope(path, repairPaths))
    .sort();
}

export function existingAutonomousRepairFiles(
  nightlyPath: string,
  paths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  return [...new Set(paths)].filter((path) => {
    const absolutePath = NodePath.join(nightlyPath, path);
    return NodeFS.existsSync(absolutePath) && NodeFS.statSync(absolutePath).isFile();
  });
}

export function remainingAutonomousRepairAttempts(
  attempts: ReadonlyArray<Pick<AutonomousRepairAttempt, "commit">>,
  commit: string | undefined,
  maxAttemptsPerConflict: number,
): number {
  if (commit === undefined) return 0;
  const used = attempts.filter((attempt) => attempt.commit === commit).length;
  return Math.max(0, maxAttemptsPerConflict - used);
}

export function shouldSkipEmptyResolvedCherryPick(input: {
  readonly continueExitCode: number;
  readonly activeCherryPick: boolean;
  readonly unresolvedFiles: number;
  readonly unstagedQuiet: boolean;
  readonly stagedQuiet: boolean;
}): boolean {
  return (
    input.continueExitCode !== 0 &&
    input.activeCherryPick &&
    input.unresolvedFiles === 0 &&
    input.unstagedQuiet &&
    input.stagedQuiet
  );
}

function autonomousRepairOutputSchema(): Readonly<Record<string, unknown>> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["decision", "summary", "changedFiles", "testsRun", "risks", "rerereReady"],
    properties: {
      decision: { enum: ["repaired", "fundamental-conflict", "incomplete"] },
      summary: { type: "string" },
      changedFiles: { type: "array", items: { type: "string" } },
      testsRun: { type: "array", items: { type: "string" } },
      risks: { type: "array", items: { type: "string" } },
      rerereReady: { type: "boolean" },
    },
  };
}

function readJsonFile<T>(path: string): T | undefined {
  if (!NodeFS.existsSync(path)) return undefined;
  return JSON.parse(NodeFS.readFileSync(path, "utf8")) as T;
}

function latestRunDir(nightlyPath: string): string | undefined {
  const runsRoot = NodePath.join(nightlyPath, ".t3code-nightly-runs");
  if (!NodeFS.existsSync(runsRoot)) return undefined;
  const entries = NodeFS.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => NodePath.join(runsRoot, entry.name))
    .sort();
  return entries.at(-1);
}

function replayCommits(topic: LocalTopicManifestTopic): ReadonlyArray<string> {
  return [...topic.prerequisiteCommits, ...topic.commits, ...topic.followupCommits];
}

function pluginTitle(plugin: LocalTopicPlugin | undefined, topic: LocalTopicManifestTopic): string {
  return plugin?.title ?? topic.id;
}

function pluginVerification(plugin: LocalTopicPlugin | undefined): ReadonlyArray<string> {
  return plugin?.verification ?? [];
}

function pluginReplayContract(
  plugin: LocalTopicPlugin | undefined,
): LocalTopicReplayContract | undefined {
  return plugin?.schemaVersion === 2 ? plugin.replayContract : undefined;
}

export function extractReplayChecklistItems(
  markdown: string,
): Readonly<Record<string, ReadonlyArray<string>>> {
  const result: Record<string, Array<string>> = {};
  let currentHeading: string | undefined;
  for (const line of markdown.split(/\r?\n/u)) {
    const heading = /^##\s+(.+?)\s*$/u.exec(line)?.[1];
    if (heading !== undefined) {
      currentHeading = REPLAY_CHECKLIST_HEADINGS.includes(
        heading as (typeof REPLAY_CHECKLIST_HEADINGS)[number],
      )
        ? heading
        : undefined;
      continue;
    }
    if (currentHeading === undefined) continue;
    if (!/^\s*-\s+\[[xX]\]\s+/u.test(line)) continue;
    result[currentHeading] ??= [];
    result[currentHeading]!.push(line.trim());
  }
  return result;
}

function readChecklist(
  rootDir: string,
  pluginPath: string,
): Readonly<Record<string, ReadonlyArray<string>>> {
  const readmePath = NodePath.join(rootDir, pluginPath, "README.md");
  if (!NodeFS.existsSync(readmePath)) return {};
  return extractReplayChecklistItems(NodeFS.readFileSync(readmePath, "utf8"));
}

function buildTopicSummaries(
  rootDir: string,
  records: ReadonlyArray<TopicRecord>,
): ReadonlyArray<TopicSummary> {
  const manifest = readLocalTopicManifest(rootDir);
  return manifest.topics.map((topic) => {
    let plugin: LocalTopicPlugin | undefined;
    try {
      plugin = readLocalTopicPlugin(rootDir, topic.pluginPath);
    } catch {
      plugin = undefined;
    }
    const replayStatuses = records
      .filter((record) => record.id === topic.id)
      .map((record) => `${record.status}:${record.commit.slice(0, 10)}`);
    const replayContract = pluginReplayContract(plugin);
    return {
      id: topic.id,
      pluginPath: topic.pluginPath,
      title: pluginTitle(plugin, topic),
      subject: topic.subject,
      commits: replayCommits(topic),
      verification: pluginVerification(plugin),
      ...(plugin === undefined
        ? {}
        : {
            repairPaths: resolveTopicRepairPaths(rootDir, plugin, replayCommits(topic)),
          }),
      ...(replayContract === undefined ? {} : { replayContract }),
      checklist: readChecklist(rootDir, topic.pluginPath),
      replayStatuses,
    };
  });
}

function gitLogRange(
  cwd: string,
  before: string | undefined,
  after: string | undefined,
): ReadonlyArray<string> {
  if (after === undefined) return [];
  const range = before === undefined || before === after ? `-12` : `${before}..${after}`;
  const args =
    range === "-12"
      ? ["log", "--no-merges", "--date=short", "--pretty=format:%h %ad %s", "-12", after]
      : ["log", "--no-merges", "--date=short", "--pretty=format:%h %ad %s", range];
  const output = gitOutput(cwd, args);
  return output === undefined || output.length === 0 ? [] : output.split(/\r?\n/u);
}

function conflictFiles(nightlyPath: string): ReadonlyArray<string> {
  if (!NodeFS.existsSync(nightlyPath)) return [];
  const output = gitOutput(nightlyPath, ["diff", "--name-only", "--diff-filter=U"]);
  return output === undefined || output.length === 0 ? [] : output.split(/\r?\n/u);
}

export function collectProofArtifacts(
  nightlyPath: string,
  startedAt: string,
): ReadonlyArray<string> {
  const publicResultsRoot = NodePath.join(nightlyPath, "apps/desktop/test-results/nightly-public");
  if (!NodeFS.existsSync(publicResultsRoot)) return [];
  const startedAtMs = Date.parse(startedAt);
  const paths: Array<string> = [];
  const walk = (dir: string): void => {
    for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
      const next = NodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next);
      } else if (
        /\.(png|jpg|jpeg|webp|json|txt)$/iu.test(entry.name) &&
        Number.isFinite(startedAtMs) &&
        NodeFS.statSync(next).mtimeMs >= startedAtMs
      ) {
        paths.push(next);
      }
    }
  };
  walk(publicResultsRoot);
  return paths.sort().slice(-20);
}

function collectConflictArtifacts(artifactDir: string): ReadonlyArray<string> {
  const fixedArtifacts = [
    "conflict-packet.md",
    "hermes-conflict-prompt.md",
    "conflict-brief.md",
    "conflict-brief.raw.md",
    "conflict-brief-error.txt",
  ]
    .map((fileName) => NodePath.join(artifactDir, fileName))
    .filter((path) => NodeFS.existsSync(path));
  if (!NodeFS.existsSync(artifactDir)) return fixedArtifacts;
  const repairArtifacts = NodeFS.readdirSync(artifactDir)
    .filter((fileName) =>
      /^autonomous-repair-(prompt|result|result-schema|command)-attempt-\d+\.(md|json|log)$/u.test(
        fileName,
      ),
    )
    .map((fileName) => NodePath.join(artifactDir, fileName))
    .sort();
  return [...fixedArtifacts, ...repairArtifacts];
}

function bulletLines(items: ReadonlyArray<string>, fallback: string): ReadonlyArray<string> {
  return items.length === 0 ? [`- ${fallback}`] : items.map((item) => `- ${item}`);
}

function autoRepairAttemptLines(
  attempts: ReadonlyArray<AutonomousRepairAttempt> | undefined,
): ReadonlyArray<string> {
  if (attempts === undefined || attempts.length === 0) {
    return ["- No autonomous repair attempt was run."];
  }
  return attempts.map((attempt) =>
    [
      `- \`${attempt.status}\` attempt ${attempt.attempt}`,
      `topic \`${attempt.topicId}\``,
      `commit \`${attempt.commit.slice(0, 10)}\``,
      attempt.autonomy === undefined ? "" : `autonomy \`${attempt.autonomy}\``,
      attempt.risk === undefined ? "" : `risk \`${attempt.risk}\``,
      attempt.decision === undefined ? "" : `decision \`${attempt.decision}\``,
      `prompt \`${attempt.promptPath}\``,
      `result \`${attempt.resultPath}\``,
      attempt.commandLogPath === undefined ? "" : `log \`${attempt.commandLogPath}\``,
      attempt.memoryPath === undefined ? "" : `memory \`${attempt.memoryPath}\``,
      attempt.verificationResults === undefined
        ? ""
        : `proof ${attempt.verificationResults.filter((result) => result.exitCode === 0).length}/${attempt.verificationResults.length}`,
      `- ${attempt.message}`,
    ]
      .filter((part) => part.length > 0)
      .join(" "),
  );
}

function shortSha(value: string | undefined): string {
  return (value ?? "unknown").slice(0, 10);
}

function limitedLines(
  items: ReadonlyArray<string>,
  limit: number,
  fallback: string,
): ReadonlyArray<string> {
  if (items.length === 0) return [fallback];
  const visible = items.slice(0, limit);
  const remaining = items.length - visible.length;
  return remaining > 0 ? [...visible, `...and ${remaining} more`] : visible;
}

export function formatNightlyAgentMarkdown(input: NightlyAgentReportInput): string {
  const replayCounts = new Map<string, number>();
  for (const record of input.topicRecords) {
    replayCounts.set(record.status, (replayCounts.get(record.status) ?? 0) + 1);
  }
  const replaySummary =
    replayCounts.size === 0
      ? "none"
      : [...replayCounts.entries()].map(([status, count]) => `${status}: ${count}`).join(", ");

  const lines: Array<string> = [
    "# T3 Code Nightly Upstream Replay Report",
    "",
    "## Result",
    "",
    `- Status: \`${input.status}\``,
    `- Decision: \`${input.decisionReason}\``,
    `- Started: \`${input.startedAt}\``,
    `- Finished: \`${input.finishedAt}\``,
    `- Replay summary: ${replaySummary}`,
    ...(input.errorMessage ? [`- Error: ${input.errorMessage}`] : []),
    "",
    "## Paths",
    "",
    `- Control worktree: \`${input.controlRoot}\``,
    `- Repo family root: \`${input.repoFamilyRoot}\``,
    `- Original worktree: \`${input.originalPath}\``,
    `- Nightly worktree: \`${input.nightlyPath}\``,
    `- Nightly HEAD: \`${input.nightlyHead ?? "unknown"}\``,
    `- Artifacts: \`${input.artifactDir}\``,
    `- Topic catalog: \`${input.topicCatalogPath}\``,
    "",
    "## Ping.gg Upstream Overview",
    "",
    `- Previous \`upstream/main\`: \`${input.upstreamBefore ?? "unknown"}\``,
    `- Current \`upstream/main\`: \`${input.upstreamAfter ?? "unknown"}\``,
    ...bulletLines(input.upstreamCommits, "No new upstream commits were found for this run."),
    "",
    "## Replayed Local Features",
    "",
  ];

  for (const topic of input.topicSummaries) {
    lines.push(`### ${topic.id}`, "", `- Title: ${topic.title}`, `- Subject: ${topic.subject}`);
    lines.push(`- Commits: ${topic.commits.map((commit) => `\`${commit}\``).join(", ")}`);
    lines.push(
      `- Replay status: ${
        topic.replayStatuses.length === 0 ? "`not-run`" : topic.replayStatuses.join(", ")
      }`,
    );
    if (topic.replayContract !== undefined) {
      lines.push(
        "- Replay contract:",
        `  - Autonomy: \`${topic.replayContract.autonomy}\``,
        `  - Risk: \`${topic.replayContract.risk}\``,
        `  - Intent: ${topic.replayContract.intent}`,
        "  - Preserve:",
        ...topic.replayContract.preserve.map((item) => `    - ${item}`),
        "  - Safe auto-repair:",
        ...topic.replayContract.safeAutoRepair.map((item) => `    - ${item}`),
        "  - Stop for human:",
        ...topic.replayContract.stopForHuman.map((item) => `    - ${item}`),
      );
    }
    lines.push("- Verification commands:");
    lines.push(
      ...bulletLines(
        topic.verification.map((item) => `\`${item}\``),
        "No topic-specific verification command recorded.",
      ),
    );
    for (const heading of REPLAY_CHECKLIST_HEADINGS) {
      lines.push(`- ${heading}:`);
      lines.push(
        ...bulletLines(topic.checklist[heading] ?? [], "No checked checklist item recorded."),
      );
    }
    lines.push("");
  }

  lines.push(
    "## Proof Artifacts",
    "",
    "- Core replay proof: a successful apply run means `vp check`, `vp run typecheck`, and `pnpm run topic-plugins:check` completed inside the replay flow.",
    ...bulletLines(
      input.proofArtifacts,
      "No run-specific nightly-public screenshot or verifier artifact was produced.",
    ),
    "",
    "## Conflicts Or Human Input Needed",
    "",
    ...bulletLines(input.conflictFiles, "No unresolved merge-conflict files were detected."),
    "",
    "## Conflict Decision Artifacts",
    "",
    ...bulletLines(
      input.conflictArtifacts,
      "No conflict decision packet was generated for this run.",
    ),
    ...(input.conflictBriefPath === undefined
      ? []
      : [`- Conflict Brief: \`${input.conflictBriefPath}\``]),
    ...(input.conflictBriefError === undefined
      ? []
      : [`- Conflict Brief generation failed: ${input.conflictBriefError}`]),
    "",
    "## Autonomous Repair Attempts",
    "",
    ...autoRepairAttemptLines(input.autoRepairAttempts),
    "",
    "## Commands",
    "",
  );

  for (const result of input.commandResults) {
    lines.push(
      `- \`${result.exitCode}\` \`${result.command}\` in \`${result.cwd}\``,
      ...(result.exitCode === 0 ? [] : [`  - ${result.stderr || result.stdout}`]),
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function formatTopicCatalog(input: NightlyAgentReportInput): string {
  const lines: Array<string> = [
    "# T3 Code Local Topic Catalog",
    "",
    "This catalog is generated by the nightly upstream agent so the Linear run issue and future agents can answer questions about the replayed local topic stack.",
    "",
    "## How To Use This Catalog",
    "",
    `- Ask a T3 Code agent to read \`${input.topicCatalogPath}\` and summarize any local topic.`,
    `- Ask a T3 Code agent to read \`${input.reportPath}\` and explain replay conflicts or proof.`,
    "- The matching Linear run issue contains the scan-friendly topic checklist and promotion state.",
    "",
    "## Run Context",
    "",
    `- Status: \`${input.status}\``,
    `- Decision: \`${input.decisionReason}\``,
    `- Started: \`${input.startedAt}\``,
    `- Finished: \`${input.finishedAt}\``,
    `- Previous upstream: \`${input.upstreamBefore ?? "unknown"}\``,
    `- Current upstream: \`${input.upstreamAfter ?? "unknown"}\``,
    `- Full report: \`${input.reportPath}\``,
    "",
    "## Latest Ping.gg Upstream Commits",
    "",
    ...bulletLines(input.upstreamCommits, "No new upstream commits were found for this run."),
    "",
    "## Local Topics",
    "",
  ];

  for (const topic of input.topicSummaries) {
    lines.push(
      `### ${topic.id}`,
      "",
      `- Title: ${topic.title}`,
      `- Subject: ${topic.subject}`,
      `- Documentation: \`${topic.pluginPath}/README.md\``,
      `- Metadata: \`${topic.pluginPath}/plugin.json\``,
      `- Commits: ${topic.commits.map((commit) => `\`${commit}\``).join(", ")}`,
      `- Replay status: ${
        topic.replayStatuses.length === 0 ? "`not-run`" : topic.replayStatuses.join(", ")
      }`,
      ...(topic.replayContract === undefined
        ? []
        : [
            `- Replay contract: \`${topic.replayContract.autonomy}\`, risk \`${topic.replayContract.risk}\``,
            `- Intent: ${topic.replayContract.intent}`,
            "- Safe auto-repair:",
            ...bulletLines(
              topic.replayContract.safeAutoRepair,
              "No safe auto-repair cases listed.",
            ),
            "- Stop for Jordan:",
            ...bulletLines(topic.replayContract.stopForHuman, "No human stop conditions listed."),
          ]),
      "- Verification:",
      ...bulletLines(
        topic.verification.map((item) => `\`${item}\``),
        "No topic-specific verification command recorded.",
      ),
    );
    for (const heading of REPLAY_CHECKLIST_HEADINGS) {
      lines.push(`- ${heading}:`);
      lines.push(
        ...bulletLines(topic.checklist[heading] ?? [], "No checked checklist item recorded."),
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function truncateForTelegram(message: string): string {
  const limit = 3_700;
  if (message.length <= limit) return message;
  return `${message.slice(0, limit - 120)}\n\n[truncated; full report is on disk]`;
}

const CONFLICT_BRIEF_REPLY_PROMPT = "Tap an option in the Conflict Decision Card.";
const CONFLICT_BRIEF_NEXT_ACTION = `Next action:\n${CONFLICT_BRIEF_REPLY_PROMPT}`;

export function normalizeConflictBriefForTelegram(message: string): string {
  const limit = 3_700;
  const trimmed = message.trim();
  const bodyWithoutNextAction = trimmed
    .replace(/Next action:\s*[\s\S]*$/iu, "")
    .replace(/Reply `apply recommendation` if you want me to fix it\.?\s*$/iu, "")
    .trimEnd();
  const trimNote = "[Trimmed for Telegram; raw draft saved as `conflict-brief.raw.md`.]";
  const reservedTail = `\n\n${trimNote}\n\n${CONFLICT_BRIEF_NEXT_ACTION}`;

  if (`${bodyWithoutNextAction}\n\n${CONFLICT_BRIEF_NEXT_ACTION}`.length <= limit) {
    return `${bodyWithoutNextAction}\n\n${CONFLICT_BRIEF_NEXT_ACTION}`.trim();
  }

  const maxBodyLength = Math.max(0, limit - reservedTail.length - 5);
  const clippedBody = bodyWithoutNextAction.slice(0, maxBodyLength).trimEnd();
  return `${clippedBody}\n...\n\n${trimNote}\n\n${CONFLICT_BRIEF_NEXT_ACTION}`.trim();
}

const CONFLICT_BRIEF_SECTION_LABELS = [
  "Feature conflict overview",
  "What upstream changed",
  "What our local topic is preserving",
  "Why they collide",
  "Auto-repair eligibility",
  "Resolution options",
  "Recommendation",
  "Confidence",
  "Risks and trade-offs",
  "Proof/tests needed",
  "Next action",
] as const;

interface TelegramHtmlMessage {
  readonly html: string;
  readonly replyMarkup?: unknown;
}

function parseConflictBriefSections(
  markdown: string,
): ReadonlyMap<(typeof CONFLICT_BRIEF_SECTION_LABELS)[number], string> {
  const sections = new Map<(typeof CONFLICT_BRIEF_SECTION_LABELS)[number], Array<string>>();
  let current: (typeof CONFLICT_BRIEF_SECTION_LABELS)[number] | undefined;
  for (const line of markdown.split(/\r?\n/u)) {
    const trimmed = line.trim();
    const label = CONFLICT_BRIEF_SECTION_LABELS.find((candidate) => trimmed === `${candidate}:`);
    if (label !== undefined) {
      current = label;
      sections.set(current, []);
      continue;
    }
    if (current !== undefined) {
      sections.get(current)!.push(line);
    }
  }
  return new Map(
    [...sections.entries()].map(([heading, lines]) => [heading, lines.join("\n").trim()]),
  );
}

function escapeTelegramHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderTelegramInlineCode(value: string): string {
  return value
    .split(/`([^`]+)`/u)
    .map((part, index) =>
      index % 2 === 1 ? `<code>${escapeTelegramHtml(part)}</code>` : escapeTelegramHtml(part),
    )
    .join("");
}

function parseUpstreamCommitLine(line: string): {
  readonly hash?: string;
  readonly date?: string;
  readonly subject: string;
} {
  const match = /^([0-9a-f]{7,40})\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/iu.exec(line.trim());
  if (match === null) {
    return { subject: line.trim() };
  }
  return {
    hash: match[1]!,
    date: match[2]!,
    subject: match[3]!,
  };
}

function upstreamCommitHtmlLine(line: string): string {
  const commit = parseUpstreamCommitLine(line);
  const prefix =
    commit.hash === undefined || commit.date === undefined
      ? ""
      : `<code>${escapeTelegramHtml(commit.hash)}</code> ${escapeTelegramHtml(commit.date)} `;
  return `- ${prefix}${escapeTelegramHtml(commit.subject)}`;
}

const UPSTREAM_CHANGE_GROUPS: ReadonlyArray<{
  readonly label: string;
  readonly matches: (subject: string) => boolean;
}> = [
  {
    label: "Mobile/client",
    matches: (subject) =>
      /\b(mobile|client|thread rows?|pr indicator|pr number|badge|font|favicon|offline|preferences?)\b/iu.test(
        subject,
      ),
  },
  {
    label: "Codex/runtime",
    matches: (subject) => /\b(codex|reasoning|worktree|branch sync|metadata)\b/iu.test(subject),
  },
  {
    label: "Desktop/release",
    matches: (subject) =>
      /\b(desktop|electron|electron-builder|asar|release|packaging)\b/iu.test(subject),
  },
  {
    label: "Auth/dependencies",
    matches: (subject) => /\b(clerk|toolchain|stack|dependencies?|deps)\b/iu.test(subject),
  },
];

function pluralizeChange(count: number): string {
  return count === 1 ? "1 change" : `${count} changes`;
}

function upstreamOverviewHtmlLines(commits: ReadonlyArray<string>): ReadonlyArray<string> {
  if (commits.length === 0) {
    return ["- No new upstream commits were found for this run."];
  }

  const remaining = commits.map((line) => ({
    line,
    subject: parseUpstreamCommitLine(line).subject,
  }));
  const lines: Array<string> = [];

  for (const group of UPSTREAM_CHANGE_GROUPS) {
    const matches = remaining.filter((commit) => group.matches(commit.subject));
    if (matches.length === 0) continue;
    for (const match of matches) {
      remaining.splice(
        remaining.findIndex((candidate) => candidate.line === match.line),
        1,
      );
    }
    const examples = matches
      .slice(0, 2)
      .map((commit) => escapeTelegramHtml(commit.subject.replace(/\s+\(#\d+\)$/u, "")));
    lines.push(
      `- <b>${group.label}</b>: ${pluralizeChange(matches.length)} - ${examples.join("; ")}`,
    );
  }

  if (remaining.length > 0) {
    const examples = remaining
      .slice(0, 2)
      .map((commit) => escapeTelegramHtml(commit.subject.replace(/\s+\(#\d+\)$/u, "")));
    lines.push(
      `- <b>Other upstream</b>: ${pluralizeChange(remaining.length)} - ${examples.join("; ")}`,
    );
  }

  return lines;
}

function truncatePlainSection(value: string, limit = 900): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 20).trimEnd()}\n...[trimmed]`;
}

function conflictBriefHtmlSection(
  title: (typeof CONFLICT_BRIEF_SECTION_LABELS)[number],
  sections: ReadonlyMap<(typeof CONFLICT_BRIEF_SECTION_LABELS)[number], string>,
): string {
  const value = sections.get(title) ?? "No detail was generated for this section.";
  return `<b>${escapeTelegramHtml(title)}</b>\n${renderTelegramInlineCode(
    truncatePlainSection(value),
  )}`;
}

function conflictBriefCopyButtons(topicCatalogPath: string): unknown {
  return {
    inline_keyboard: [
      [
        {
          text: "Copy: apply recommendation",
          copy_text: { text: "apply recommendation" },
        },
      ],
      [
        {
          text: "Copy: ask about topics",
          copy_text: {
            text: `Jordan's Hermes, read ${topicCatalogPath} and summarize the remote-access topic.`,
          },
        },
      ],
    ],
  };
}

function topicRecordsPath(artifactDir: string): string {
  return NodePath.join(artifactDir, "topics.json");
}

function readFirstConflictRecord(artifactDir: string): TopicRecord | undefined {
  const records = readJsonFile<ReadonlyArray<TopicRecord>>(topicRecordsPath(artifactDir)) ?? [];
  return records.find((record) => record.status === "conflict");
}

function conflictActionText(
  action: "auto-repair" | "show-options" | "defer",
  runId: string,
  topicId: string,
): string {
  if (action === "auto-repair") {
    return `Jordan's Hermes: auto-repair nightly conflict ${runId} ${topicId}`;
  }
  if (action === "show-options") {
    return `Jordan's Hermes: show feature options for nightly conflict ${runId} ${topicId}`;
  }
  return `Jordan's Hermes: defer nightly conflict ${runId} ${topicId}`;
}

export function formatConflictBriefTelegramMessages(input: {
  readonly markdown: string;
  readonly reportPath: string;
  readonly topicCatalogPath: string;
}): ReadonlyArray<TelegramHtmlMessage> {
  const sections = parseConflictBriefSections(input.markdown);
  const nextAction = sections.get("Next action") ?? CONFLICT_BRIEF_REPLY_PROMPT.replaceAll("`", "");
  return [
    {
      html: [
        "<b>T3 Code Nightly Conflict Brief</b>",
        "<b>Status</b>\nReplay is paused on a conflict. The nightly worktree contains the in-progress cherry-pick; staging/main have not been promoted.",
        conflictBriefHtmlSection("Feature conflict overview", sections),
        conflictBriefHtmlSection("What upstream changed", sections),
        conflictBriefHtmlSection("What our local topic is preserving", sections),
      ].join("\n\n"),
    },
    {
      html: [
        "<b>Conflict Shape</b>",
        conflictBriefHtmlSection("Why they collide", sections),
        conflictBriefHtmlSection("Auto-repair eligibility", sections),
        conflictBriefHtmlSection("Resolution options", sections),
        conflictBriefHtmlSection("Recommendation", sections),
        conflictBriefHtmlSection("Confidence", sections),
      ].join("\n\n"),
    },
    {
      html: [
        "<b>Resolve Safely</b>",
        conflictBriefHtmlSection("Risks and trade-offs", sections),
        conflictBriefHtmlSection("Proof/tests needed", sections),
        `<b>Next action</b>\n${renderTelegramInlineCode(nextAction)}`,
        "<b>Ask Hermes About The Stack</b>",
        `<code>Jordan's Hermes, read ${escapeTelegramHtml(
          input.topicCatalogPath,
        )} and summarize the remote-access topic.</code>`,
        "<b>Run Artifacts</b>",
        `<code>${escapeTelegramHtml(input.reportPath)}</code>`,
      ].join("\n\n"),
      replyMarkup: conflictBriefCopyButtons(input.topicCatalogPath),
    },
  ];
}

export function formatConflictDecisionCardTelegramMessage(input: {
  readonly markdown: string;
  readonly conflictPromptPath: string;
  readonly reportPath: string;
  readonly topicCatalogPath: string;
  readonly runId: string;
  readonly conflictTopicId: string;
}): TelegramHtmlMessage {
  const sections = parseConflictBriefSections(input.markdown);
  const recommendation =
    sections.get("Recommendation") ?? "Use the generated recommendation after reviewing risks.";
  const autoRepairEligibility =
    sections.get("Auto-repair eligibility") ??
    "Auto-repair should be attempted when the local feature can be preserved on top of upstream without a product or architecture decision.";
  return {
    html: [
      "<b>Conflict Decision Card</b>",
      `<b>Conflict</b>\nRun <code>${escapeTelegramHtml(input.runId)}</code>, topic <code>${escapeTelegramHtml(
        input.conflictTopicId,
      )}</code>`,
      "<b>Policy</b>\nDefault to safe auto-repair and document what changed. Stop for Jordan only when the local feature cannot still work on top of the new upstream behavior without a product decision.",
      `<b>Auto-repair eligibility</b>\n${renderTelegramInlineCode(
        truncatePlainSection(autoRepairEligibility, 500),
      )}`,
      `<b>Recommendation</b>\n${renderTelegramInlineCode(truncatePlainSection(recommendation, 700))}`,
      "<b>Choose one</b>\nTap a keyboard option below. Telegram will send that choice into the Hermes chat so the existing gateway can act on it.",
    ].join("\n\n"),
    replyMarkup: {
      keyboard: [
        [
          {
            text: conflictActionText("auto-repair", input.runId, input.conflictTopicId),
          },
        ],
        [
          {
            text: conflictActionText("show-options", input.runId, input.conflictTopicId),
          },
        ],
        [
          {
            text: conflictActionText("defer", input.runId, input.conflictTopicId),
          },
        ],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
      input_field_placeholder: "Choose a nightly conflict action",
    },
  };
}

function cleanlyAppliedTopics(
  topicSummaries: ReadonlyArray<TopicSummary>,
): ReadonlyArray<TopicSummary> {
  return topicSummaries.filter(
    (topic) =>
      topic.replayStatuses.length > 0 &&
      topic.replayStatuses.every(
        (status) => status.startsWith("applied:") || status.startsWith("empty-skipped:"),
      ) &&
      topic.replayStatuses.some((status) => status.startsWith("applied:")),
  );
}

function autoRepairedTopics(
  topicSummaries: ReadonlyArray<TopicSummary>,
): ReadonlyArray<TopicSummary> {
  return topicSummaries.filter(
    (topic) =>
      topic.replayStatuses.some((status) => status.startsWith("auto-resolved:")) &&
      topic.replayStatuses.every(
        (status) =>
          status.startsWith("applied:") ||
          status.startsWith("auto-resolved:") ||
          status.startsWith("empty-skipped:"),
      ),
  );
}

function topicListHtmlLines(
  topics: ReadonlyArray<TopicSummary>,
  emptyLine: string,
): ReadonlyArray<string> {
  if (topics.length === 0) return [escapeTelegramHtml(emptyLine)];
  return topics.map(
    (topic, index) =>
      `[x] <code>${String(index + 1).padStart(2, "0")}</code> <b>${escapeTelegramHtml(
        topic.id,
      )}</b> - ${escapeTelegramHtml(topic.subject)}`,
  );
}

export function formatAppliedTopicsTelegramMessages(input: {
  readonly status: NightlyAgentStatus;
  readonly decisionReason: string;
  readonly topicSummaries: ReadonlyArray<TopicSummary>;
  readonly reportPath: string;
  readonly topicCatalogPath: string;
}): ReadonlyArray<TelegramHtmlMessage> {
  const applied = cleanlyAppliedTopics(input.topicSummaries);
  const autoRepaired = autoRepairedTopics(input.topicSummaries);
  const htmlMessages = splitTelegramHtmlLines(
    [
      "<b>T3 Code Topics Applied Without Conflicts</b>",
      `Run status: <code>${escapeTelegramHtml(input.status)}</code>`,
      `Decision: <code>${escapeTelegramHtml(input.decisionReason)}</code>`,
      "",
      "<b>Applied cleanly</b>",
    ],
    [
      ...topicListHtmlLines(applied, "No topics have applied cleanly yet."),
      "",
      "<b>Auto-repaired and completed</b>",
      ...topicListHtmlLines(autoRepaired, "No topics were auto-repaired in this run."),
    ],
    [
      "",
      "<b>Topic docs</b>",
      `<code>${escapeTelegramHtml(input.topicCatalogPath)}</code>`,
      "<b>Full report</b>",
      `<code>${escapeTelegramHtml(input.reportPath)}</code>`,
    ],
  );
  return htmlMessages.map((html, index) => ({
    html,
    ...(index === htmlMessages.length - 1
      ? {
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: "Copy: explain applied topics",
                  copy_text: {
                    text: `Jordan's Hermes, read ${input.topicCatalogPath} and summarize only the topics that applied without conflicts.`,
                  },
                },
              ],
            ],
          },
        }
      : {}),
  }));
}

function conflictStatusRank(topic: TopicSummary): number {
  const state = topicChecklistState(topic);
  if (state.label === "conflicted") return 0;
  if (state.label === "replayed") return 1;
  if (state.label === "skipped empty") return 2;
  if (state.label === "pending" || state.label === "not run") return 3;
  return 4;
}

function topicChecklistState(topic: TopicSummary): {
  readonly marker: string;
  readonly label: string;
} {
  if (topic.replayStatuses.some((status) => status.startsWith("conflict:"))) {
    return { marker: "[!]", label: "conflicted" };
  }
  if (topic.replayStatuses.some((status) => status.startsWith("pending:"))) {
    return { marker: "[ ]", label: "pending" };
  }
  if (topic.replayStatuses.length === 0) {
    return { marker: "[ ]", label: "not run" };
  }
  if (topic.replayStatuses.every((status) => status.startsWith("empty-skipped:"))) {
    return { marker: "[-]", label: "skipped empty" };
  }
  if (
    topic.replayStatuses.every(
      (status) =>
        status.startsWith("applied:") ||
        status.startsWith("auto-resolved:") ||
        status.startsWith("empty-skipped:"),
    )
  ) {
    return { marker: "[x]", label: "replayed" };
  }
  return { marker: "[ ]", label: "in progress" };
}

function splitTelegramHtmlLines(
  header: ReadonlyArray<string>,
  lines: ReadonlyArray<string>,
  footer: ReadonlyArray<string>,
  limit = 3_500,
): ReadonlyArray<string> {
  const messages: Array<string> = [];
  let current = [...header];
  for (const line of lines) {
    const candidate = [...current, line, ...footer].join("\n");
    if (candidate.length > limit && current.length > header.length) {
      messages.push([...current, ...footer].join("\n"));
      current = [...header, line];
    } else {
      current.push(line);
    }
  }
  messages.push([...current, ...footer].join("\n"));
  return messages;
}

export function formatTopicStackChecklistTelegramMessages(input: {
  readonly status: NightlyAgentStatus;
  readonly decisionReason: string;
  readonly upstreamBefore?: string;
  readonly upstreamAfter?: string;
  readonly topicSummaries: ReadonlyArray<TopicSummary>;
  readonly reportPath: string;
  readonly topicCatalogPath: string;
}): ReadonlyArray<TelegramHtmlMessage> {
  const sortedTopics = [...input.topicSummaries].sort(
    (left, right) =>
      conflictStatusRank(left) - conflictStatusRank(right) ||
      input.topicSummaries.indexOf(left) - input.topicSummaries.indexOf(right),
  );
  const lines = sortedTopics.map((topic) => {
    const originalIndex = input.topicSummaries.indexOf(topic);
    const state = topicChecklistState(topic);
    return `${state.marker} <code>${String(originalIndex + 1).padStart(2, "0")}</code> <b>${escapeTelegramHtml(
      topic.id,
    )}</b> - ${escapeTelegramHtml(state.label)}\n${escapeTelegramHtml(topic.subject)}`;
  });
  const htmlMessages = splitTelegramHtmlLines(
    [
      "<b>T3 Code Topic Stack Checklist</b>",
      `Run status: <code>${escapeTelegramHtml(input.status)}</code>`,
      `Decision: <code>${escapeTelegramHtml(input.decisionReason)}</code>`,
      `Upstream: <code>${escapeTelegramHtml(shortSha(input.upstreamBefore))}</code> -> <code>${escapeTelegramHtml(
        shortSha(input.upstreamAfter),
      )}</code>`,
      "",
    ],
    lines,
    [
      "",
      "<b>Ask about topic docs</b>",
      `<code>Jordan's Hermes, read ${escapeTelegramHtml(
        input.topicCatalogPath,
      )} and summarize the topic I name next.</code>`,
      "<b>Full report</b>",
      `<code>${escapeTelegramHtml(input.reportPath)}</code>`,
    ],
  );
  return htmlMessages.map((html, index) => ({
    html,
    ...(index === htmlMessages.length - 1
      ? {
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: "Copy: ask about topics",
                  copy_text: {
                    text: `Jordan's Hermes, read ${input.topicCatalogPath} and summarize the remote-access topic.`,
                  },
                },
              ],
              [
                {
                  text: "Copy: show failed/conflicted",
                  copy_text: {
                    text: `Jordan's Hermes, read ${input.reportPath} and list only failed or conflicted topics.`,
                  },
                },
              ],
            ],
          },
        }
      : {}),
  }));
}

export function formatTelegramSummary(input: NightlyAgentReportInput): string {
  const topicLines = input.topicSummaries.map((topic, index) => `${index + 1}. ${topic.subject}`);
  const upstreamLines = limitedLines(
    input.upstreamCommits,
    6,
    "No new upstream commits were found for this run.",
  ).map((line) => `- ${line}`);
  const conflictLine =
    input.conflictFiles.length === 0
      ? "Conflicts: none"
      : `Conflicts: ${input.conflictFiles.join(", ")}`;
  const conflictArtifactLines = input.conflictArtifacts.map((path) => `- ${path}`);
  const conflictBriefLines =
    input.conflictBriefPath === undefined ? [] : [`Conflict Brief: ${input.conflictBriefPath}`];
  const conflictBriefErrorLines =
    input.conflictBriefError === undefined
      ? []
      : [`Hermes Conflict Brief failed: ${input.conflictBriefError}`];
  return truncateForTelegram(
    [
      `T3 Code nightly replay: ${input.status.toUpperCase()}`,
      `Decision: ${input.decisionReason}`,
      `Upstream: ${shortSha(input.upstreamBefore)} -> ${shortSha(input.upstreamAfter)}`,
      "",
      "Latest ping.gg upstream:",
      ...upstreamLines,
      "",
      conflictLine,
      ...(conflictArtifactLines.length === 0
        ? []
        : ["Conflict decision packet:", ...conflictArtifactLines]),
      ...conflictBriefLines,
      ...conflictBriefErrorLines,
      "Proof/tests:",
      ...proofSummaryLines(input),
      `Autonomous repair: ${
        input.autoRepairAttempts === undefined || input.autoRepairAttempts.length === 0
          ? "not run"
          : input.autoRepairAttempts
              .map((attempt) => `${attempt.topicId} ${attempt.status}`)
              .join(", ")
      }`,
      `Report: ${input.reportPath}`,
      `Topic docs: ${input.topicCatalogPath}`,
      "",
      "Replayed feature stack:",
      ...topicLines,
      ...(input.errorMessage ? ["", `Error: ${input.errorMessage}`] : []),
    ].join("\n"),
  );
}

function replaySummaryLine(records: ReadonlyArray<TopicRecord>): string {
  const replayCounts = new Map<string, number>();
  for (const record of records) {
    replayCounts.set(record.status, (replayCounts.get(record.status) ?? 0) + 1);
  }
  if (replayCounts.size === 0) return "No topic replay records were written.";
  return [...replayCounts.entries()].map(([status, count]) => `${status}: ${count}`).join(", ");
}

function conflictSummaryHtml(input: NightlyAgentReportInput): ReadonlyArray<string> {
  if (input.conflictFiles.length === 0) {
    return ["Conflicts: none"];
  }
  return [
    `Conflicts: ${input.conflictFiles.length}`,
    ...limitedLines(
      input.conflictFiles,
      5,
      "No unresolved merge-conflict files were detected.",
    ).map((file) => `- <code>${escapeTelegramHtml(file)}</code>`),
  ];
}

function replayPipelineResult(input: NightlyAgentReportInput): CommandResult | undefined {
  for (let index = input.commandResults.length - 1; index >= 0; index -= 1) {
    const result = input.commandResults[index];
    if (result?.command.includes("topic-stack:nightly")) return result;
  }
  return undefined;
}

export function proofSummaryLines(input: NightlyAgentReportInput): ReadonlyArray<string> {
  const lines: Array<string> = [];
  const replay = replayPipelineResult(input);
  if (replay !== undefined) {
    lines.push(
      `Completed stack: ${replay.exitCode === 0 ? "PASS" : "FAIL"} (frozen install, vp check, vp run typecheck, topic metadata validation).`,
    );
  } else {
    lines.push("Completed stack: not run.");
  }
  const verificationResults = [
    ...(input.autoRepairAttempts ?? []).flatMap((attempt) => attempt.verificationResults ?? []),
    ...input.commandResults.filter((result) => result.command.includes("verify:nightly-public")),
  ];
  const uniqueResults = [
    ...new Map(verificationResults.map((result) => [result.command, result])).values(),
  ];
  lines.push(
    ...uniqueResults
      .slice(0, 8)
      .map((result) => `${result.exitCode === 0 ? "PASS" : "FAIL"}: ${result.command}`),
  );
  const publicVerifier = input.commandResults.find((result) =>
    result.command.includes("verify:nightly-public"),
  );
  if (publicVerifier === undefined) {
    lines.push("Nightly public verifier: not requested for this run.");
  }
  lines.push(
    input.proofArtifacts.length === 0
      ? "Run-specific browser artifacts: none."
      : `Run-specific browser artifacts: ${input.proofArtifacts.length}.`,
  );
  return lines;
}

function autoRepairSummaryLine(input: NightlyAgentReportInput): string {
  const attempts = input.autoRepairAttempts ?? [];
  if (attempts.length === 0) return "No autonomous repair attempt ran.";
  return attempts.map((attempt) => `${attempt.topicId}: ${attempt.status}`).join(", ");
}

export function formatFinalTelegramSummaryMessages(
  input: NightlyAgentReportInput,
): ReadonlyArray<TelegramHtmlMessage> {
  const conflictBriefLines =
    input.conflictBriefPath === undefined
      ? []
      : [`Conflict Brief: <code>${escapeTelegramHtml(input.conflictBriefPath)}</code>`];
  const conflictBriefErrorLines =
    input.conflictBriefError === undefined
      ? []
      : [`Conflict Brief error: ${escapeTelegramHtml(input.conflictBriefError)}`];
  return [
    {
      html: [
        `<b>T3 Code Nightly ${escapeTelegramHtml(input.status.toUpperCase())}</b>`,
        `Decision: <code>${escapeTelegramHtml(input.decisionReason)}</code>`,
        `Upstream: <code>${escapeTelegramHtml(shortSha(input.upstreamBefore))}</code> -> <code>${escapeTelegramHtml(
          shortSha(input.upstreamAfter),
        )}</code>`,
        "",
        "<b>Replay</b>",
        escapeTelegramHtml(replaySummaryLine(input.topicRecords)),
        ...(input.errorMessage === undefined
          ? []
          : ["", "<b>Error</b>", escapeTelegramHtml(input.errorMessage)]),
        "",
        "<b>Conflicts</b>",
        ...conflictSummaryHtml(input),
        ...conflictBriefLines,
        ...conflictBriefErrorLines,
        "",
        "<b>Proof</b>",
        ...proofSummaryLines(input).map(escapeTelegramHtml),
        "",
        "<b>Autonomous Repair</b>",
        escapeTelegramHtml(autoRepairSummaryLine(input)),
        "",
        "<b>Artifacts</b>",
        `Report: <code>${escapeTelegramHtml(input.reportPath)}</code>`,
        `Topic docs: <code>${escapeTelegramHtml(input.topicCatalogPath)}</code>`,
      ].join("\n"),
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: "Copy: ask full report",
              copy_text: {
                text: `Jordan's Hermes, read ${input.reportPath} and summarize the latest nightly run.`,
              },
            },
          ],
          [
            {
              text: "Copy: ask failed topics",
              copy_text: {
                text: `Jordan's Hermes, read ${input.reportPath} and list failed or conflicted topics with recommendations.`,
              },
            },
          ],
        ],
      },
    },
  ];
}

export function formatConflictBriefGenerationPrompt(input: {
  readonly conflictPromptPath: string;
  readonly conflictPacketPath: string;
  readonly reportPath: string;
  readonly topicCatalogPath: string;
}): string {
  return [
    `Read ${input.conflictPromptPath}.`,
    `Read ${input.conflictPacketPath}.`,
    `Use ${input.reportPath} and ${input.topicCatalogPath} only as supporting context if needed.`,
    "",
    "Write a Linear-ready Conflict Brief for Jordan. Do not edit files. Do not continue the cherry-pick.",
    "",
    "The brief must be feature-level, not file-by-file, and concise enough to scan in one Linear comment.",
    "Default to auto-repair when the local topic feature can still work on top of upstream by adapting code, imports, lockfiles, schemas, or tests.",
    "Only recommend stopping for Jordan when the desired local feature or logic fundamentally cannot work on the new upstream behavior without a product or architecture decision.",
    "",
    "Use this exact structure:",
    "# Conflict Brief",
    "Feature conflict overview:",
    "What upstream changed:",
    "What our local topic is preserving:",
    "Why they collide:",
    "Auto-repair eligibility:",
    "Resolution options:",
    "Recommendation:",
    "Confidence:",
    "Risks and trade-offs:",
    "Proof/tests needed:",
    "Next action:",
    "",
    "Always give a recommendation. If auto-repair is safe, say so and recommend auto-repair. If human input is required, explain the fundamental feature decision in plain language.",
    "End with the exact decision Jordan needs to make, or state that the agent should retry autonomously.",
  ].join("\n");
}

export function formatRunningTelegramNotice(input: NightlyRunningNoticeInput): string {
  return [
    "Running nightly upgrade workflow",
    "",
    `Started: ${input.startedAt}`,
    `Control checkout: ${input.controlRoot}`,
    `Original lane: ${input.originalPath}`,
    `Nightly lane: ${input.nightlyPath}`,
    "",
    "Next: fetch ping.gg upstream, summarize latest official changes, then decide whether to replay the local topic stack.",
  ].join("\n");
}

function replayNoticeLine(input: NightlyUpstreamNoticeInput): string {
  if (input.blocker !== undefined) {
    return `Replay: blocked before replay. ${input.blocker}`;
  }
  return input.willReplay
    ? "Replay: starting local topic stack replay now."
    : "Replay: not needed for this run.";
}

export function formatUpstreamTelegramNoticeMessages(
  input: NightlyUpstreamNoticeInput,
): ReadonlyArray<TelegramHtmlMessage> {
  const latestCommits = limitedLines(
    input.upstreamCommits,
    6,
    "No new upstream commits were found for this run.",
  );
  const visibleTopics = input.topicSummaries.slice(0, 6);
  const remainingTopicCount = input.topicSummaries.length - visibleTopics.length;
  const topicLines = visibleTopics.map(
    (topic, index) =>
      `<code>${String(index + 1).padStart(2, "0")}</code> <b>${escapeTelegramHtml(
        topic.id,
      )}</b> - ${escapeTelegramHtml(topic.subject)}`,
  );
  const topicFooter =
    remainingTopicCount > 0
      ? `...and ${remainingTopicCount} more topics. The Topic Stack Checklist follows with the full queue.`
      : "The Topic Stack Checklist follows with replay proof and feature docs.";

  return [
    {
      html: [
        "<b>Nightly upstream summary</b>",
        "<b>Status</b>",
        `Decision: <code>${escapeTelegramHtml(input.decisionReason)}</code>`,
        `Upstream: <code>${escapeTelegramHtml(shortSha(input.upstreamBefore))}</code> -> <code>${escapeTelegramHtml(
          shortSha(input.upstreamAfter),
        )}</code>`,
        escapeTelegramHtml(replayNoticeLine(input)),
        "",
        "<b>Official changes overview</b>",
        ...upstreamOverviewHtmlLines(input.upstreamCommits),
        "",
        "<b>Latest ping.gg commits</b>",
        ...latestCommits.map(upstreamCommitHtmlLine),
        "",
        "<b>Local topics queued</b>",
        `${input.topicSummaries.length} topic${input.topicSummaries.length === 1 ? "" : "s"} ready for replay/documentation.`,
        ...topicLines,
        escapeTelegramHtml(topicFooter),
      ].join("\n"),
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: "Copy: explain upstream",
              copy_text: {
                text: "Jordan's Hermes, summarize the latest ping.gg upstream changes from the nightly upstream summary.",
              },
            },
          ],
          [
            {
              text: "Copy: explain topic queue",
              copy_text: {
                text: "Jordan's Hermes, explain the queued T3 Code local topics and what feature each topic adds.",
              },
            },
          ],
        ],
      },
    },
  ];
}

export function formatUpstreamTelegramNotice(input: NightlyUpstreamNoticeInput): string {
  return truncateForTelegram(
    telegramHtmlMessagesToPlain(formatUpstreamTelegramNoticeMessages(input)),
  );
}

function telegramHtmlMessagesToPlain(messages: ReadonlyArray<TelegramHtmlMessage>): string {
  return messages
    .map((message) =>
      message.html
        .replace(/<br\s*\/?>/giu, "\n")
        .replace(/<\/(b|code)>/giu, "")
        .replace(/<(b|code)>/giu, "")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&"),
    )
    .join("\n\n---\n\n");
}

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function parseIntegerEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function parseArgs(args: ReadonlyArray<string>): ParsedNightlyAgentArgs {
  let rootDir: string | undefined;
  let force = parseBooleanEnv("T3CODE_NIGHTLY_FORCE", false);
  let linearNotify = parseBooleanEnv("T3CODE_NIGHTLY_LINEAR_NOTIFY", true);
  let publicVerify = parseBooleanEnv("T3CODE_NIGHTLY_PUBLIC_VERIFY", false);
  let autoRepair = parseBooleanEnv("T3CODE_NIGHTLY_AUTO_REPAIR", true);
  let repairCommand = process.env.T3CODE_NIGHTLY_REPAIR_COMMAND;
  let maxRepairAttempts = parseIntegerEnv("T3CODE_NIGHTLY_MAX_REPAIR_ATTEMPTS", 1);
  let help = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--root") {
      rootDir = args[++index];
    } else if (arg.startsWith("--root=")) {
      rootDir = arg.slice("--root=".length);
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--no-linear") {
      linearNotify = false;
    } else if (arg === "--linear") {
      linearNotify = true;
    } else if (arg === "--public-verify") {
      publicVerify = true;
    } else if (arg === "--no-public-verify") {
      publicVerify = false;
    } else if (arg === "--auto-repair") {
      autoRepair = true;
    } else if (arg === "--no-auto-repair") {
      autoRepair = false;
    } else if (arg === "--repair-command") {
      repairCommand = args[++index];
    } else if (arg.startsWith("--repair-command=")) {
      repairCommand = arg.slice("--repair-command=".length);
    } else if (arg === "--max-repair-attempts") {
      maxRepairAttempts = Number.parseInt(args[++index] ?? `${maxRepairAttempts}`, 10);
    } else if (arg.startsWith("--max-repair-attempts=")) {
      maxRepairAttempts = Number.parseInt(arg.slice("--max-repair-attempts=".length), 10);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(maxRepairAttempts) || maxRepairAttempts < 0) {
    throw new Error("--max-repair-attempts must be a non-negative integer.");
  }

  return {
    ...(rootDir === undefined ? {} : { rootDir }),
    force,
    linearNotify,
    publicVerify,
    autoRepair,
    ...(repairCommand === undefined ? {} : { repairCommand }),
    maxRepairAttempts,
    help,
  };
}

function helpText(): string {
  return [
    "Usage: pnpm run nightly:upstream-agent -- [--root <repo-root>] [--force] [--no-linear]",
    "",
    "Fetches upstream/main, rebuilds .worktrees/nightly only when upstream changed, writes a",
    "deterministic report, and records changed runs in Linear.",
    "",
    "Environment:",
    "  LINEAR_API_KEY=<server-owned secret>",
    "  T3CODE_NIGHTLY_LINEAR_NOTIFY=1",
    "  T3CODE_NIGHTLY_LINEAR_TEAM_ID=<team UUID>",
    "  T3CODE_NIGHTLY_LINEAR_PROJECT_ID=<project UUID>",
    "  T3CODE_NIGHTLY_LINEAR_PARENT_ISSUE_ID=<operations issue UUID>",
    "  T3CODE_NIGHTLY_LINEAR_IN_PROGRESS_STATE_ID=<state UUID>",
    "  T3CODE_NIGHTLY_LINEAR_REVIEW_STATE_ID=<state UUID>",
    "  T3CODE_NIGHTLY_LINEAR_TODO_STATE_ID=<state UUID>",
    "  T3CODE_NIGHTLY_PUBLIC_VERIFY=0",
    "  T3CODE_NIGHTLY_AUTO_REPAIR=1",
    "  T3CODE_NIGHTLY_MAX_REPAIR_ATTEMPTS=1",
    "  T3CODE_NIGHTLY_REPAIR_COMMAND='codex exec ...' # optional shell command override",
    "",
  ].join("\n");
}

function writeText(path: string, content: string): void {
  NodeFS.mkdirSync(NodePath.dirname(path), { recursive: true });
  NodeFS.writeFileSync(path, content);
}

function firstUsefulError(result: CommandResult): string {
  return (result.stderr || result.stdout || `exit code ${result.exitCode}`).trim();
}

function generateLinearConflictBrief(input: {
  readonly artifactDir: string;
  readonly reportPath: string;
  readonly topicCatalogPath: string;
  readonly cwd: string;
}): {
  readonly commandResults: ReadonlyArray<CommandResult>;
  readonly conflictBriefPath?: string;
  readonly conflictBriefError?: string;
} {
  const conflictPromptPath = NodePath.join(input.artifactDir, "hermes-conflict-prompt.md");
  const conflictPacketPath = NodePath.join(input.artifactDir, "conflict-packet.md");
  if (!NodeFS.existsSync(conflictPromptPath) || !NodeFS.existsSync(conflictPacketPath)) {
    return { commandResults: [] };
  }

  const conflictBriefPath = NodePath.join(input.artifactDir, "conflict-brief.md");
  const rawConflictBriefPath = NodePath.join(input.artifactDir, "conflict-brief.raw.md");
  const conflictBriefErrorPath = NodePath.join(input.artifactDir, "conflict-brief-error.txt");
  const prompt = formatConflictBriefGenerationPrompt({
    conflictPromptPath,
    conflictPacketPath,
    reportPath: input.reportPath,
    topicCatalogPath: input.topicCatalogPath,
  });
  const commandResults: Array<CommandResult> = [];

  const generateResult = runCommand("hermes", ["-z", prompt], input.cwd, {
    allowFailure: true,
    timeoutMs: 240_000,
  });
  commandResults.push(generateResult);
  if (generateResult.exitCode !== 0 || generateResult.stdout.trim().length === 0) {
    const error = `generation failed: ${firstUsefulError(generateResult)}`;
    writeText(conflictBriefErrorPath, `${error}\n`);
    return { commandResults, conflictBriefError: error };
  }

  writeText(rawConflictBriefPath, generateResult.stdout.trim());
  writeText(conflictBriefPath, generateResult.stdout.trim());

  return { commandResults, conflictBriefPath };
}

function activeCherryPick(nightlyPath: string): string | undefined {
  return gitOutput(nightlyPath, ["rev-parse", "-q", "--verify", "CHERRY_PICK_HEAD"]);
}

function isWorktreeDirty(path: string): boolean {
  return gitDirty(path);
}

function isAutoRepairEligible(topic: TopicSummary | undefined): boolean {
  const contract = topic?.replayContract;
  return contract !== undefined && contract.autonomy !== "manual-decision";
}

export function formatAutonomousRepairPrompt(input: {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly conflictPromptPath: string;
  readonly conflictPacketPath: string;
  readonly nightlyPath: string;
  readonly controlRoot: string;
  readonly topic?: TopicSummary;
  readonly resultPath: string;
  readonly linearIssue?: string;
  readonly linearEvidencePath: string;
  readonly conflictFiles: ReadonlyArray<string>;
}): string {
  const topic = input.topic;
  const contract = topic?.replayContract;
  return [
    "You are the autonomous repair worker for the T3 Code nightly upstream replay.",
    "",
    "Mission:",
    "- Resolve the current cherry-pick conflict only when the local topic can still work on top of the new ping.gg upstream behavior.",
    "- Preserve upstream behavior by default, and adapt the local topic through the new upstream shape.",
    "- Stop without editing when the conflict is fundamental and needs Jordan's product or architecture decision.",
    "",
    "Execution context:",
    `- This scheduled operation is bound to Linear issue ${input.linearIssue ?? "not configured"}; the issue already records the host, worktree policy, service, timer, checks, and evidence contract.`,
    `- This is a non-interactive worker. Do not open Linear MCP calls or create repo files for issue binding. The parent records this attempt at ${input.linearEvidencePath} for reconciliation.`,
    "- The parent wrapper selected the correct worktree; begin with the conflict packet after applying project instructions.",
    "",
    "Hard boundaries:",
    `- You may edit only this nightly worktree: ${input.nightlyPath}`,
    `- Do not edit, reset, merge, promote, or clean staging, main, original, or any other worktree.`,
    "- Do not run destructive git commands such as `git reset --hard`, `git clean`, `git checkout --`, or `git cherry-pick --abort`.",
    "- Do not change the topic manifest order.",
    "- Do not invent new feature behavior; preserve the documented topic contract.",
    "- Never downgrade an upstream dependency version merely to make an older lockfile fragment apply. Preserve current manifests and regenerate compatible lock data when dependency metadata conflicts.",
    "",
    "Read first:",
    `- Conflict prompt: ${input.conflictPromptPath}`,
    `- Full conflict packet for selective reference only: ${input.conflictPacketPath}`,
    "- Do not print or read the full conflict packet or a whole-repo diff. It can exceed the repair context.",
    ...(topic === undefined
      ? []
      : [
          `- Topic README: ${input.controlRoot}/${topic.pluginPath}/README.md`,
          `- Topic metadata: ${input.controlRoot}/${topic.pluginPath}/plugin.json`,
        ]),
    "- Current unmerged files:",
    ...input.conflictFiles.map((path) => `  - ${path}`),
    "",
    "Topic contract:",
    topic === undefined ? "- Topic metadata was unavailable." : `- Topic: ${topic.id}`,
    topic === undefined ? "" : `- Subject: ${topic.subject}`,
    contract === undefined ? "- Replay contract: unavailable" : `- Autonomy: ${contract.autonomy}`,
    contract === undefined ? "" : `- Risk: ${contract.risk}`,
    contract === undefined ? "" : `- Intent: ${contract.intent}`,
    contract === undefined ? "" : "- Preserve:",
    ...(contract?.preserve.map((item) => `  - ${item}`) ?? []),
    contract === undefined ? "" : "- Safe auto-repair cases:",
    ...(contract?.safeAutoRepair.map((item) => `  - ${item}`) ?? []),
    contract === undefined ? "" : "- Stop for Jordan when:",
    ...(contract?.stopForHuman.map((item) => `  - ${item}`) ?? []),
    contract === undefined ? "" : "- Required verification:",
    ...(contract?.verification.map((item) => `  - ${item}`) ?? []),
    "- Allowed repair paths:",
    ...(topic?.repairPaths?.map((path) => `  - ${path}`) ?? ["  - No repair paths declared."]),
    "",
    "Repair procedure:",
    "1. Inspect the conflict at the feature level, then read only the marker regions and nearby code in one unmerged file at a time.",
    "2. If the conflict is safe auto-repair drift, edit the nightly worktree to preserve the topic intent on the new upstream code.",
    "3. Do not run `git add` or `git cherry-pick --continue`; the sandbox cannot write shared Git metadata. The parent wrapper validates and stages only the original conflict paths plus changedFiles from your result, then continues the cherry-pick.",
    "4. Avoid broad `git diff`, `git show`, or repeated whole-worktree status commands after editing; use `git diff --name-only --diff-filter=U`, targeted `rg`, and bounded `sed` ranges so cumulative patch rendering cannot consume the repair context.",
    `5. As soon as the edited files have no conflict markers, use apply_patch to write the required structured JSON decision directly to ${input.resultPath}. Do this before tests, status inspection, or any optional exploration. The parent reads this file even if the CLI cannot render a final message.`,
    "6. The decision artifact must use decision=repaired and rerereReady=true only when the file content is complete; list every changed or deleted product path in changedFiles. Use fundamental-conflict without editing when Jordan must decide; otherwise use incomplete.",
    "7. Run only narrow exploratory checks after the decision artifact exists; the wrapper independently enforces every Replay Contract verification command after the cherry-pick is clean.",
    "8. End with the same structured JSON as the final response when context remains, but do not rely on the final response to create the decision artifact.",
    "",
    "Fundamental conflict procedure:",
    `- If this needs Jordan, do not edit files. Return decision=fundamental-conflict with the feature-level decision in summary and leave the cherry-pick paused. The result is saved to ${input.resultPath}.`,
    "",
    `Attempt: ${input.attempt} of ${input.maxAttempts}`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function runRepairCommand(input: {
  readonly prompt: string;
  readonly promptPath: string;
  readonly resultPath: string;
  readonly finalMessagePath: string;
  readonly resultSchemaPath: string;
  readonly repairCommand?: string;
  readonly controlRoot: string;
  readonly nightlyPath: string;
  readonly artifactDir: string;
}): CommandResult {
  const env: NodeJS.ProcessEnv = {
    T3CODE_NIGHTLY_REPAIR_PROMPT_PATH: input.promptPath,
    T3CODE_NIGHTLY_REPAIR_RESULT_PATH: input.resultPath,
    T3CODE_NIGHTLY_REPAIR_FINAL_MESSAGE_PATH: input.finalMessagePath,
    T3CODE_NIGHTLY_REPAIR_RESULT_SCHEMA_PATH: input.resultSchemaPath,
    T3CODE_NIGHTLY_REPAIR_NIGHTLY_PATH: input.nightlyPath,
    T3CODE_NIGHTLY_REPAIR_CONTROL_ROOT: input.controlRoot,
    T3CODE_NIGHTLY_REPAIR_ARTIFACT_DIR: input.artifactDir,
  };
  const repairModel = process.env.T3CODE_NIGHTLY_REPAIR_MODEL?.trim() || "gpt-5.6-sol";
  if (input.repairCommand !== undefined && input.repairCommand.trim().length > 0) {
    return runCommand("/bin/sh", ["-lc", input.repairCommand], input.controlRoot, {
      allowFailure: true,
      timeoutMs: 1_800_000,
      env,
    });
  }

  return runCommand(
    "codex",
    [
      "exec",
      "--model",
      repairModel,
      "--cd",
      input.nightlyPath,
      "--sandbox",
      "workspace-write",
      "--ephemeral",
      "--color",
      "never",
      "--output-last-message",
      input.finalMessagePath,
      "--output-schema",
      input.resultSchemaPath,
      "--config",
      'approval_policy="never"',
      "--config",
      'model_reasoning_effort="high"',
      "-",
    ],
    input.controlRoot,
    {
      allowFailure: true,
      timeoutMs: 1_800_000,
      env,
      input: input.prompt,
    },
  );
}

function runReplayContractVerification(input: {
  readonly controlRoot: string;
  readonly nightlyPath: string;
  readonly topic: TopicSummary;
}): ReadonlyArray<CommandResult> {
  const path = [
    NodePath.join(input.nightlyPath, "node_modules/.bin"),
    NodePath.join(input.controlRoot, "node_modules/.bin"),
    process.env.PATH ?? "",
  ].join(":");
  return (input.topic.replayContract?.verification ?? []).map((command) =>
    runCommand("/bin/sh", ["-lc", command], input.nightlyPath, {
      allowFailure: true,
      timeoutMs: 1_800_000,
      env: { PATH: path },
    }),
  );
}

function verifyCompletedReplayRepairs(input: {
  readonly attempts: ReadonlyArray<AutonomousRepairAttempt>;
  readonly controlRoot: string;
  readonly nightlyPath: string;
  readonly topicSummaries: ReadonlyArray<TopicSummary>;
}): {
  readonly attempts: ReadonlyArray<AutonomousRepairAttempt>;
  readonly commandResults: ReadonlyArray<CommandResult>;
  readonly failedCommands: ReadonlyArray<string>;
} {
  const commandCache = new Map<string, CommandResult>();
  const attempts = input.attempts.map((attempt) => {
    if (attempt.status !== "repaired") return attempt;
    const topic = input.topicSummaries.find((summary) => summary.id === attempt.topicId);
    if (topic === undefined) {
      return {
        ...attempt,
        status: "failed" as const,
        message: `Completed replay is missing topic metadata for ${attempt.topicId}.`,
      };
    }
    const verificationResults = (topic.replayContract?.verification ?? []).map((command) => {
      const cached = commandCache.get(command);
      if (cached !== undefined) return cached;
      const [result] = runReplayContractVerification({
        controlRoot: input.controlRoot,
        nightlyPath: input.nightlyPath,
        topic: { ...topic, replayContract: { ...topic.replayContract!, verification: [command] } },
      });
      commandCache.set(command, result!);
      return result!;
    });
    const passed =
      verificationResults.length > 0 &&
      verificationResults.every((result) => result.exitCode === 0);
    return {
      ...attempt,
      status: passed ? ("repaired" as const) : ("failed" as const),
      verificationResults,
      message: passed
        ? "Repair replayed from a clean base and every Replay Contract verification command passed on the completed stack."
        : `Completed-stack repair verification failed: ${
            verificationResults
              .filter((result) => result.exitCode !== 0)
              .map((result) => result.command)
              .join(", ") || "no verification commands were declared"
          }`,
    };
  });
  return {
    attempts,
    commandResults: [...commandCache.values()],
    failedCommands: attempts.flatMap((attempt) =>
      attempt.status === "failed"
        ? (attempt.verificationResults ?? [])
            .filter((result) => result.exitCode !== 0)
            .map((result) => result.command)
        : [],
    ),
  };
}

function maybeContinueResolvedCherryPick(
  nightlyPath: string,
  commandResults: Array<CommandResult>,
): void {
  if (conflictFiles(nightlyPath).length > 0 || activeCherryPick(nightlyPath) === undefined) {
    return;
  }
  const continueResult = runCommand("git", ["cherry-pick", "--continue"], nightlyPath, {
    allowFailure: true,
    timeoutMs: 240_000,
  });
  commandResults.push(continueResult);
  if (continueResult.exitCode === 0) return;
  const unstaged = runCommand("git", ["diff", "--quiet"], nightlyPath, { allowFailure: true });
  const staged = runCommand("git", ["diff", "--cached", "--quiet"], nightlyPath, {
    allowFailure: true,
  });
  commandResults.push(unstaged, staged);
  if (
    shouldSkipEmptyResolvedCherryPick({
      continueExitCode: continueResult.exitCode,
      activeCherryPick: activeCherryPick(nightlyPath) !== undefined,
      unresolvedFiles: conflictFiles(nightlyPath).length,
      unstagedQuiet: unstaged.exitCode === 0,
      stagedQuiet: staged.exitCode === 0,
    })
  ) {
    commandResults.push(
      runCommand("git", ["cherry-pick", "--skip"], nightlyPath, {
        allowFailure: true,
        timeoutMs: 240_000,
      }),
    );
  }
}

function stageDeclaredRepairPaths(input: {
  readonly controlRoot: string;
  readonly nightlyPath: string;
  readonly originalConflictFiles: ReadonlyArray<string>;
  readonly repairPaths: ReadonlyArray<string>;
  readonly workerResult: AutonomousRepairWorkerResult;
  readonly commandResults: Array<CommandResult>;
}): { readonly ok: boolean; readonly message?: string } {
  const paths = [...new Set([...input.originalConflictFiles, ...input.workerResult.changedFiles])];
  const unsafePath = paths.find((path) => !isSafeAutonomousRepairPath(path));
  if (unsafePath !== undefined) {
    return { ok: false, message: `Worker reported unsafe changed path: ${unsafePath}` };
  }
  const outOfScopePaths = outOfScopeAutonomousRepairPaths(paths, input.repairPaths);
  if (outOfScopePaths.length > 0) {
    return {
      ok: false,
      message: `Repair changed paths outside the topic contract: ${outOfScopePaths.join(", ")}`,
    };
  }
  const unstagedResult = runCommand("git", ["diff", "--name-only", "-z"], input.nightlyPath, {
    allowFailure: true,
  });
  const untrackedResult = runCommand(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    input.nightlyPath,
    { allowFailure: true },
  );
  input.commandResults.push(unstagedResult, untrackedResult);
  if (unstagedResult.exitCode !== 0 || untrackedResult.exitCode !== 0) {
    return { ok: false, message: "Could not audit autonomous repair paths before staging." };
  }
  const currentPaths = `${unstagedResult.stdout}${untrackedResult.stdout}`
    .split("\0")
    .filter((path) => path.length > 0);
  const unexpectedPaths = unexpectedAutonomousRepairPaths(currentPaths, paths);
  if (unexpectedPaths.length > 0) {
    return {
      ok: false,
      message: `Repair changed undeclared paths: ${unexpectedPaths.join(", ")}`,
    };
  }
  const markerPath = paths.find((path) => {
    const absolutePath = NodePath.join(input.nightlyPath, path);
    if (!NodeFS.existsSync(absolutePath) || !NodeFS.statSync(absolutePath).isFile()) return false;
    return /^(?:<{7}|={7}|>{7})(?: |$)/mu.test(NodeFS.readFileSync(absolutePath, "utf8"));
  });
  if (markerPath !== undefined) {
    return { ok: false, message: `Conflict markers remain in ${markerPath}.` };
  }
  const formatPaths = existingAutonomousRepairFiles(input.nightlyPath, paths);
  if (formatPaths.length > 0) {
    const formatter = [
      NodePath.join(input.nightlyPath, "node_modules/.bin/vp"),
      NodePath.join(input.controlRoot, "node_modules/.bin/vp"),
    ].find((candidate) => NodeFS.existsSync(candidate));
    if (formatter === undefined) {
      return { ok: false, message: "Could not find vp to format autonomous repair paths." };
    }
    const formatResult = runCommand(formatter, ["fmt", ...formatPaths], input.nightlyPath, {
      allowFailure: true,
      timeoutMs: 240_000,
    });
    input.commandResults.push(formatResult);
    if (formatResult.exitCode !== 0) {
      return {
        ok: false,
        message:
          formatResult.stderr || formatResult.stdout || "Failed to format autonomous repair paths.",
      };
    }
    const formattedPaths = runCommand("git", ["diff", "--name-only", "-z"], input.nightlyPath, {
      allowFailure: true,
    });
    input.commandResults.push(formattedPaths);
    if (formattedPaths.exitCode !== 0) {
      return { ok: false, message: "Could not audit autonomous repair paths after formatting." };
    }
    const unexpectedFormattedPaths = unexpectedAutonomousRepairPaths(
      formattedPaths.stdout.split("\0").filter((path) => path.length > 0),
      paths,
    );
    if (unexpectedFormattedPaths.length > 0) {
      return {
        ok: false,
        message: `Repair formatter changed undeclared paths: ${unexpectedFormattedPaths.join(", ")}`,
      };
    }
  }
  const stageResult = runCommand("git", ["add", "-A", "--", ...paths], input.nightlyPath, {
    allowFailure: true,
    timeoutMs: 240_000,
  });
  input.commandResults.push(stageResult);
  if (stageResult.exitCode !== 0) {
    return {
      ok: false,
      message: stageResult.stderr || stageResult.stdout || "Failed to stage repair paths.",
    };
  }
  const rerereResult = runCommand("git", ["rerere"], input.nightlyPath, {
    allowFailure: true,
    timeoutMs: 240_000,
  });
  input.commandResults.push(rerereResult);
  return rerereResult.exitCode === 0
    ? { ok: true }
    : {
        ok: false,
        message:
          rerereResult.stderr || rerereResult.stdout || "Failed to record the repair in rerere.",
      };
}

function runAutonomousRepairAttempt(input: {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly artifactDir: string;
  readonly controlRoot: string;
  readonly nightlyPath: string;
  readonly topicSummaries: ReadonlyArray<TopicSummary>;
  readonly repairCommand?: string;
}): {
  readonly attempt: AutonomousRepairAttempt;
  readonly commandResults: ReadonlyArray<CommandResult>;
} {
  const commandResults: Array<CommandResult> = [];
  const originalConflictFiles = conflictFiles(input.nightlyPath);
  const conflictIndex = gitOutput(input.nightlyPath, ["ls-files", "-u"]) ?? "";
  const conflictPromptPath = NodePath.join(input.artifactDir, "hermes-conflict-prompt.md");
  const conflictPacketPath = NodePath.join(input.artifactDir, "conflict-packet.md");
  const conflictRecord = readFirstConflictRecord(input.artifactDir);
  const topic = input.topicSummaries.find((summary) => summary.id === conflictRecord?.id);
  const promptPath = NodePath.join(
    input.artifactDir,
    `autonomous-repair-prompt-attempt-${input.attempt}.md`,
  );
  const resultPath = NodePath.join(
    input.artifactDir,
    `autonomous-repair-result-attempt-${input.attempt}.json`,
  );
  const finalMessagePath = NodePath.join(
    input.artifactDir,
    `autonomous-repair-final-message-attempt-${input.attempt}.json`,
  );
  const resultSchemaPath = NodePath.join(
    input.artifactDir,
    `autonomous-repair-result-schema-attempt-${input.attempt}.json`,
  );
  const commandLogPath = NodePath.join(
    input.artifactDir,
    `autonomous-repair-command-attempt-${input.attempt}.log`,
  );
  const linearEvidencePath = NodePath.join(
    input.artifactDir,
    `linear-repair-evidence-attempt-${input.attempt}.md`,
  );

  if (
    conflictRecord === undefined ||
    !NodeFS.existsSync(conflictPromptPath) ||
    !NodeFS.existsSync(conflictPacketPath)
  ) {
    const message = "No conflict packet was available for autonomous repair.";
    writeText(
      resultPath,
      `${JSON.stringify({ decision: "incomplete", summary: message, changedFiles: [], testsRun: [], risks: [], rerereReady: false }, undefined, 2)}\n`,
    );
    return {
      commandResults,
      attempt: {
        attempt: input.attempt,
        topicId: conflictRecord?.id ?? "unknown",
        commit: conflictRecord?.commit ?? "unknown",
        status: "skipped",
        promptPath,
        resultPath,
        message,
      },
    };
  }

  const cherryPickHeadBeforeRepair = activeCherryPick(input.nightlyPath);
  if (cherryPickHeadBeforeRepair !== conflictRecord.commit) {
    const message = `Active cherry-pick ${cherryPickHeadBeforeRepair ?? "none"} does not match conflict topic commit ${conflictRecord.commit}.`;
    writeText(
      resultPath,
      `${JSON.stringify({ decision: "incomplete", summary: message, changedFiles: [], testsRun: [], risks: ["stale conflict evidence"], rerereReady: false }, undefined, 2)}\n`,
    );
    return {
      commandResults,
      attempt: {
        attempt: input.attempt,
        topicId: conflictRecord.id,
        commit: conflictRecord.commit,
        status: "skipped",
        promptPath,
        resultPath,
        message,
      },
    };
  }

  if (!isAutoRepairEligible(topic)) {
    const message = "Topic replay contract is missing or marked manual-decision.";
    writeText(
      resultPath,
      `${JSON.stringify({ decision: "fundamental-conflict", summary: message, changedFiles: [], testsRun: [], risks: ["manual decision required"], rerereReady: false }, undefined, 2)}\n`,
    );
    return {
      commandResults,
      attempt: {
        attempt: input.attempt,
        topicId: conflictRecord.id,
        commit: conflictRecord.commit,
        status: "skipped",
        ...(topic?.replayContract?.autonomy === undefined
          ? {}
          : { autonomy: topic.replayContract.autonomy }),
        ...(topic?.replayContract?.risk === undefined ? {} : { risk: topic.replayContract.risk }),
        promptPath,
        resultPath,
        message,
      },
    };
  }

  const prompt = formatAutonomousRepairPrompt({
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    conflictPromptPath,
    conflictPacketPath,
    nightlyPath: input.nightlyPath,
    controlRoot: input.controlRoot,
    ...(topic === undefined ? {} : { topic }),
    resultPath,
    ...(process.env.T3CODE_NIGHTLY_LINEAR_ISSUE === undefined
      ? {}
      : { linearIssue: process.env.T3CODE_NIGHTLY_LINEAR_ISSUE }),
    linearEvidencePath,
    conflictFiles: originalConflictFiles,
  });
  writeText(
    linearEvidencePath,
    [
      "# Nightly Repair Evidence",
      "",
      `- Linear issue: \`${process.env.T3CODE_NIGHTLY_LINEAR_ISSUE ?? "not configured"}\``,
      `- Host: \`${NodeOS.hostname()}\``,
      `- Worktree: \`${input.nightlyPath}\``,
      `- Topic: \`${conflictRecord.id}\``,
      `- Commit: \`${conflictRecord.commit}\``,
      `- Attempt: \`${input.attempt}\` of \`${input.maxAttempts}\``,
      "- Status: `running`",
      `- Prompt: \`${promptPath}\``,
      `- Result: \`${resultPath}\``,
      "",
    ].join("\n"),
  );
  writeText(promptPath, prompt);
  writeText(resultSchemaPath, `${JSON.stringify(autonomousRepairOutputSchema(), undefined, 2)}\n`);
  const repairResult = runRepairCommand({
    prompt,
    promptPath,
    resultPath,
    finalMessagePath,
    resultSchemaPath,
    ...(input.repairCommand === undefined ? {} : { repairCommand: input.repairCommand }),
    controlRoot: input.controlRoot,
    nightlyPath: input.nightlyPath,
    artifactDir: input.artifactDir,
  });
  commandResults.push(repairResult);
  writeText(
    commandLogPath,
    [
      `Exit: ${repairResult.exitCode}`,
      "",
      "Stdout:",
      repairResult.stdout.trim() || "(empty)",
      "",
      "Stderr:",
      repairResult.stderr.trim() || "(empty)",
      "",
    ].join("\n"),
  );
  const workerResult = NodeFS.existsSync(resultPath)
    ? parseAutonomousRepairWorkerResult(NodeFS.readFileSync(resultPath, "utf8"))
    : NodeFS.existsSync(finalMessagePath)
      ? parseAutonomousRepairWorkerResult(NodeFS.readFileSync(finalMessagePath, "utf8"))
      : undefined;
  const stagedRepair =
    workerResult?.decision === "repaired" && workerResult.rerereReady
      ? stageDeclaredRepairPaths({
          controlRoot: input.controlRoot,
          nightlyPath: input.nightlyPath,
          originalConflictFiles,
          repairPaths: topic?.repairPaths ?? [],
          workerResult,
          commandResults,
        })
      : { ok: false };
  if (stagedRepair.ok) {
    maybeContinueResolvedCherryPick(input.nightlyPath, commandResults);
  }

  const unresolvedFiles = conflictFiles(input.nightlyPath);
  const cherryPickHead = activeCherryPick(input.nightlyPath);
  const dirty = isWorktreeDirty(input.nightlyPath);
  const cleanCompletedRepair =
    workerResult?.decision === "repaired" &&
    workerResult.rerereReady &&
    stagedRepair.ok &&
    unresolvedFiles.length === 0 &&
    cherryPickHead === undefined &&
    !dirty;
  let memoryPath: string | undefined;
  let memoryError: string | undefined;
  if (cleanCompletedRepair && workerResult !== undefined) {
    try {
      if (conflictIndex.trim().length === 0) {
        throw new Error("The conflict index was empty before repair.");
      }
      memoryPath = writeRecordedRepairMemory({
        repoFamilyRoot: resolveRepoFamilyRoot(input.controlRoot),
        nightlyPath: input.nightlyPath,
        topicId: conflictRecord.id,
        commit: conflictRecord.commit,
        indexOutput: conflictIndex,
        paths: [...new Set([...originalConflictFiles, ...workerResult.changedFiles])],
        repairPaths: topic?.repairPaths ?? [],
        summary: workerResult.summary,
      });
    } catch (error) {
      memoryError = error instanceof Error ? error.message : String(error);
    }
  }
  const reproducibleRepair = cleanCompletedRepair && memoryPath !== undefined;
  const status: AutonomousRepairStatus =
    repairResult.exitCode !== 0 || workerResult === undefined
      ? "failed"
      : workerResult.decision === "fundamental-conflict"
        ? workerResult.changedFiles.length === 0
          ? "fundamental-conflict"
          : "failed"
        : workerResult.decision === "incomplete"
          ? "incomplete"
          : reproducibleRepair
            ? "repaired"
            : memoryError === undefined
              ? "incomplete"
              : "failed";
  const message =
    status === "repaired"
      ? "Repair completed and the nightly worktree is clean. The wrapper will replay from scratch, then enforce Replay Contract verification on the completed stack."
      : status === "fundamental-conflict"
        ? (workerResult?.summary ?? "Worker classified the conflict as fundamental.")
        : workerResult?.decision === "fundamental-conflict" && workerResult.changedFiles.length > 0
          ? "Worker classified the conflict as fundamental after reporting file edits; refusing the decision as unsafe."
          : workerResult === undefined
            ? "Repair worker did not return a valid structured decision."
            : stagedRepair.message !== undefined
              ? stagedRepair.message
              : memoryError !== undefined
                ? `Repair completed but durable conflict memory could not be written: ${memoryError}`
                : `Repair did not leave a clean cherry-pick ready for completed-stack verification. unresolved=${unresolvedFiles.length}, cherryPick=${cherryPickHead === undefined ? "none" : cherryPickHead.slice(0, 10)}, dirty=${dirty}`;

  writeText(
    linearEvidencePath,
    [
      "# Nightly Repair Evidence",
      "",
      `- Linear issue: \`${process.env.T3CODE_NIGHTLY_LINEAR_ISSUE ?? "not configured"}\``,
      `- Host: \`${NodeOS.hostname()}\``,
      `- Worktree: \`${input.nightlyPath}\``,
      `- Topic: \`${conflictRecord.id}\``,
      `- Commit: \`${conflictRecord.commit}\``,
      `- Attempt: \`${input.attempt}\` of \`${input.maxAttempts}\``,
      `- Status: \`${status}\``,
      `- Summary: ${workerResult?.summary ?? message}`,
      `- Tests: ${workerResult?.testsRun.join(", ") || "none reported"}`,
      `- Risks: ${workerResult?.risks.join(", ") || "none reported"}`,
      `- Prompt: \`${promptPath}\``,
      `- Result: \`${resultPath}\``,
      `- Command log: \`${commandLogPath}\``,
      ...(memoryPath === undefined ? [] : [`- Repair memory: \`${memoryPath}\``]),
      "",
    ].join("\n"),
  );

  return {
    commandResults,
    attempt: {
      attempt: input.attempt,
      topicId: conflictRecord.id,
      commit: conflictRecord.commit,
      status,
      ...(workerResult === undefined ? {} : { decision: workerResult.decision }),
      autonomy: topic!.replayContract!.autonomy,
      risk: topic!.replayContract!.risk,
      promptPath,
      resultPath,
      commandLogPath,
      ...(memoryPath === undefined ? {} : { memoryPath }),
      message,
    },
  };
}

function copyPausedConflictArtifacts(sourceDir: string, targetDir: string): void {
  NodeFS.mkdirSync(targetDir, { recursive: true });
  for (const fileName of [
    "conflict-packet.md",
    "hermes-conflict-prompt.md",
    "topics.json",
    "plan.json",
    "topic-audit.md",
    "failure.txt",
  ]) {
    const sourcePath = NodePath.join(sourceDir, fileName);
    if (NodeFS.existsSync(sourcePath)) {
      NodeFS.copyFileSync(sourcePath, NodePath.join(targetDir, fileName));
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(helpText());
    return;
  }

  const startedAt = new Date().toISOString();
  const controlRoot = resolveControlRoot(args.rootDir);
  const repoFamilyRoot = resolveRepoFamilyRoot(controlRoot);
  const originalPath = NodePath.join(repoFamilyRoot, ".worktrees/original");
  const nightlyPath = NodePath.join(repoFamilyRoot, ".worktrees/nightly");
  const fallbackArtifactDir = NodePath.join(
    repoFamilyRoot,
    ".t3code-nightly-agent-runs",
    nowRunId(new Date()),
  );
  const commandResults: Array<CommandResult> = [];
  let status: NightlyAgentStatus = "success";
  let decisionReason = "not-started";
  let errorMessage: string | undefined;
  let upstreamBefore: string | undefined;
  let upstreamAfter: string | undefined;
  let artifactDir = fallbackArtifactDir;
  let linearConfig: LinearNightlyConfig | undefined;
  let linearRun: LinearNightlyRun | undefined;
  const autoRepairAttempts: Array<AutonomousRepairAttempt> = [];

  try {
    upstreamBefore = gitOutput(controlRoot, ["rev-parse", "upstream/main"]);
    const fetchResult = runCommand("git", ["fetch", "upstream", "--prune"], controlRoot, {
      allowFailure: true,
    });
    commandResults.push(fetchResult);
    if (fetchResult.exitCode !== 0) {
      throw new Error(fetchResult.stderr || fetchResult.stdout || "git fetch upstream failed");
    }
    upstreamAfter = gitOutput(controlRoot, ["rev-parse", "upstream/main"]);

    const originalHead = gitOutput(originalPath, ["rev-parse", "HEAD"]);
    const nightlyDirty = gitDirty(nightlyPath);
    const pausedCherryPickHead = activeCherryPick(nightlyPath);
    const nightlyInterrupted = nightlyDirty || pausedCherryPickHead !== undefined;
    const previousArtifactDir = latestRunDir(nightlyPath);
    const previousReport =
      previousArtifactDir === undefined
        ? undefined
        : readJsonFile<Partial<NightlyAgentReportInput>>(
            NodePath.join(previousArtifactDir, "nightly-agent-report.json"),
          );
    const pausedArtifactDir = nightlyInterrupted ? previousArtifactDir : undefined;
    const pausedTopicRecords =
      pausedArtifactDir === undefined
        ? []
        : (readJsonFile<ReadonlyArray<TopicRecord>>(
            NodePath.join(pausedArtifactDir, "topics.json"),
          ) ?? []);
    const pausedTopicSummaries = buildTopicSummaries(controlRoot, pausedTopicRecords);
    const pausedConflictRecord =
      pausedArtifactDir === undefined ? undefined : readFirstConflictRecord(pausedArtifactDir);
    const pausedTopic = pausedTopicSummaries.find(
      (summary) => summary.id === pausedConflictRecord?.id,
    );
    const resumePausedReplay = shouldResumePausedNightlyReplay({
      nightlyDirty: nightlyInterrupted,
      activeCherryPick: pausedCherryPickHead !== undefined,
      hasConflictArtifacts:
        pausedArtifactDir !== undefined &&
        NodeFS.existsSync(NodePath.join(pausedArtifactDir, "conflict-packet.md")) &&
        NodeFS.existsSync(NodePath.join(pausedArtifactDir, "hermes-conflict-prompt.md")),
      autoRepair: args.autoRepair,
      maxRepairAttempts: args.maxRepairAttempts,
      cherryPickMatchesTopic:
        pausedCherryPickHead !== undefined && pausedCherryPickHead === pausedConflictRecord?.commit,
      ...(pausedTopic?.replayContract?.autonomy === undefined
        ? {}
        : { topicAutonomy: pausedTopic.replayContract.autonomy }),
    });
    const decision: NightlyReplayDecision = resumePausedReplay
      ? { apply: true, reason: "resume-paused-conflict" }
      : decideNightlyReplay({
          force: args.force,
          ...(upstreamBefore === undefined ? {} : { upstreamBefore }),
          ...(upstreamAfter === undefined ? {} : { upstreamAfter }),
          originalExists: NodeFS.existsSync(originalPath),
          ...(originalHead === undefined ? {} : { originalHead }),
          nightlyExists: NodeFS.existsSync(nightlyPath),
          nightlyDirty: nightlyInterrupted,
          ...(previousReport?.status === undefined
            ? {}
            : { previousRunStatus: previousReport.status }),
          ...(previousReport?.upstreamAfter === undefined
            ? {}
            : { previousRunUpstreamAfter: previousReport.upstreamAfter }),
        });
    decisionReason = decision.reason;

    if (args.linearNotify && (decision.apply || decision.blocker !== undefined)) {
      linearConfig = readLinearNightlyConfig();
      const previousLinearRun =
        previousReport?.status === "failed" &&
        previousReport.upstreamAfter === upstreamAfter &&
        previousArtifactDir !== undefined
          ? readJsonFile<LinearNightlyRun>(NodePath.join(previousArtifactDir, "linear-run.json"))
          : undefined;
      linearRun =
        previousLinearRun ??
        (await createLinearNightlyRun(linearConfig, {
          startedAt,
          decisionReason,
          ...(upstreamBefore === undefined ? {} : { upstreamBefore }),
          ...(upstreamAfter === undefined ? {} : { upstreamAfter }),
          upstreamCommits: gitLogRange(controlRoot, upstreamBefore, upstreamAfter),
          topicSummaries: buildTopicSummaries(controlRoot, []),
          controlRoot,
          nightlyPath,
        }));
      writeLinearNightlyRunArtifact(fallbackArtifactDir, linearRun);
    }

    if (decision.blocker !== undefined) {
      throw new Error(decision.blocker);
    }

    if (!decision.apply) {
      status = "skipped";
    } else {
      let applySucceeded = false;
      let lastApplyError = "nightly replay failed";

      if (resumePausedReplay && pausedArtifactDir !== undefined) {
        copyPausedConflictArtifacts(pausedArtifactDir, fallbackArtifactDir);
        artifactDir = fallbackArtifactDir;
        const repair = runAutonomousRepairAttempt({
          attempt: autoRepairAttempts.length + 1,
          maxAttempts: args.maxRepairAttempts,
          artifactDir,
          controlRoot,
          nightlyPath,
          topicSummaries: pausedTopicSummaries,
          ...(args.repairCommand === undefined ? {} : { repairCommand: args.repairCommand }),
        });
        autoRepairAttempts.push(repair.attempt);
        commandResults.push(...repair.commandResults);
        if (repair.attempt.status !== "repaired") {
          throw new Error(
            `Paused nightly conflict repair ${repair.attempt.status}: ${repair.attempt.message}`,
          );
        }
      }

      while (true) {
        const latestBeforeApply = latestRunDir(nightlyPath);
        const applyResult = runCommand(
          "corepack",
          ["pnpm", "run", "topic-stack:nightly", "--", "--apply", "--root", controlRoot],
          controlRoot,
          { allowFailure: true },
        );
        commandResults.push(applyResult);
        const latest = latestRunDir(nightlyPath);
        if (latest !== undefined && latest !== latestBeforeApply) artifactDir = latest;

        if (applyResult.exitCode === 0) {
          applySucceeded = true;
          break;
        }

        lastApplyError = applyResult.stderr || applyResult.stdout || "nightly replay failed";
        if (!args.autoRepair) {
          break;
        }

        const topicSummaries = buildTopicSummaries(
          controlRoot,
          readJsonFile<ReadonlyArray<TopicRecord>>(NodePath.join(artifactDir, "topics.json")) ?? [],
        );
        const conflictRecord = readFirstConflictRecord(artifactDir);
        const conflictTopic = topicSummaries.find((summary) => summary.id === conflictRecord?.id);
        const remainingRepairAttempts = remainingAutonomousRepairAttempts(
          autoRepairAttempts,
          conflictRecord?.commit,
          args.maxRepairAttempts,
        );
        const repairableConflict = shouldResumePausedNightlyReplay({
          nightlyDirty: gitDirty(nightlyPath),
          activeCherryPick: activeCherryPick(nightlyPath) !== undefined,
          hasConflictArtifacts:
            NodeFS.existsSync(NodePath.join(artifactDir, "conflict-packet.md")) &&
            NodeFS.existsSync(NodePath.join(artifactDir, "hermes-conflict-prompt.md")),
          autoRepair: args.autoRepair,
          maxRepairAttempts: remainingRepairAttempts,
          cherryPickMatchesTopic:
            activeCherryPick(nightlyPath) !== undefined &&
            activeCherryPick(nightlyPath) === conflictRecord?.commit,
          ...(conflictTopic?.replayContract?.autonomy === undefined
            ? {}
            : { topicAutonomy: conflictTopic.replayContract.autonomy }),
        });
        if (!repairableConflict) {
          break;
        }

        const repair = runAutonomousRepairAttempt({
          attempt: args.maxRepairAttempts - remainingRepairAttempts + 1,
          maxAttempts: args.maxRepairAttempts,
          artifactDir,
          controlRoot,
          nightlyPath,
          topicSummaries,
          ...(args.repairCommand === undefined ? {} : { repairCommand: args.repairCommand }),
        });
        autoRepairAttempts.push(repair.attempt);
        commandResults.push(...repair.commandResults);
        if (repair.attempt.status !== "repaired") {
          lastApplyError = `${lastApplyError}\nAutonomous repair ${repair.attempt.status}: ${repair.attempt.message}`;
          break;
        }
      }

      if (!applySucceeded) {
        throw new Error(lastApplyError);
      }

      if (autoRepairAttempts.some((attempt) => attempt.status === "repaired")) {
        const completedTopicRecords =
          readJsonFile<ReadonlyArray<TopicRecord>>(NodePath.join(artifactDir, "topics.json")) ?? [];
        const completedRepairVerification = verifyCompletedReplayRepairs({
          attempts: autoRepairAttempts,
          controlRoot,
          nightlyPath,
          topicSummaries: buildTopicSummaries(controlRoot, completedTopicRecords),
        });
        autoRepairAttempts.splice(
          0,
          autoRepairAttempts.length,
          ...completedRepairVerification.attempts,
        );
        commandResults.push(...completedRepairVerification.commandResults);
        const failedRepairs = autoRepairAttempts.filter((attempt) => attempt.status === "failed");
        if (failedRepairs.length > 0) {
          throw new Error(
            `Completed-stack autonomous repair verification failed: ${failedRepairs
              .map((attempt) => `${attempt.topicId}: ${attempt.message}`)
              .join("; ")}`,
          );
        }
      }

      if (args.publicVerify) {
        const publicVerifyResult = runCommand("vp", ["run", "verify:nightly-public"], nightlyPath, {
          allowFailure: true,
        });
        commandResults.push(publicVerifyResult);
        if (publicVerifyResult.exitCode !== 0) {
          throw new Error(
            publicVerifyResult.stderr ||
              publicVerifyResult.stdout ||
              "nightly public verifier failed",
          );
        }
      }
    }
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const topicRecords =
    readJsonFile<ReadonlyArray<TopicRecord>>(NodePath.join(artifactDir, "topics.json")) ?? [];
  const reportPath = NodePath.join(artifactDir, "nightly-agent-report.md");
  const linearSummaryPath = NodePath.join(artifactDir, "linear-summary.md");
  const topicCatalogPath = NodePath.join(artifactDir, "topic-catalog.md");
  let conflictBriefPath: string | undefined;
  let conflictBriefError: string | undefined;

  const buildReportInput = (): NightlyAgentReportInput => {
    const nightlyHead = gitOutput(nightlyPath, ["rev-parse", "HEAD"]);
    return {
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      controlRoot,
      repoFamilyRoot,
      originalPath,
      nightlyPath,
      ...(nightlyHead === undefined ? {} : { nightlyHead }),
      artifactDir,
      reportPath,
      topicCatalogPath,
      decisionReason,
      ...(upstreamBefore === undefined ? {} : { upstreamBefore }),
      ...(upstreamAfter === undefined ? {} : { upstreamAfter }),
      upstreamCommits: gitLogRange(controlRoot, upstreamBefore, upstreamAfter),
      topicSummaries: buildTopicSummaries(controlRoot, topicRecords),
      topicRecords,
      commandResults,
      conflictFiles: conflictFiles(nightlyPath),
      conflictArtifacts: collectConflictArtifacts(artifactDir),
      ...(conflictBriefPath === undefined ? {} : { conflictBriefPath }),
      ...(conflictBriefError === undefined ? {} : { conflictBriefError }),
      autoRepairAttempts,
      proofArtifacts: collectProofArtifacts(nightlyPath, startedAt),
      ...(errorMessage === undefined ? {} : { errorMessage }),
    };
  };

  let reportInput = buildReportInput();
  writeText(reportPath, formatNightlyAgentMarkdown(reportInput));
  writeText(topicCatalogPath, formatTopicCatalog(reportInput));
  writeText(linearSummaryPath, formatLinearNightlyFinalComment(reportInput));

  if (status === "failed") {
    const conflictBrief = generateLinearConflictBrief({
      artifactDir,
      reportPath,
      topicCatalogPath,
      cwd: controlRoot,
    });
    commandResults.push(...conflictBrief.commandResults);
    conflictBriefPath = conflictBrief.conflictBriefPath;
    conflictBriefError = conflictBrief.conflictBriefError;
    reportInput = buildReportInput();
    writeText(reportPath, formatNightlyAgentMarkdown(reportInput));
    writeText(topicCatalogPath, formatTopicCatalog(reportInput));
    writeText(linearSummaryPath, formatLinearNightlyFinalComment(reportInput));
  }

  if (linearConfig !== undefined && linearRun !== undefined) {
    writeLinearNightlyRunArtifact(artifactDir, linearRun);
    try {
      await finalizeLinearNightlyRun(linearConfig, linearRun, buildReportInput());
    } catch (error) {
      status = "failed";
      const linearError = error instanceof Error ? error.message : String(error);
      errorMessage = [errorMessage, `Linear finalization failed: ${linearError}`]
        .filter((part): part is string => part !== undefined)
        .join("\n");
      writeText(NodePath.join(artifactDir, "linear-delivery-error.txt"), `${linearError}\n`);
    }
  }

  reportInput = buildReportInput();
  writeText(reportPath, formatNightlyAgentMarkdown(reportInput));
  writeText(
    NodePath.join(artifactDir, "nightly-agent-report.json"),
    `${JSON.stringify(reportInput, null, 2)}\n`,
  );
  writeText(topicCatalogPath, formatTopicCatalog(reportInput));
  writeText(linearSummaryPath, formatLinearNightlyFinalComment(reportInput));
  process.stdout.write(`${formatNightlyAgentMarkdown(reportInput)}\n`);
  if (status === "failed") {
    process.exitCode = 1;
  }
}

export async function runNightlyUpstreamAgentCli(): Promise<void> {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
