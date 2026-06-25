import { describe, expect, it } from "vite-plus/test";

import { expandChatContextReferences } from "./chatContextReferences";
import type { SidebarThreadSummary, Thread } from "./types";

const environmentId = "env-local" as Thread["environmentId"];
const projectId = "project-1" as Thread["projectId"];
const createdAt = "2026-06-18T00:00:00.000Z";

function makeThread(input: { id: string; title: string; messages: string[] }): Thread {
  return {
    id: input.id as Thread["id"],
    environmentId,
    projectId,
    title: input.title,
    modelSelection: {
      instanceId: "codex:default" as Thread["modelSelection"]["instanceId"],
      model: "gpt-5",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: input.messages.map((text, index) => ({
      id: `${input.id}-msg-${index}` as Thread["messages"][number]["id"],
      role: index % 2 === 0 ? "user" : "assistant",
      text,
      turnId: null,
      createdAt,
      updatedAt: createdAt,
      streaming: false,
    })),
    proposedPlans: [],
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
    deletedAt: null,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    checkpoints: [],
    activities: [],
  };
}

function summarize(thread: Thread): SidebarThreadSummary {
  return {
    id: thread.id,
    environmentId: thread.environmentId,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    session: null,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    archivedAt: null,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

describe("expandChatContextReferences", () => {
  it("expands canonical pasted thread references into transcript context", () => {
    const thread = makeThread({
      id: "thread-past",
      title: "T3Code VPN'd Dev Setup",
      messages: ["what broke?", "the route context did not load"],
    });

    const result = expandChatContextReferences({
      prompt: "now is everything fixed from @thread:env-local:thread-past",
      projectThreads: [summarize(thread)],
      currentThreadId: "thread-current",
      getThread: () => thread,
    });

    expect(result.expandedCount).toBe(1);
    expect(result.prompt).toContain("<chat_context");
    expect(result.prompt).toContain("T3Code VPN'd Dev Setup");
    expect(result.prompt).toContain("the route context did not load");
  });

  it("expands legacy chat slug references copied as plain text", () => {
    const thread = makeThread({
      id: "thread-past",
      title: "t3code vpn'd dev setup",
      messages: ["old requirement", "old status"],
    });

    const result = expandChatContextReferences({
      prompt: "now is everything fixed from chat:t3code-vpn'd-dev-setup",
      projectThreads: [summarize(thread)],
      currentThreadId: "thread-current",
      getThread: () => thread,
    });

    expect(result.expandedCount).toBe(1);
    expect(result.prompt).not.toContain("chat:t3code-vpn'd-dev-setup");
    expect(result.prompt).toContain("old requirement");
    expect(result.prompt).toContain("old status");
  });

  it("leaves unknown chat slugs untouched", () => {
    const result = expandChatContextReferences({
      prompt: "check chat:missing-context",
      projectThreads: [],
      currentThreadId: "thread-current",
      getThread: () => undefined,
    });

    expect(result.expandedCount).toBe(0);
    expect(result.prompt).toBe("check chat:missing-context");
  });
});
