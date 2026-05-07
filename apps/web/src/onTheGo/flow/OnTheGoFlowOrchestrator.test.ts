import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeSummaryAdapter } from "../adapters/FakeSummaryAdapter";
import { createNotificationsStore } from "../state/notificationsStore";
import {
  createInMemoryPausedSessionsStore,
  type PausedSessionsStore,
} from "../state/pausedSessionsStore";
import { createSignal } from "../state/signal";
import type { FlowState, Notification, PausedSession } from "../types";
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

  it("pause saves session and returns idle with pauseReason manual", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    summary = new FakeSummaryAdapter({ summary: "Checkout is blocked on a totals mismatch." });
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });
    const notification = sampleNotification();
    const enterPromise = orchestrator.enter(notification);
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });

    await orchestrator.pause("manual");

    expect(voice.interruptCount).toBeGreaterThanOrEqual(1);
    expect(pausedSessionsStore.list.value).toEqual([
      {
        threadId: "thread-123",
        notification,
        history: [
          {
            role: "assistant",
            text: "Checkout is blocked on a totals mismatch.",
            at: 1_000,
          },
        ],
        pendingDraft: "Checkout is blocked on a totals mismatch.",
        pausedAt: 2_000,
        pauseReason: "manual",
      },
    ]);
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");

    await enterPromise;
  });

  it("pause with no active notification is a no-op", async () => {
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });

    await orchestrator.pause("manual");

    expect(pausedSessionsStore.list.value).toEqual([]);
    expect(voice.interruptCount).toBe(0);
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
  });

  it("pause during initial speech is not undone by stale enter continuation", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    voice.holdSpeak = true;
    summary = new FakeSummaryAdapter({ summary: "Checkout is blocked on a totals mismatch." });
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });
    const enterPromise = orchestrator.enter(sampleNotification()).catch(() => undefined);
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(1);
    });

    await orchestrator.pause("manual");
    voice.interrupt();
    await enterPromise;

    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
    expect(pausedSessionsStore.list.value).toHaveLength(1);
  });

  it("pause during pending summary is not undone by stale enter continuation", async () => {
    let resolveSummary!: (summary: string) => void;
    summary = new FakeSummaryAdapter();
    vi.spyOn(summary, "summarize").mockImplementation(async (input) => {
      summary.summarizeCalls.push(input);
      return new Promise<string>((resolve) => {
        resolveSummary = resolve;
      });
    });
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(summary.summarizeCalls).toHaveLength(1);
    });

    await orchestrator.pause("manual");
    resolveSummary("late summary should not resume");
    await enterPromise;

    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
    expect(voice.spokenTexts).not.toContain("late summary should not resume");
    expect(pausedSessionsStore.list.value).toHaveLength(1);
  });

  it("pause during compose prevents stale shipIt from committing", async () => {
    let resolveCompose!: (prompt: string) => void;
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
    });
    vi.spyOn(summary, "composePrompt").mockImplementation(async (input) => {
      summary.composeCalls.push(input);
      return new Promise<string>((resolve) => {
        resolveCompose = resolve;
      });
    });
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    const shipPromise = orchestrator.shipIt();
    await vi.waitFor(() => {
      expect(summary.composeCalls).toHaveLength(1);
    });
    await orchestrator.pause("manual");
    resolveCompose("stale prompt should not commit");
    await shipPromise;

    expect(commitPrompt).not.toHaveBeenCalled();
    expect(orchestrator.state.value).toBe("idle");
    expect(pausedSessionsStore.list.value).toHaveLength(1);

    await enterPromise;
  });

  it("pause during countdown cancels the pending commit", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
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
    await orchestrator.pause("manual");
    await shipPromise;

    expect(commitPrompt).not.toHaveBeenCalled();
    expect(orchestrator.state.value).toBe("idle");
    expect(pausedSessionsStore.list.value).toHaveLength(1);

    await enterPromise;
  });

  it("pause during committing does not save a duplicate paused session", async () => {
    let resolveCommit!: () => void;
    commitPrompt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCommit = resolve;
        }),
    ) as CommitPromptMock;
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    const notificationsStore = createNotificationsStore();
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    notificationsStore.add(sampleNotification());
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore,
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    const shipPromise = orchestrator.shipIt();
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("committing");
    });
    await orchestrator.pause("manual");

    expect(pausedSessionsStore.list.value).toEqual([]);
    expect(orchestrator.state.value).toBe("committing");

    resolveCommit();
    await shipPromise;

    expect(notificationsStore.notifications.value).toEqual([]);
    expect(orchestrator.state.value).toBe("idle");

    await enterPromise;
  });

  it("resume restores history, drops paused session, and transitions conversing", async () => {
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    const notification = sampleNotification();
    const savedHistory = [
      { role: "assistant" as const, text: "Checkout is blocked on a totals mismatch.", at: 1_000 },
      { role: "user" as const, text: "Please make the focused fix.", at: 2_000 },
    ];
    await pausedSessionsStore.save({
      threadId: notification.threadId,
      notification,
      history: savedHistory,
      pendingDraft: "Please make the focused fix.",
      pausedAt: 3_000,
      pauseReason: "manual",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });

    await orchestrator.resume(notification.threadId);

    expect(orchestrator.history.value).toEqual(savedHistory);
    expect(pausedSessionsStore.list.value).toEqual([]);
    expect(orchestrator.state.value).toBe("conversing");

    voice.interrupt();
  });

  it("resume speaks a welcome back context restore prompt with the last turn", async () => {
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    const notification = sampleNotification();
    await pausedSessionsStore.save({
      threadId: notification.threadId,
      notification,
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
      pendingDraft: "Please make the focused fix.",
      pausedAt: 3_000,
      pauseReason: "manual",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });

    await orchestrator.resume(notification.threadId);

    expect(voice.spokenTexts).toHaveLength(1);
    expect(voice.spokenTexts[0]).toMatch(/welcome back/i);
    expect(voice.spokenTexts[0]).toContain("Please make the focused fix.");
    expect(orchestrator.caption.value).toBe(voice.spokenTexts[0]);

    voice.interrupt();
  });

  it("resume is not externally idle while welcome-back speech is active", async () => {
    voice.holdSpeak = true;
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    const notification = sampleNotification();
    await pausedSessionsStore.save({
      threadId: notification.threadId,
      notification,
      history: [
        {
          role: "user",
          text: "Please make the focused fix.",
          at: 2_000,
        },
      ],
      pendingDraft: "Please make the focused fix.",
      pausedAt: 3_000,
      pauseReason: "manual",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });

    const resumePromise = orchestrator.resume(notification.threadId);
    await vi.waitFor(() => {
      expect(voice.spokenTexts[0]).toMatch(/welcome back/i);
    });

    expect(orchestrator.state.value).not.toBe("idle");
    await expect(orchestrator.enter(sampleNotification())).rejects.toThrow(/not in idle/i);

    voice.interrupt();
    await resumePromise;
  });

  it("resume is not externally idle while persisted restore is pending", async () => {
    let resolveRestore!: (session: PausedSession) => void;
    const notification = sampleNotification();
    const session: PausedSession = {
      threadId: notification.threadId,
      notification,
      history: [
        {
          role: "user",
          text: "Please make the focused fix.",
          at: 2_000,
        },
      ],
      pendingDraft: "Please make the focused fix.",
      pausedAt: 3_000,
      pauseReason: "manual",
    };
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>([session]),
      save: vi.fn(async () => undefined),
      restore: vi.fn(
        () =>
          new Promise<PausedSession>((resolve) => {
            resolveRestore = resolve;
          }),
      ),
      drop: vi.fn(async () => undefined),
    };
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });

    const resumePromise = orchestrator.resume(notification.threadId);
    await vi.waitFor(() => {
      expect(pausedSessionsStore.restore).toHaveBeenCalledOnce();
    });

    expect(orchestrator.state.value).not.toBe("idle");
    await expect(orchestrator.enter(sampleNotification())).rejects.toThrow(/not in idle/i);

    resolveRestore(session);
    await resumePromise;
    voice.interrupt();
  });

  it("resume while not idle rejects", async () => {
    voice.holdSpeak = true;
    const enterPromise = orchestrator.enter(sampleNotification()).catch(() => undefined);
    await vi.waitFor(() => {
      expect(orchestrator.state.value).not.toBe("idle");
    });

    await expect(orchestrator.resume(sampleNotification().threadId)).rejects.toThrow(
      /not in idle/i,
    );

    voice.interrupt();
    await enterPromise;
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
