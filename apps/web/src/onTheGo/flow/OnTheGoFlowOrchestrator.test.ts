import { beforeEach, describe, expect, it } from "vitest";

import { FakeSummaryAdapter } from "../adapters/FakeSummaryAdapter";
import { createNotificationsStore } from "../state/notificationsStore";
import { createInMemoryPausedSessionsStore } from "../state/pausedSessionsStore";
import type { Notification } from "../types";
import { FakeVoiceAdapter } from "../voice/FakeVoiceAdapter";
import { createOrchestrator, type OnTheGoFlowOrchestrator } from "./OnTheGoFlowOrchestrator";

function sampleNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    threadId: "thread-123" as Notification["threadId"],
    threadTitle: "Fix mobile checkout",
    status: "awaiting",
    agentLastMessage: "I found the failing checkout test and need approval to update totals.",
    userLastMessage: "Please make the smallest safe fix and keep tests focused.",
    changeSummary: "Checkout total regression",
    branch: "fix/mobile-checkout-total",
    updatedAt: 1_775_555_000_000,
    ...overrides,
  };
}

describe("OnTheGoFlowOrchestrator", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
    });
  });

  it("starts in idle state", () => {
    expect(orchestrator.state.value).toBe("idle");
  });

  it("history starts empty", () => {
    expect(orchestrator.history.value).toEqual([]);
  });

  it("caption starts empty", () => {
    expect(orchestrator.caption.value).toBe("");
  });

  it("enters by summarizing the notification and speaking the summary", async () => {
    summary = new FakeSummaryAdapter({ summary: "Checkout is blocked on a totals mismatch." });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
    });
    const seenStates: string[] = [];
    const unsubscribe = orchestrator.state.subscribe((state) => {
      seenStates.push(state);
    });

    await orchestrator.enter(sampleNotification());

    unsubscribe();
    expect(seenStates).toEqual(["entering", "summarizing", "conversing"]);
    expect(summary.summarizeCalls).toEqual([
      {
        agentMessage: "I found the failing checkout test and need approval to update totals.",
        userMessage: "Please make the smallest safe fix and keep tests focused.",
      },
    ]);
    expect(orchestrator.caption.value).toBe("Checkout is blocked on a totals mismatch.");
    expect(orchestrator.history.value).toEqual([
      {
        role: "assistant",
        text: "Checkout is blocked on a totals mismatch.",
        at: expect.any(Number),
      },
    ]);
    expect(voice.spokenTexts).toEqual(["Checkout is blocked on a totals mismatch."]);
    expect(orchestrator.state.value).toBe("conversing");
  });

  it("rejects enter when the orchestrator is not idle", async () => {
    voice.holdSpeak = true;
    const firstEnter = orchestrator.enter(sampleNotification()).catch(() => undefined);

    await expect(
      orchestrator.enter(
        sampleNotification({ threadId: "thread-456" as Notification["threadId"] }),
      ),
    ).rejects.toThrow(/not in idle/i);

    voice.interrupt();
    await firstEnter;
  });
});
