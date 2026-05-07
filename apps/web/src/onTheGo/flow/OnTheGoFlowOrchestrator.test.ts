import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSummaryAdapter } from "../adapters/FakeSummaryAdapter";
import { createNotificationsStore } from "../state/notificationsStore";
import { createInMemoryPausedSessionsStore } from "../state/pausedSessionsStore";
import type { FlowState, Notification } from "../types";
import { FakeVoiceAdapter } from "../voice/FakeVoiceAdapter";
import {
  createOrchestrator,
  type OnTheGoFlowOrchestrator,
  type OrchestratorDeps,
} from "./OnTheGoFlowOrchestrator";

type CommitPromptMock = ReturnType<typeof vi.fn> & OrchestratorDeps["commitPrompt"];

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

async function flushPromises(iterations = 5): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve();
  }
}

describe("OnTheGoFlowOrchestrator", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let commitPrompt: CommitPromptMock;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    vi.restoreAllMocks();
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter();
    commitPrompt = vi.fn().mockResolvedValue(undefined) as CommitPromptMock;
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
    });
  });

  afterEach(() => {
    voice.interrupt();
    vi.restoreAllMocks();
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
      commitPrompt,
    });
    const seenStates: string[] = [];
    const unsubscribe = orchestrator.state.subscribe((state) => {
      seenStates.push(state);
    });

    const enterPromise = orchestrator.enter(sampleNotification());
    await flushPromises();

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

    voice.interrupt();
    await enterPromise;
  });

  it("keeps listening while conversing and records the user turn plus assistant reply", async () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_000)
      .mockReturnValueOnce(3_000);
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll update the focused test and patch the totals calculation."],
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      silenceTimeoutMs: 750,
    });
    const seenCaptions: string[] = [];
    const unsubscribeCaption = orchestrator.caption.subscribe((caption) => {
      seenCaptions.push(caption);
    });
    voice.queueListen("Please make the focused fix.");

    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    unsubscribeCaption();
    expect(orchestrator.history.value).toEqual([
      {
        role: "assistant",
        text: "Checkout is blocked on a totals mismatch.",
        at: 1_000,
      },
      {
        role: "user",
        text: "Please make the focused fix.",
        at: 2_000,
      },
      {
        role: "assistant",
        text: "I'll update the focused test and patch the totals calculation.",
        at: 3_000,
      },
    ]);
    expect(summary.replyCalls).toEqual([
      {
        history: [
          {
            role: "assistant",
            text: "Checkout is blocked on a totals mismatch.",
            at: 1_000,
          },
          {
            role: "user",
            text: "Please make the focused fix.",
            at: 2_000,
          },
        ],
        userTurn: "Please make the focused fix.",
      },
    ]);
    expect(seenCaptions).toEqual([
      "Checkout is blocked on a totals mismatch.",
      "Please make the focused fix.",
      "I'll update the focused test and patch the totals calculation.",
    ]);
    expect(voice.spokenTexts).toEqual([
      "Checkout is blocked on a totals mismatch.",
      "I'll update the focused test and patch the totals calculation.",
    ]);
    expect(orchestrator.state.value).toBe("conversing");

    voice.interrupt();
    await enterPromise;
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

  it("transitions conversing to composing to countdown to committing to idle", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    const notificationsStore = createNotificationsStore();
    notificationsStore.add(sampleNotification());
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore,
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });
    const states: FlowState[] = [];
    const unsubscribe = orchestrator.state.subscribe((state) => {
      states.push(state);
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    await orchestrator.shipIt();

    unsubscribe();
    expect(states).toEqual(
      expect.arrayContaining(["conversing", "composing", "countdown", "committing", "idle"]),
    );
    expect(orchestrator.state.value).toBe("idle");
    await enterPromise;
  });

  it("calls composePrompt with current history and skill", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });
    const expectedHistory = orchestrator.history.value;

    await orchestrator.shipIt();

    expect(summary.composeCalls).toEqual([{ history: expectedHistory, skill: "skill text" }]);
    await enterPromise;
  });

  it("calls commitPrompt with the threadId and composed prompt", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    await orchestrator.shipIt();

    expect(commitPrompt).toHaveBeenCalledWith(
      "thread-123",
      "Patch the totals calculation and keep tests focused.",
    );
    await enterPromise;
  });

  it("dismisses the notification after a successful commit", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    const notificationsStore = createNotificationsStore();
    notificationsStore.add(sampleNotification());
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore,
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    await orchestrator.shipIt();

    expect(notificationsStore.notifications.value).toEqual([]);
    await enterPromise;
  });

  it("cancelShip during countdown returns to conversing without committing", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 50,
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    const shipPromise = orchestrator.shipIt();
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("countdown");
    });
    orchestrator.cancelShip();
    await shipPromise;

    expect(commitPrompt).not.toHaveBeenCalled();
    expect(orchestrator.state.value).toBe("conversing");

    voice.interrupt();
    await enterPromise;
  });

  it("does not append a stale pending reply after shipIt is cancelled", async () => {
    let resolveReply!: (reply: string) => void;
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    vi.spyOn(summary, "reply").mockImplementation(async (input) => {
      summary.replyCalls.push(input);
      return new Promise<string>((resolve) => {
        resolveReply = resolve;
      });
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 50,
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(summary.replyCalls).toHaveLength(1);
    });
    expect(orchestrator.history.value.map((turn) => turn.text)).toEqual([
      "Checkout is blocked on a totals mismatch.",
      "Please make the focused fix.",
    ]);

    const shipPromise = orchestrator.shipIt();
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("countdown");
    });
    orchestrator.cancelShip();
    await shipPromise;

    resolveReply("stale reply should not append");
    await flushPromises();

    expect(orchestrator.state.value).toBe("conversing");
    expect(orchestrator.history.value.map((turn) => turn.text)).toEqual([
      "Checkout is blocked on a totals mismatch.",
      "Please make the focused fix.",
    ]);
    expect(voice.spokenTexts).not.toContain("stale reply should not append");

    voice.interrupt();
    await enterPromise;
  });

  it("uses an envelope fallback containing the offline marker and transcript when compose fails", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      failOn: "composePrompt",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    await orchestrator.shipIt();

    expect(commitPrompt).toHaveBeenCalledOnce();
    const sentPrompt = commitPrompt.mock.calls[0]?.[1] as string;
    expect(sentPrompt).toContain("On-the-go composer offline");
    expect(sentPrompt).toContain("Please make the focused fix.");
    expect(sentPrompt).toContain("I'll patch the totals calculation.");
    await enterPromise;
  });
});
