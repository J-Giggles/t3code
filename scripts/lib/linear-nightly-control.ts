// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Server-owned operations integration with Linear's GraphQL API.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type {
  AutonomousRepairAttempt,
  NightlyAgentReportInput,
  TopicSummary,
} from "./nightly-upstream-agent.ts";

export interface LinearNightlyConfig {
  readonly apiKey: string;
  readonly apiUrl: string;
  readonly teamId: string;
  readonly projectId: string;
  readonly parentIssueId?: string;
  readonly inProgressStateId: string;
  readonly reviewStateId: string;
  readonly todoStateId: string;
}

export interface LinearNightlyRun {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly url: string;
}

export interface CreateLinearNightlyRunInput {
  readonly startedAt: string;
  readonly decisionReason: string;
  readonly upstreamBefore?: string;
  readonly upstreamAfter?: string;
  readonly upstreamCommits: ReadonlyArray<string>;
  readonly topicSummaries: ReadonlyArray<TopicSummary>;
  readonly controlRoot: string;
  readonly nightlyPath: string;
}

export type LinearFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface LinearGraphqlPayload<T> {
  readonly data?: T;
  readonly errors?: ReadonlyArray<{ readonly message?: string }>;
}

interface LinearIssueMutationData {
  readonly issueCreate: {
    readonly success: boolean;
    readonly issue: LinearNightlyRun | null;
  };
}

interface LinearCommentMutationData {
  readonly commentCreate: {
    readonly success: boolean;
  };
}

interface LinearIssueUpdateMutationData {
  readonly issueUpdate: {
    readonly success: boolean;
  };
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when Linear nightly reporting is enabled.`);
  }
  return value;
}

export function readLinearNightlyConfig(env: NodeJS.ProcessEnv = process.env): LinearNightlyConfig {
  const parentIssueId = env.T3CODE_NIGHTLY_LINEAR_PARENT_ISSUE_ID?.trim();
  return {
    apiKey: requiredEnv(env, "LINEAR_API_KEY"),
    apiUrl: env.T3CODE_NIGHTLY_LINEAR_API_URL?.trim() || "https://api.linear.app/graphql",
    teamId: requiredEnv(env, "T3CODE_NIGHTLY_LINEAR_TEAM_ID"),
    projectId: requiredEnv(env, "T3CODE_NIGHTLY_LINEAR_PROJECT_ID"),
    ...(parentIssueId ? { parentIssueId } : {}),
    inProgressStateId: requiredEnv(env, "T3CODE_NIGHTLY_LINEAR_IN_PROGRESS_STATE_ID"),
    reviewStateId: requiredEnv(env, "T3CODE_NIGHTLY_LINEAR_REVIEW_STATE_ID"),
    todoStateId: requiredEnv(env, "T3CODE_NIGHTLY_LINEAR_TODO_STATE_ID"),
  };
}

async function linearGraphql<T>(
  config: LinearNightlyConfig,
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: LinearFetch,
): Promise<T> {
  const response = await fetchImpl(config.apiUrl, {
    method: "POST",
    headers: {
      Authorization: config.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as LinearGraphqlPayload<T>;
  if (!response.ok || payload.data === undefined || (payload.errors?.length ?? 0) > 0) {
    const details =
      payload.errors?.map((error) => error.message ?? "Unknown Linear error").join("; ") ||
      `HTTP ${response.status}`;
    throw new Error(`Linear GraphQL request failed: ${details}`);
  }
  return payload.data;
}

function shortSha(value: string | undefined): string {
  return (value ?? "unknown").slice(0, 10);
}

function runDate(startedAt: string): string {
  return startedAt.slice(0, 10);
}

function topicQueueLines(topicSummaries: ReadonlyArray<TopicSummary>): ReadonlyArray<string> {
  return topicSummaries.map(
    (topic) => `- [ ] **${topic.id}**: ${topic.title} (${topic.commits.length} commit actions)`,
  );
}

export function formatLinearNightlyRunDescription(input: CreateLinearNightlyRunInput): string {
  return [
    "# T3 Code Nightly Replay",
    "",
    "State: Implementation In Progress",
    "Host: giggabit-server",
    `Control checkout: \`${input.controlRoot}\``,
    `Nightly worktree: \`${input.nightlyPath}\``,
    `Decision: \`${input.decisionReason}\``,
    `Upstream: \`${shortSha(input.upstreamBefore)}\` -> \`${shortSha(input.upstreamAfter)}\``,
    "",
    "## Official Changes",
    "",
    ...(input.upstreamCommits.length > 0
      ? input.upstreamCommits.map((commit) => `- ${commit}`)
      : ["- No commit summary was available."]),
    "",
    "## Local Topics Queued",
    "",
    ...topicQueueLines(input.topicSummaries),
    "",
    "## Promotion",
    "",
    "When this issue reaches **In Review** with a successful replay and proof, run `$premote-nightly` to promote `nightly -> staging -> main` across Linux, GitHub, and the Mac launcher checkout.",
    "",
    "Routine conflicts are repaired autonomously from Replay Contracts and exact prior decisions. This issue stops for Jordan only when the local feature itself needs a product, architecture, security, or operator decision.",
  ].join("\n");
}

export async function createLinearNightlyRun(
  config: LinearNightlyConfig,
  input: CreateLinearNightlyRunInput,
  fetchImpl: LinearFetch = fetch,
): Promise<LinearNightlyRun> {
  const title = `T3 Code nightly ${runDate(input.startedAt)}: ${shortSha(input.upstreamBefore)} -> ${shortSha(input.upstreamAfter)}`;
  const data = await linearGraphql<LinearIssueMutationData>(
    config,
    `mutation CreateNightlyRun($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }`,
    {
      input: {
        teamId: config.teamId,
        projectId: config.projectId,
        stateId: config.inProgressStateId,
        ...(config.parentIssueId === undefined ? {} : { parentId: config.parentIssueId }),
        priority: 3,
        title,
        description: formatLinearNightlyRunDescription(input),
      },
    },
    fetchImpl,
  );
  if (!data.issueCreate.success || data.issueCreate.issue === null) {
    throw new Error("Linear issueCreate did not return a nightly run issue.");
  }
  return data.issueCreate.issue;
}

function replaySummary(input: NightlyAgentReportInput): string {
  const counts = new Map<string, number>();
  for (const record of input.topicRecords) {
    counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  }
  return counts.size === 0
    ? "none"
    : [...counts.entries()].map(([status, count]) => `${status}: ${count}`).join(", ");
}

function topicChecklistLine(topic: TopicSummary): string {
  const statuses = topic.replayStatuses;
  const complete =
    statuses.length > 0 &&
    statuses.every(
      (status) =>
        status.startsWith("applied:") ||
        status.startsWith("auto-resolved:") ||
        status.startsWith("empty-skipped:"),
    );
  return `- [${complete ? "x" : " "}] **${topic.id}**: ${
    statuses.length === 0 ? "not run" : statuses.join(", ")
  }`;
}

function repairLines(
  attempts: ReadonlyArray<AutonomousRepairAttempt> | undefined,
): ReadonlyArray<string> {
  if (!attempts || attempts.length === 0) return ["- No autonomous repair worker was needed."];
  return attempts.map(
    (attempt) =>
      `- **${attempt.topicId}**: ${attempt.status}${
        attempt.decision === undefined ? "" : ` (${attempt.decision})`
      } - ${attempt.message}`,
  );
}

function conflictBrief(input: NightlyAgentReportInput): ReadonlyArray<string> {
  if (!input.conflictBriefPath || !NodeFS.existsSync(input.conflictBriefPath)) {
    return input.conflictFiles.length === 0
      ? ["- No human decision is required."]
      : input.conflictFiles.map((file) => `- Unresolved: \`${file}\``);
  }
  return [NodeFS.readFileSync(input.conflictBriefPath, "utf8").trim()];
}

export function formatLinearNightlyFinalComment(input: NightlyAgentReportInput): string {
  const humanReview = needsHumanReview(input);
  const resultLabel =
    input.status === "success" ? "Passed" : humanReview ? "Needs Decision" : "Failed";
  const stateLabel =
    input.status === "success"
      ? "Ready for Verification Review"
      : humanReview
        ? "Awaiting Human Decision"
        : "Needs Agent Fixes";
  return [
    `# Nightly Replay ${resultLabel}`,
    "",
    `State: ${stateLabel}`,
    `Decision: \`${input.decisionReason}\``,
    `Upstream: \`${shortSha(input.upstreamBefore)}\` -> \`${shortSha(input.upstreamAfter)}\``,
    `Nightly candidate: \`${input.nightlyHead ?? "unknown"}\``,
    `Replay: ${replaySummary(input)}`,
    ...(input.errorMessage ? [`Error: ${input.errorMessage}`] : []),
    "",
    "## Topic Stack Checklist",
    "",
    ...input.topicSummaries.map(topicChecklistLine),
    "",
    "## Autonomous Repairs",
    "",
    ...repairLines(input.autoRepairAttempts),
    "",
    "## Proof",
    "",
    "- Successful replay enforces `CI=true pnpm install --frozen-lockfile`, `vp check`, `vp run typecheck`, and `pnpm run topic-plugins:check`.",
    ...(input.proofArtifacts.length > 0
      ? input.proofArtifacts.map((artifact) => `- \`${artifact}\``)
      : [
          "- No headed/public screenshot was produced; the headless replay gates are the available proof.",
        ]),
    `- Full report: \`${input.reportPath}\``,
    `- Topic catalog: \`${input.topicCatalogPath}\``,
    "",
    "## Conflicts Or Decisions",
    "",
    ...conflictBrief(input),
    "",
    ...(input.status === "success"
      ? [
          "## Promotion",
          "",
          "This candidate is ready for the explicit `$premote-nightly` flow. That skill rechecks the evidence before changing staging or main.",
          "",
        ]
      : []),
  ].join("\n");
}

function needsHumanReview(input: NightlyAgentReportInput): boolean {
  return (
    input.autoRepairAttempts?.some((attempt) => attempt.status === "fundamental-conflict") === true
  );
}

export async function finalizeLinearNightlyRun(
  config: LinearNightlyConfig,
  run: LinearNightlyRun,
  report: NightlyAgentReportInput,
  fetchImpl: LinearFetch = fetch,
): Promise<void> {
  const comment = await linearGraphql<LinearCommentMutationData>(
    config,
    `mutation CommentNightlyRun($input: CommentCreateInput!) {
      commentCreate(input: $input) { success }
    }`,
    { input: { issueId: run.id, body: formatLinearNightlyFinalComment(report) } },
    fetchImpl,
  );
  if (!comment.commentCreate.success) {
    throw new Error("Linear commentCreate did not save the nightly report.");
  }

  const stateId =
    report.status === "success" || needsHumanReview(report)
      ? config.reviewStateId
      : config.todoStateId;
  const update = await linearGraphql<LinearIssueUpdateMutationData>(
    config,
    `mutation UpdateNightlyRun($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }`,
    { id: run.id, input: { stateId } },
    fetchImpl,
  );
  if (!update.issueUpdate.success) {
    throw new Error("Linear issueUpdate did not set the nightly run state.");
  }
}

export function writeLinearNightlyRunArtifact(artifactDir: string, run: LinearNightlyRun): string {
  const artifactPath = NodePath.join(artifactDir, "linear-run.json");
  NodeFS.mkdirSync(artifactDir, { recursive: true });
  NodeFS.writeFileSync(artifactPath, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
  return artifactPath;
}
