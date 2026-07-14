import { describe, expect, it } from "vite-plus/test";
import type { OnTheGoSnapshot, OrchestrationThread } from "@t3tools/contracts";

import { buildTheoThreadContext } from "./TheoContext.ts";
import { makeDeterministicOnTheGoHarness } from "./testing.ts";

const thread = (id: string, projectId: string, title: string, text: string) =>
  ({
    id,
    projectId,
    title,
    modelSelection: { instanceId: "codex", model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:01:00.000Z",
    archivedAt: null,
    deletedAt: null,
    messages: [
      {
        messageId: `${id}:message`,
        role: "assistant",
        text,
        attachments: [],
        turnId: null,
        streaming: false,
        createdAt: "2026-07-13T00:00:00.000Z",
        updatedAt: "2026-07-13T00:01:00.000Z",
      },
    ],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  }) as unknown as OrchestrationThread;

describe("Theo production context selection", () => {
  it("OTG-UT-010: starts bounded, fetches relevant T3 threads on demand, and redacts evidence", () => {
    const harness = makeDeterministicOnTheGoHarness();
    const snapshot = harness.runtime.snapshot(harness.scope);
    const focused = thread("focused", "project-a", "Voice work", "Current result");
    const relevant = thread(
      "relevant",
      "project-a",
      "Authentication investigation",
      "password=hunter2 and the auth test passed",
    );
    const unrelated = thread("unrelated", "project-b", "CSS cleanup", "Changed the blue border");
    const withFocus = {
      ...snapshot,
      foundation: {
        ...snapshot.foundation,
        selectedResponseId: "selected",
        responses: [
          {
            responseId: "selected",
            projectId: "project-a",
            chatId: "focused",
            agentId: "focused",
            outcome: "completed",
            safeSummary: "Current result",
            completedAt: "2026-07-13T00:01:00.000Z",
            handledAt: null,
            expiresAt: "2026-08-12T00:01:00.000Z",
          },
        ],
      },
    } as unknown as OnTheGoSnapshot;

    const bounded = buildTheoThreadContext({
      snapshot: withFocus,
      threads: [focused, relevant, unrelated],
      utterance: "Explain this result",
    });
    expect(bounded.sources.map((source) => source.reference)).toEqual(["focused"]);

    const expanded = buildTheoThreadContext({
      snapshot: withFocus,
      threads: [focused, relevant, unrelated],
      utterance: "Fetch the authentication context from the other project chat",
    });
    expect(expanded.sources.map((source) => source.reference)).toEqual(["focused", "relevant"]);
    expect(expanded.text).toContain("password: [redacted]");
    expect(expanded.text).not.toContain("hunter2");
    expect(expanded.text).not.toContain("blue border");
  });
});
