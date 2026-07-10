// @effect-diagnostics nodeBuiltinImport:off - Tests inspect Linear GraphQL request boundaries.
import { describe, expect, it } from "vite-plus/test";

import {
  createLinearNightlyRun,
  finalizeLinearNightlyRun,
  formatLinearNightlyFinalComment,
  formatLinearNightlyRunDescription,
  readLinearNightlyConfig,
  type LinearFetch,
  type LinearNightlyConfig,
} from "./linear-nightly-control.ts";
import type { NightlyAgentReportInput, TopicSummary } from "./nightly-upstream-agent.ts";

const config: LinearNightlyConfig = {
  apiKey: "secret-linear-key",
  apiUrl: "https://api.linear.test/graphql",
  teamId: "team-id",
  projectId: "project-id",
  parentIssueId: "parent-id",
  inProgressStateId: "in-progress-id",
  reviewStateId: "review-id",
  todoStateId: "todo-id",
};

const topics: ReadonlyArray<TopicSummary> = [
  {
    id: "provider-settings",
    pluginPath: "local-plugins/provider-settings",
    title: "Provider usage controls",
    subject: "feat(provider-settings): add usage controls",
    commits: ["abc123"],
    verification: ["vp check"],
    checklist: {},
    replayStatuses: ["applied:abc123"],
  },
  {
    id: "composer",
    pluginPath: "local-plugins/composer",
    title: "Composer additions",
    subject: "feat(composer): add mentions",
    commits: ["def456"],
    verification: ["vp run typecheck"],
    checklist: {},
    replayStatuses: ["conflict:def456"],
  },
];

function report(overrides: Partial<NightlyAgentReportInput> = {}): NightlyAgentReportInput {
  return {
    status: "success",
    startedAt: "2026-07-10T01:00:00.000Z",
    finishedAt: "2026-07-10T01:01:00.000Z",
    controlRoot: "/repo",
    repoFamilyRoot: "/repo",
    originalPath: "/repo/.worktrees/original",
    nightlyPath: "/repo/.worktrees/nightly",
    nightlyHead: "c".repeat(40),
    artifactDir: "/repo/run",
    reportPath: "/repo/run/nightly-agent-report.md",
    topicCatalogPath: "/repo/run/topic-catalog.md",
    decisionReason: "upstream-changed",
    upstreamBefore: "a".repeat(40),
    upstreamAfter: "b".repeat(40),
    upstreamCommits: ["bbb 2026-07-10 feat: upstream change"],
    topicSummaries: topics,
    topicRecords: [
      {
        id: "provider-settings",
        subject: "feat(provider-settings): add usage controls",
        commit: "abc123",
        status: "applied",
      },
    ],
    commandResults: [],
    conflictFiles: [],
    conflictArtifacts: [],
    proofArtifacts: ["/repo/run/pass.png"],
    ...overrides,
  };
}

describe("Linear nightly control", () => {
  it("requires the server-owned Linear configuration", () => {
    expect(
      readLinearNightlyConfig({
        LINEAR_API_KEY: "key",
        T3CODE_NIGHTLY_LINEAR_TEAM_ID: "team",
        T3CODE_NIGHTLY_LINEAR_PROJECT_ID: "project",
        T3CODE_NIGHTLY_LINEAR_PARENT_ISSUE_ID: "parent",
        T3CODE_NIGHTLY_LINEAR_IN_PROGRESS_STATE_ID: "progress",
        T3CODE_NIGHTLY_LINEAR_REVIEW_STATE_ID: "review",
        T3CODE_NIGHTLY_LINEAR_TODO_STATE_ID: "todo",
      }),
    ).toMatchObject({
      apiKey: "key",
      teamId: "team",
      projectId: "project",
      parentIssueId: "parent",
    });
    expect(() => readLinearNightlyConfig({})).toThrow("LINEAR_API_KEY");
  });

  it("formats an upstream summary and queued topic checklist", () => {
    const description = formatLinearNightlyRunDescription({
      startedAt: "2026-07-10T01:00:00.000Z",
      decisionReason: "upstream-changed",
      upstreamBefore: "a".repeat(40),
      upstreamAfter: "b".repeat(40),
      upstreamCommits: ["bbb 2026-07-10 feat: upstream change"],
      topicSummaries: topics,
      controlRoot: "/repo",
      nightlyPath: "/repo/.worktrees/nightly",
    });

    expect(description).toContain("Official Changes");
    expect(description).toContain("- [ ] **provider-settings**");
    expect(description).toContain("$premote-nightly");
    expect(description).not.toContain("Telegram");
  });

  it("creates one project issue in progress without exposing the API key", async () => {
    let requestBody = "";
    let authorization = "";
    const fetchImpl: LinearFetch = async (_url, init) => {
      requestBody = String(init?.body ?? "");
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(
        JSON.stringify({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "run-id",
                identifier: "GBT-99",
                title: "Nightly run",
                url: "https://linear.test/GBT-99",
              },
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const run = await createLinearNightlyRun(
      config,
      {
        startedAt: "2026-07-10T01:00:00.000Z",
        decisionReason: "upstream-changed",
        upstreamBefore: "a".repeat(40),
        upstreamAfter: "b".repeat(40),
        upstreamCommits: ["bbb upstream"],
        topicSummaries: topics,
        controlRoot: "/repo",
        nightlyPath: "/repo/.worktrees/nightly",
      },
      fetchImpl,
    );

    expect(run.identifier).toBe("GBT-99");
    expect(authorization).toBe("secret-linear-key");
    expect(requestBody).toContain('"projectId":"project-id"');
    expect(requestBody).toContain('"stateId":"in-progress-id"');
    expect(requestBody).not.toContain("secret-linear-key");
  });

  it("posts proof and moves successful candidates to review", async () => {
    const requestBodies: Array<string> = [];
    const fetchImpl: LinearFetch = async (_url, init) => {
      const body = String(init?.body ?? "");
      requestBodies.push(body);
      const mutation = JSON.parse(body).query as string;
      return new Response(
        JSON.stringify({
          data: mutation.includes("commentCreate")
            ? { commentCreate: { success: true } }
            : { issueUpdate: { success: true } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await finalizeLinearNightlyRun(
      config,
      {
        id: "run-id",
        identifier: "GBT-99",
        title: "Nightly run",
        url: "https://linear.test/GBT-99",
      },
      report(),
      fetchImpl,
    );

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).toContain("Topic Stack Checklist");
    expect(requestBodies[0]).toContain("- [x] **provider-settings**");
    expect(requestBodies[0]).toContain("- [ ] **composer**");
    expect(requestBodies[0]).toContain("Nightly candidate");
    expect(requestBodies[0]).toContain("c".repeat(40));
    expect(requestBodies[1]).toContain('"stateId":"review-id"');
  });

  it("moves fundamental feature conflicts to review with a human decision label", async () => {
    const requestBodies: Array<string> = [];
    const fetchImpl: LinearFetch = async (_url, init) => {
      const body = String(init?.body ?? "");
      requestBodies.push(body);
      const mutation = JSON.parse(body).query as string;
      return new Response(
        JSON.stringify({
          data: mutation.includes("commentCreate")
            ? { commentCreate: { success: true } }
            : { issueUpdate: { success: true } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    await finalizeLinearNightlyRun(
      config,
      {
        id: "run-id",
        identifier: "GBT-99",
        title: "Nightly run",
        url: "https://linear.test/GBT-99",
      },
      report({
        status: "failed",
        autoRepairAttempts: [
          {
            attempt: 1,
            topicId: "composer",
            commit: "def456",
            status: "fundamental-conflict",
            decision: "fundamental-conflict",
            promptPath: "/repo/run/prompt.md",
            resultPath: "/repo/run/result.json",
            message: "Jordan must choose the replacement behavior.",
          },
        ],
      }),
      fetchImpl,
    );

    expect(requestBodies[0]).toContain("Nightly Replay Needs Decision");
    expect(requestBodies[0]).toContain("Awaiting Human Decision");
    expect(requestBodies[1]).toContain('"stateId":"review-id"');
  });

  it("moves ordinary failures back to todo while keeping recommendations readable", () => {
    const comment = formatLinearNightlyFinalComment(
      report({ status: "failed", errorMessage: "Replay failed." }),
    );
    expect(comment).toContain("Nightly Replay Failed");
    expect(comment).toContain("Needs Agent Fixes");
    expect(comment).not.toContain("Telegram");
  });
});
