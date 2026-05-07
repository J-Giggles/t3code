import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { abortable } from "../abortable";
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
    vi.unstubAllGlobals();
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

  it("cancel during conversing returns idle, clears history and caption, and does not save paused session", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
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
    voice.queueListen("Please make the focused fix.");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    await orchestrator.cancel();

    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
    expect(pausedSessionsStore.list.value).toEqual([]);

    await enterPromise;
  });

  it("cancel during in-flight pause save does not drop a newer paused session", async () => {
    let resolveSave!: () => void;
    const savedSessions: PausedSession[] = [];
    const newerSession: PausedSession = {
      threadId: "thread-123" as Notification["threadId"],
      notification: sampleNotification({ threadTitle: "Newer paused flow" }),
      history: [{ role: "user", text: "newer paused instruction", at: 3_000 }],
      pendingDraft: "newer paused instruction",
      pausedAt: 4_000,
      pauseReason: "manual",
    };
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>(savedSessions),
      save: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      ),
      restore: vi.fn(async () => {
        throw new Error("not used");
      }),
      drop: vi.fn(async (threadId) => {
        const index = savedSessions.findIndex((session) => session.threadId === threadId);
        if (index >= 0) {
          savedSessions.splice(index, 1);
          pausedSessionsStore.list.set([...savedSessions]);
        }
      }),
    };
    summary = new FakeSummaryAdapter({ summary: "Checkout is blocked on a totals mismatch." });
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
      expect(orchestrator.state.value).toBe("conversing");
    });

    const pausePromise = orchestrator.pause("manual");
    await vi.waitFor(() => {
      expect(pausedSessionsStore.save).toHaveBeenCalledOnce();
    });
    await orchestrator.cancel();
    savedSessions.push(newerSession);
    pausedSessionsStore.list.set([...savedSessions]);
    resolveSave();
    await pausePromise;

    expect(pausedSessionsStore.drop).not.toHaveBeenCalled();
    expect(pausedSessionsStore.list.value).toEqual([newerSession]);
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");

    await enterPromise;
  });

  it("cancel during in-flight pause save removes its own stale paused snapshot", async () => {
    let resolveSave!: () => void;
    const savedSessions: PausedSession[] = [];
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>(savedSessions),
      save: vi.fn(
        (session) =>
          new Promise<void>((resolve) => {
            savedSessions.push(session);
            pausedSessionsStore.list.set([...savedSessions]);
            resolveSave = resolve;
          }),
      ),
      restore: vi.fn(async () => {
        throw new Error("not used");
      }),
      drop: vi.fn(async (threadId) => {
        const index = savedSessions.findIndex((session) => session.threadId === threadId);
        if (index >= 0) {
          savedSessions.splice(index, 1);
          pausedSessionsStore.list.set([...savedSessions]);
        }
      }),
    };
    summary = new FakeSummaryAdapter({ summary: "Checkout is blocked on a totals mismatch." });
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
      expect(orchestrator.state.value).toBe("conversing");
    });

    const pausePromise = orchestrator.pause("manual");
    await vi.waitFor(() => {
      expect(pausedSessionsStore.save).toHaveBeenCalledOnce();
    });
    await orchestrator.cancel();
    expect(pausedSessionsStore.drop).toHaveBeenCalledWith("thread-123");
    expect(pausedSessionsStore.list.value).toEqual([]);
    resolveSave();
    await pausePromise;

    expect(pausedSessionsStore.drop).toHaveBeenCalledWith("thread-123");
    expect(pausedSessionsStore.list.value).toEqual([]);
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");

    await enterPromise;
  });

  it("shipIt is blocked while pause save is pending", async () => {
    let resolveSave!: () => void;
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>([]),
      save: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      ),
      restore: vi.fn(async () => {
        throw new Error("not used");
      }),
      drop: vi.fn(async () => undefined),
    };
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      composedPrompt: "Patch the totals calculation and keep tests focused.",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });

    const pausePromise = orchestrator.pause("manual");
    await vi.waitFor(() => {
      expect(pausedSessionsStore.save).toHaveBeenCalledOnce();
    });
    await orchestrator.shipIt();

    expect(summary.composeCalls).toEqual([]);
    expect(commitPrompt).not.toHaveBeenCalled();

    resolveSave();
    await pausePromise;
    await enterPromise;
  });

  it("pause is a no-op while a pause save is already pending", async () => {
    let resolveSave!: () => void;
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>([]),
      save: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      ),
      restore: vi.fn(async () => {
        throw new Error("not used");
      }),
      drop: vi.fn(async () => undefined),
    };
    summary = new FakeSummaryAdapter({ summary: "Checkout is blocked on a totals mismatch." });
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
      expect(orchestrator.state.value).toBe("conversing");
    });

    const firstPause = orchestrator.pause("manual");
    await vi.waitFor(() => {
      expect(pausedSessionsStore.save).toHaveBeenCalledOnce();
    });
    const secondPause = orchestrator.pause("manual");
    await flushPromises();

    expect(pausedSessionsStore.save).toHaveBeenCalledOnce();

    resolveSave();
    await firstPause;
    await secondPause;
    await enterPromise;
  });

  it("cancel interrupts the voice adapter", async () => {
    voice.holdSpeak = true;
    const enterPromise = orchestrator.enter(sampleNotification()).catch(() => undefined);
    await vi.waitFor(() => {
      expect(voice.spokenTexts).toHaveLength(1);
    });

    await orchestrator.cancel();
    await enterPromise;

    expect(voice.interruptCount).toBeGreaterThanOrEqual(1);
    expect(orchestrator.state.value).toBe("idle");
  });

  it("cancel from idle is a no-op", async () => {
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
    });

    await orchestrator.cancel();

    expect(voice.interruptCount).toBe(0);
    expect(pausedSessionsStore.list.value).toEqual([]);
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
  });

  it("cancel during countdown prevents commit and does not save paused session", async () => {
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
    await orchestrator.cancel();
    await shipPromise;

    expect(commitPrompt).not.toHaveBeenCalled();
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
    expect(pausedSessionsStore.list.value).toEqual([]);

    await enterPromise;
  });

  it("cancel during committing is not undone by commit completion", async () => {
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
    await orchestrator.cancel();

    resolveCommit();
    await shipPromise;

    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
    expect(notificationsStore.notifications.value).toEqual([]);

    await enterPromise;
  });

  it("cancel during committing does not dismiss a newer same-thread notification", async () => {
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
    const originalNotification = sampleNotification();
    const newerNotification = sampleNotification({
      threadTitle: "Newer agent result",
      agentLastMessage: "A newer agent update needs review.",
      updatedAt: originalNotification.updatedAt + 1,
    });
    notificationsStore.add(originalNotification);
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
    const enterPromise = orchestrator.enter(originalNotification);
    await vi.waitFor(() => {
      expect(orchestrator.history.value).toHaveLength(3);
    });

    const shipPromise = orchestrator.shipIt();
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("committing");
    });
    await orchestrator.cancel();
    notificationsStore.add(newerNotification);

    resolveCommit();
    await shipPromise;

    expect(notificationsStore.notifications.value).toEqual([newerNotification]);

    await enterPromise;
  });

  it("cancel during held resume speech does not start a stale listen loop", async () => {
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
    await orchestrator.cancel();
    voice.interrupt();
    await resumePromise;

    voice.queueListen("new flow request");
    await flushPromises();

    expect(summary.replyCalls).toHaveLength(0);
    expect(orchestrator.state.value).toBe("idle");
  });

  it("cancel during held resume speech keeps the paused session resumable", async () => {
    voice.holdSpeak = true;
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
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
    await pausedSessionsStore.save(session);
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
    await orchestrator.cancel();
    voice.interrupt();
    await resumePromise;

    expect(pausedSessionsStore.list.value).toEqual([session]);
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
  });

  it("shipIt is blocked during held resume speech", async () => {
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
      countdownMs: 1,
    });

    const resumePromise = orchestrator.resume(notification.threadId);
    await vi.waitFor(() => {
      expect(voice.spokenTexts[0]).toMatch(/welcome back/i);
    });
    await orchestrator.shipIt();

    expect(summary.composeCalls).toEqual([]);
    expect(commitPrompt).not.toHaveBeenCalled();

    await orchestrator.cancel();
    voice.interrupt();
    await resumePromise;
  });

  it("cancel during pending resume restore does not drop the paused session", async () => {
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
    await orchestrator.cancel();
    resolveRestore(session);
    await resumePromise;

    expect(pausedSessionsStore.drop).not.toHaveBeenCalled();
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
  });

  it("cancel during pending resume restore suppresses stale restore errors", async () => {
    let rejectRestore!: (error: Error) => void;
    const notification = sampleNotification();
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>([]),
      save: vi.fn(async () => undefined),
      restore: vi.fn(
        () =>
          new Promise<PausedSession>((_, reject) => {
            rejectRestore = reject;
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
    await orchestrator.cancel();
    rejectRestore(new Error("restore failed after cancel"));

    await expect(resumePromise).resolves.toBeUndefined();
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
  });

  it("cancel during pending resume drop does not overwrite a newer paused session", async () => {
    let resolveDrop!: () => void;
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
    const newerSession: PausedSession = {
      threadId: notification.threadId,
      notification: sampleNotification({ threadTitle: "Newer paused flow" }),
      history: [{ role: "user", text: "newer paused instruction", at: 4_000 }],
      pendingDraft: "newer paused instruction",
      pausedAt: 5_000,
      pauseReason: "manual",
    };
    const savedSessions: PausedSession[] = [session];
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>(savedSessions),
      save: vi.fn(async (savedSession) => {
        savedSessions.push(savedSession);
        pausedSessionsStore.list.set([...savedSessions]);
      }),
      restore: vi.fn(async () => session),
      drop: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            savedSessions.splice(0, savedSessions.length);
            pausedSessionsStore.list.set([]);
            resolveDrop = resolve;
          }),
      ),
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
      expect(pausedSessionsStore.drop).toHaveBeenCalledOnce();
    });
    await orchestrator.cancel();
    savedSessions.push(newerSession);
    pausedSessionsStore.list.set([...savedSessions]);
    resolveDrop();
    await resumePromise;

    expect(pausedSessionsStore.save).not.toHaveBeenCalled();
    expect(pausedSessionsStore.list.value).toEqual([newerSession]);
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
  });

  it("cancel during pending resume drop does not restore the committed resumed session", async () => {
    let resolveDrop!: () => void;
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
    const savedSessions: PausedSession[] = [session];
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>(savedSessions),
      save: vi.fn(async (savedSession) => {
        savedSessions.push(savedSession);
        pausedSessionsStore.list.set([...savedSessions]);
      }),
      restore: vi.fn(async () => session),
      drop: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            savedSessions.splice(0, savedSessions.length);
            pausedSessionsStore.list.set([]);
            resolveDrop = resolve;
          }),
      ),
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
      expect(pausedSessionsStore.drop).toHaveBeenCalledOnce();
    });
    await orchestrator.cancel();
    resolveDrop();
    await resumePromise;

    expect(pausedSessionsStore.save).not.toHaveBeenCalled();
    expect(pausedSessionsStore.list.value).toEqual([]);
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
  });

  it("cancel during pending resume drop does not restore over a new active same-thread flow", async () => {
    let resolveDrop!: () => void;
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
    const savedSessions: PausedSession[] = [session];
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>(savedSessions),
      save: vi.fn(async (savedSession) => {
        savedSessions.push(savedSession);
        pausedSessionsStore.list.set([...savedSessions]);
      }),
      restore: vi.fn(async () => session),
      drop: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            savedSessions.splice(0, savedSessions.length);
            pausedSessionsStore.list.set([]);
            resolveDrop = resolve;
          }),
      ),
    };
    summary = new FakeSummaryAdapter({ summary: "New active same-thread flow." });
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
      expect(pausedSessionsStore.drop).toHaveBeenCalledOnce();
    });
    await orchestrator.cancel();
    const enterPromise = orchestrator.enter(notification);
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });

    resolveDrop();
    await resumePromise;

    expect(pausedSessionsStore.save).not.toHaveBeenCalled();
    expect(pausedSessionsStore.list.value).toEqual([]);
    expect(orchestrator.state.value).toBe("conversing");

    voice.interrupt();
    await enterPromise;
  });

  it("cancel during pending resume drop does not restore after a newer same-thread ship", async () => {
    let resolveDrop!: () => void;
    const notification = sampleNotification();
    const session: PausedSession = {
      threadId: notification.threadId,
      notification,
      history: [{ role: "user", text: "Please make the focused fix.", at: 2_000 }],
      pendingDraft: "Please make the focused fix.",
      pausedAt: 3_000,
      pauseReason: "manual",
    };
    const savedSessions: PausedSession[] = [session];
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>(savedSessions),
      save: vi.fn(async (savedSession) => {
        savedSessions.push(savedSession);
        pausedSessionsStore.list.set([...savedSessions]);
      }),
      restore: vi.fn(async () => session),
      drop: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            savedSessions.splice(0, savedSessions.length);
            pausedSessionsStore.list.set([]);
            resolveDrop = resolve;
          }),
      ),
    };
    summary = new FakeSummaryAdapter({
      summary: "New active same-thread flow.",
      composedPrompt: "Ship newer same-thread work.",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });

    const resumePromise = orchestrator.resume(notification.threadId);
    await vi.waitFor(() => {
      expect(pausedSessionsStore.drop).toHaveBeenCalledOnce();
    });
    await orchestrator.cancel();
    const enterPromise = orchestrator.enter(notification);
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });
    await orchestrator.shipIt();

    resolveDrop();
    await resumePromise;

    expect(commitPrompt).toHaveBeenCalledWith("thread-123", "Ship newer same-thread work.");
    expect(pausedSessionsStore.save).not.toHaveBeenCalled();
    expect(pausedSessionsStore.list.value).toEqual([]);
    expect(orchestrator.state.value).toBe("idle");

    await enterPromise;
  });

  it("cancel during pending resume drop does not restore after a newer same-thread resume ships", async () => {
    let resolveOldDrop!: () => void;
    const notification = sampleNotification();
    const oldSession: PausedSession = {
      threadId: notification.threadId,
      notification,
      history: [{ role: "user", text: "old paused work", at: 1_000 }],
      pendingDraft: "old paused work",
      pausedAt: 2_000,
      pauseReason: "manual",
    };
    const newerSession: PausedSession = {
      threadId: notification.threadId,
      notification,
      history: [{ role: "user", text: "newer paused work", at: 3_000 }],
      pendingDraft: "newer paused work",
      pausedAt: 4_000,
      pauseReason: "manual",
    };
    const savedSessions: PausedSession[] = [oldSession];
    let restoringNewerSession = false;
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>(savedSessions),
      save: vi.fn(async (savedSession) => {
        savedSessions.push(savedSession);
        pausedSessionsStore.list.set([...savedSessions]);
      }),
      restore: vi.fn(async () => (restoringNewerSession ? newerSession : oldSession)),
      drop: vi.fn(async () => {
        if (!restoringNewerSession) {
          await new Promise<void>((resolve) => {
            savedSessions.splice(0, savedSessions.length);
            pausedSessionsStore.list.set([]);
            resolveOldDrop = resolve;
          });
          return;
        }
        savedSessions.splice(0, savedSessions.length);
        pausedSessionsStore.list.set([]);
      }),
    };
    summary = new FakeSummaryAdapter({
      composedPrompt: "Ship newer resumed work.",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      countdownMs: 1,
    });

    const oldResume = orchestrator.resume(notification.threadId);
    await vi.waitFor(() => {
      expect(pausedSessionsStore.drop).toHaveBeenCalledOnce();
    });
    await orchestrator.cancel();
    restoringNewerSession = true;
    savedSessions.push(newerSession);
    pausedSessionsStore.list.set([newerSession]);
    const newerResume = orchestrator.resume(notification.threadId);
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });
    await orchestrator.shipIt();

    resolveOldDrop();
    await oldResume;
    await newerResume;

    expect(commitPrompt).toHaveBeenCalledWith("thread-123", "Ship newer resumed work.");
    expect(pausedSessionsStore.save).not.toHaveBeenCalled();
    expect(pausedSessionsStore.list.value).toEqual([]);
  });

  it("cancel during pending summary is not undone by stale enter continuation", async () => {
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

    await orchestrator.cancel();
    resolveSummary("late summary should not resume");
    await enterPromise;

    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
    expect(voice.spokenTexts).not.toContain("late summary should not resume");
    expect(pausedSessionsStore.list.value).toEqual([]);
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

  it("resume starts listening before a slow paused-session drop settles", async () => {
    let resolveDrop!: () => void;
    const notification = sampleNotification();
    const session: PausedSession = {
      threadId: notification.threadId,
      notification,
      history: [{ role: "user", text: "Please make the focused fix.", at: 2_000 }],
      pendingDraft: "Please make the focused fix.",
      pausedAt: 3_000,
      pauseReason: "manual",
    };
    const savedSessions: PausedSession[] = [session];
    const pausedSessionsStore: PausedSessionsStore = {
      list: createSignal<PausedSession[]>(savedSessions),
      save: vi.fn(async (savedSession) => {
        savedSessions.push(savedSession);
        pausedSessionsStore.list.set([...savedSessions]);
      }),
      restore: vi.fn(async () => session),
      drop: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            savedSessions.splice(0, savedSessions.length);
            pausedSessionsStore.list.set([]);
            resolveDrop = resolve;
          }),
      ),
    };
    summary = new FakeSummaryAdapter({ replies: ["I'll continue from the resumed session."] });
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
      expect(pausedSessionsStore.drop).toHaveBeenCalledOnce();
    });
    voice.queueListen("Continue after resume.");
    await vi.waitFor(() => {
      expect(summary.replyCalls).toHaveLength(1);
    });

    expect(orchestrator.state.value).toBe("conversing");
    resolveDrop();
    await resumePromise;
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

  it("resume speech failure returns idle and keeps paused session resumable", async () => {
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    const notification = sampleNotification();
    const session: PausedSession = {
      threadId: notification.threadId,
      notification,
      history: [{ role: "user", text: "Please make the focused fix.", at: 2_000 }],
      pendingDraft: "Please make the focused fix.",
      pausedAt: 3_000,
      pauseReason: "manual",
    };
    await pausedSessionsStore.save(session);
    vi.spyOn(voice, "speak").mockImplementation(() => {
      const promise = Promise.reject(new Error("tts failed")) as ReturnType<typeof voice.speak>;
      promise.abort = () => undefined;
      return promise;
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

    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
    expect(pausedSessionsStore.list.value).toEqual([session]);
    await expect(orchestrator.enter(sampleNotification())).resolves.toBeUndefined();
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

  it("interruptBot during assistant TTS interrupts speech and starts a fresh listen", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation.", "I'll include the second instruction too."],
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
    });
    const listenSpy = vi.spyOn(voice, "listen");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });

    voice.holdSpeak = true;
    voice.queueListen("Please make the focused fix.");
    await vi.waitFor(() => {
      expect(voice.spokenTexts).toContain("I'll patch the totals calculation.");
    });
    const interruptCount = voice.interruptCount;

    orchestrator.interruptBot();
    voice.holdSpeak = false;

    expect(voice.interruptCount).toBeGreaterThan(interruptCount);
    await vi.waitFor(() => {
      expect(listenSpy).toHaveBeenCalledTimes(2);
    });

    voice.queueListen("Also update the regression note.");
    await vi.waitFor(() => {
      expect(summary.replyCalls).toHaveLength(2);
    });
    expect(orchestrator.history.value.map((turn) => turn.text)).toEqual([
      "Checkout is blocked on a totals mismatch.",
      "Please make the focused fix.",
      "I'll patch the totals calculation.",
      "Also update the regression note.",
      "I'll include the second instruction too.",
    ]);

    voice.interrupt();
    await enterPromise;
  });

  it("interruptBot during initial summary TTS interrupts speech and starts listening", async () => {
    voice.holdSpeak = true;
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
    });
    const listenSpy = vi.spyOn(voice, "listen");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(voice.spokenTexts).toContain("Checkout is blocked on a totals mismatch.");
    });
    const interruptCount = voice.interruptCount;

    try {
      orchestrator.interruptBot();

      await vi.waitFor(() => {
        expect(voice.interruptCount).toBeGreaterThan(interruptCount);
        expect(orchestrator.state.value).toBe("conversing");
        expect(listenSpy).toHaveBeenCalledOnce();
      });

      voice.queueListen("Please make the focused fix.");
      await vi.waitFor(() => {
        expect(summary.replyCalls).toHaveLength(1);
      });
      expect(orchestrator.history.value.map((turn) => turn.text)).toEqual([
        "Checkout is blocked on a totals mismatch.",
        "Please make the focused fix.",
        "I'll patch the totals calculation.",
      ]);
    } finally {
      voice.interrupt();
      await enterPromise;
    }
  });

  it("interruptBot is a no-op when no bot TTS is active", () => {
    orchestrator.interruptBot();

    expect(voice.interruptCount).toBe(0);
  });

  it("idle timeout prompts once and then auto-pauses when the user stays silent", async () => {
    vi.useFakeTimers();
    try {
      const pausedSessionsStore = createInMemoryPausedSessionsStore();
      orchestrator = createOrchestrator({
        voiceAdapter: voice,
        summaryAdapter: summary,
        notificationsStore: createNotificationsStore(),
        pausedSessionsStore,
        skill: "skill text",
        commitPrompt,
        idleTimeoutMs: 1_000,
        idleSecondPromptMs: 500,
      });
      const listenSpy = vi.spyOn(voice, "listen");
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });

      await vi.advanceTimersByTimeAsync(1_000);

      expect(voice.spokenTexts).toContain("Still there?");
      await vi.waitFor(() => {
        expect(listenSpy).toHaveBeenCalledTimes(2);
      });

      await vi.advanceTimersByTimeAsync(500);
      await enterPromise;

      expect(orchestrator.state.value).toBe("idle");
      expect(pausedSessionsStore.list.value).toHaveLength(1);
      expect(pausedSessionsStore.list.value[0]?.pauseReason).toBe("idle-timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("empty listen results count as silence for idle auto-pause", async () => {
    vi.useFakeTimers();
    try {
      const pausedSessionsStore = createInMemoryPausedSessionsStore();
      orchestrator = createOrchestrator({
        voiceAdapter: voice,
        summaryAdapter: summary,
        notificationsStore: createNotificationsStore(),
        pausedSessionsStore,
        skill: "skill text",
        commitPrompt,
        idleTimeoutMs: 1_000,
        idleSecondPromptMs: 500,
      });
      voice.queueListen("");
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(500);
      await enterPromise;

      expect(orchestrator.state.value).toBe("idle");
      expect(pausedSessionsStore.list.value).toHaveLength(1);
      expect(pausedSessionsStore.list.value[0]?.pauseReason).toBe("idle-timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("hidden page listen abort auto-pauses with visibility-hidden and saves the assistant summary", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    let pageHidden = false;
    let abortListen!: () => void;
    vi.spyOn(voice, "listen").mockImplementation(() => {
      const listen = abortable<{ finalText: string }>(() => {
        // stay pending until the browser voice adapter aborts on page visibility
      });
      abortListen = listen.abort;
      return listen;
    });
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    summary = new FakeSummaryAdapter({ summary: "Checkout is blocked on a totals mismatch." });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      isPageHidden: () => pageHidden,
    });
    const notification = sampleNotification();
    const enterPromise = orchestrator.enter(notification);
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });

    pageHidden = true;
    abortListen();
    await enterPromise;

    expect(orchestrator.state.value).toBe("idle");
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
        pauseReason: "visibility-hidden",
      },
    ]);
    expect(orchestrator.history.value).toEqual([]);
    expect(orchestrator.caption.value).toBe("");
  });

  it("hidden page speech abort during initial summary auto-pauses with visibility-hidden", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    let pageHidden = false;
    voice.holdSpeak = true;
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    summary = new FakeSummaryAdapter({ summary: "Checkout is blocked on a totals mismatch." });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      isPageHidden: () => pageHidden,
    });
    const notification = sampleNotification();
    const enterPromise = orchestrator.enter(notification);
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("summarizing");
      expect(orchestrator.history.value).toHaveLength(1);
    });

    pageHidden = true;
    voice.interrupt();
    await enterPromise;

    expect(orchestrator.state.value).toBe("idle");
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
        pauseReason: "visibility-hidden",
      },
    ]);
  });

  it("non-hidden listen abort keeps aborted behavior without saving a paused session", async () => {
    let abortListen!: () => void;
    vi.spyOn(voice, "listen").mockImplementation(() => {
      const listen = abortable<{ finalText: string }>(() => {
        // stay pending until the test aborts listening
      });
      abortListen = listen.abort;
      return listen;
    });
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      isPageHidden: () => false,
    });
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });

    abortListen();
    await enterPromise;

    expect(orchestrator.state.value).toBe("conversing");
    expect(pausedSessionsStore.list.value).toEqual([]);

    await orchestrator.cancel();
  });

  it("hidden page abort during second listen auto-pauses with visibility-hidden", async () => {
    vi.useFakeTimers();
    try {
      let pageHidden = false;
      const listenAborts: Array<() => void> = [];
      vi.spyOn(voice, "listen").mockImplementation(() => {
        const listen = abortable<{ finalText: string }>(() => {
          // stay pending until idle timeout or page visibility aborts listening
        });
        listenAborts.push(listen.abort);
        return listen;
      });
      const pausedSessionsStore = createInMemoryPausedSessionsStore();
      orchestrator = createOrchestrator({
        voiceAdapter: voice,
        summaryAdapter: summary,
        notificationsStore: createNotificationsStore(),
        pausedSessionsStore,
        skill: "skill text",
        commitPrompt,
        idleTimeoutMs: 1_000,
        idleSecondPromptMs: 500,
        isPageHidden: () => pageHidden,
      });
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => {
        expect(voice.spokenTexts).toContain("Still there?");
        expect(listenAborts).toHaveLength(2);
      });

      pageHidden = true;
      listenAborts.at(-1)?.();
      await enterPromise;

      expect(orchestrator.state.value).toBe("idle");
      expect(pausedSessionsStore.list.value).toHaveLength(1);
      expect(pausedSessionsStore.list.value[0]?.pauseReason).toBe("visibility-hidden");
    } finally {
      vi.useRealTimers();
    }
  });

  it("hidden page speech abort during assistant reply auto-pauses with visibility-hidden", async () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_000)
      .mockReturnValueOnce(3_000)
      .mockReturnValueOnce(4_000);
    let pageHidden = false;
    let speakCount = 0;
    let abortReplySpeech!: () => void;
    vi.spyOn(voice, "speak").mockImplementation((text, opts) => {
      voice.spokenTexts.push(text);
      opts?.onStart?.();
      speakCount += 1;
      if (speakCount === 1) {
        opts?.onEnd?.();
        return abortable<void>((resolve) => {
          resolve();
        });
      }

      const speech = abortable<void>(() => {
        return () => {
          opts?.onEnd?.();
        };
      });
      abortReplySpeech = speech.abort;
      return speech;
    });
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll update the focused test and patch the totals calculation."],
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore,
      skill: "skill text",
      commitPrompt,
      isPageHidden: () => pageHidden,
    });
    voice.queueListen("Please make the focused fix.");
    const notification = sampleNotification();
    const enterPromise = orchestrator.enter(notification);
    await vi.waitFor(() => {
      expect(voice.spokenTexts).toContain(
        "I'll update the focused test and patch the totals calculation.",
      );
    });

    pageHidden = true;
    abortReplySpeech();
    await enterPromise;

    expect(orchestrator.state.value).toBe("idle");
    expect(pausedSessionsStore.list.value).toHaveLength(1);
    expect(pausedSessionsStore.list.value[0]).toMatchObject({
      threadId: "thread-123",
      notification,
      pauseReason: "visibility-hidden",
      pausedAt: 4_000,
      pendingDraft: "I'll update the focused test and patch the totals calculation.",
    });
    expect(pausedSessionsStore.list.value[0]?.history).toEqual([
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
  });

  it("stale listen partials do not mutate caption after cancel", async () => {
    let stalePartial: ((text: string) => void) | undefined;
    let listenAbort: (() => void) | undefined;
    vi.spyOn(voice, "listen").mockImplementation((opts) => {
      stalePartial = opts.onPartial;
      const listen = abortable<{ finalText: string }>(() => {
        // stay pending until cancel aborts the listen
      });
      listenAbort = listen.abort;
      return listen;
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
    });
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });

    await orchestrator.cancel();
    stalePartial?.("stale partial after cancel");
    listenAbort?.();
    await enterPromise;

    expect(orchestrator.caption.value).toBe("");
  });

  it("stale partial from aborted idle listen does not overwrite newer caption", async () => {
    vi.useFakeTimers();
    try {
      const partials: Array<((text: string) => void) | undefined> = [];
      const listenAborts: Array<() => void> = [];
      vi.spyOn(voice, "listen").mockImplementation((opts) => {
        partials.push(opts.onPartial);
        const listen = abortable<{ finalText: string }>(() => {
          // stay pending until idle timeout aborts this listen
        });
        listenAborts.push(listen.abort);
        return listen;
      });
      orchestrator = createOrchestrator({
        voiceAdapter: voice,
        summaryAdapter: summary,
        notificationsStore: createNotificationsStore(),
        pausedSessionsStore: createInMemoryPausedSessionsStore(),
        skill: "skill text",
        commitPrompt,
        idleTimeoutMs: 1_000,
        idleSecondPromptMs: 500,
      });
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => {
        expect(orchestrator.caption.value).toBe("Still there?");
        expect(partials).toHaveLength(2);
      });
      partials[0]?.("stale partial from first listen");

      expect(orchestrator.caption.value).toBe("Still there?");

      await orchestrator.cancel();
      listenAborts.at(-1)?.();
      await enterPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it("stale partial from aborted idle listen does not overwrite idle prompt speech", async () => {
    vi.useFakeTimers();
    try {
      const partials: Array<((text: string) => void) | undefined> = [];
      const listenAborts: Array<() => void> = [];
      vi.spyOn(voice, "listen").mockImplementation((opts) => {
        partials.push(opts.onPartial);
        const listen = abortable<{ finalText: string }>(() => {
          // stay pending until idle timeout aborts this listen
        });
        listenAborts.push(listen.abort);
        return listen;
      });
      orchestrator = createOrchestrator({
        voiceAdapter: voice,
        summaryAdapter: summary,
        notificationsStore: createNotificationsStore(),
        pausedSessionsStore: createInMemoryPausedSessionsStore(),
        skill: "skill text",
        commitPrompt,
        idleTimeoutMs: 1_000,
        idleSecondPromptMs: 500,
      });
      const enterPromise = orchestrator.enter(sampleNotification()).catch(() => undefined);
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });
      voice.holdSpeak = true;

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => {
        expect(orchestrator.caption.value).toBe("Still there?");
        expect(voice.spokenTexts).toContain("Still there?");
      });
      partials[0]?.("stale partial during idle prompt speech");

      expect(orchestrator.caption.value).toBe("Still there?");

      await orchestrator.cancel();
      listenAborts.at(-1)?.();
      voice.interrupt();
      await enterPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it("idle timeout timers do not mutate the flow after cancel", async () => {
    vi.useFakeTimers();
    try {
      const pausedSessionsStore = createInMemoryPausedSessionsStore();
      orchestrator = createOrchestrator({
        voiceAdapter: voice,
        summaryAdapter: summary,
        notificationsStore: createNotificationsStore(),
        pausedSessionsStore,
        skill: "skill text",
        commitPrompt,
        idleTimeoutMs: 1_000,
        idleSecondPromptMs: 500,
      });
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });

      await orchestrator.cancel();
      await vi.advanceTimersByTimeAsync(2_000);
      await enterPromise;

      expect(orchestrator.state.value).toBe("idle");
      expect(voice.spokenTexts).not.toContain("Still there?");
      expect(pausedSessionsStore.list.value).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shipIt clears bot speech state when interrupting held assistant TTS", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation.", "I'll handle the follow-up."],
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
    const listenSpy = vi.spyOn(voice, "listen");
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });
    voice.holdSpeak = true;
    voice.queueListen("Please make the focused fix.");
    await vi.waitFor(() => {
      expect(voice.spokenTexts).toContain("I'll patch the totals calculation.");
    });

    const shipPromise = orchestrator.shipIt();
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("countdown");
    });
    orchestrator.cancelShip();
    await shipPromise;
    const interruptCount = voice.interruptCount;
    const listenCallsBeforeInterruptBot = listenSpy.mock.calls.length;

    orchestrator.interruptBot();
    expect(listenSpy.mock.calls.length).toBe(listenCallsBeforeInterruptBot);

    voice.queueListen("Continue normally.");
    await vi.waitFor(() => {
      expect(summary.replyCalls).toHaveLength(2);
    });

    expect(voice.interruptCount).toBe(interruptCount);

    voice.interrupt();
    await enterPromise;
  });

  it("successful ship interrupts the countdown preview speech before returning idle", async () => {
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
    voice.holdSpeak = true;
    const interruptCount = voice.interruptCount;

    await orchestrator.shipIt();

    expect(orchestrator.state.value).toBe("idle");
    expect(voice.spokenTexts.at(-1)).toContain("Sending:");
    expect(voice.interruptCount).toBeGreaterThan(interruptCount);

    await enterPromise;
  });

  it("interruptBot during idle prompt TTS interrupts and starts a fresh listen", async () => {
    vi.useFakeTimers();
    try {
      summary = new FakeSummaryAdapter({
        summary: "Checkout is blocked on a totals mismatch.",
        replies: ["I'll continue after the idle prompt."],
      });
      orchestrator = createOrchestrator({
        voiceAdapter: voice,
        summaryAdapter: summary,
        notificationsStore: createNotificationsStore(),
        pausedSessionsStore: createInMemoryPausedSessionsStore(),
        skill: "skill text",
        commitPrompt,
        idleTimeoutMs: 1_000,
        idleSecondPromptMs: 500,
      });
      const listenSpy = vi.spyOn(voice, "listen");
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });
      voice.holdSpeak = true;

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => {
        expect(voice.spokenTexts).toContain("Still there?");
      });
      const interruptCount = voice.interruptCount;

      orchestrator.interruptBot();
      voice.holdSpeak = false;

      expect(voice.interruptCount).toBeGreaterThan(interruptCount);
      await vi.waitFor(() => {
        expect(listenSpy).toHaveBeenCalledTimes(2);
      });
      voice.queueListen("Continue after idle prompt.");
      await vi.waitFor(() => {
        expect(summary.replyCalls).toHaveLength(1);
      });

      voice.interrupt();
      await enterPromise;
    } finally {
      vi.useRealTimers();
    }
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

  it("resume speaks the empty-history context restore prompt", async () => {
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    const notification = sampleNotification();
    await pausedSessionsStore.save({
      threadId: notification.threadId,
      notification,
      history: [],
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

    expect(voice.spokenTexts).toEqual([
      "Welcome back. I've restored this on-the-go session. What should we do next?",
    ]);
    voice.interrupt();
  });

  it("resume context restore says I said when the last turn is from the assistant", async () => {
    const pausedSessionsStore = createInMemoryPausedSessionsStore();
    const notification = sampleNotification();
    await pausedSessionsStore.save({
      threadId: notification.threadId,
      notification,
      history: [{ role: "assistant", text: "I'll patch the totals calculation.", at: 2_000 }],
      pendingDraft: "I'll patch the totals calculation.",
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

    expect(voice.spokenTexts[0]).toContain("Last turn, I said: I'll patch the totals calculation.");
    voice.interrupt();
  });

  it("default page hidden detector treats AbortError as visibility-hidden", async () => {
    let abortListen!: () => void;
    let pageHidden = false;
    vi.spyOn(voice, "listen").mockImplementation(() => {
      const listen = abortable<{ finalText: string }>(() => {
        // stay pending until the test simulates the browser visibility abort
      });
      abortListen = listen.abort;
      return listen;
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
    vi.stubGlobal("document", { hidden: pageHidden });
    const enterPromise = orchestrator.enter(sampleNotification());
    await vi.waitFor(() => {
      expect(orchestrator.state.value).toBe("conversing");
    });

    pageHidden = true;
    vi.stubGlobal("document", { hidden: pageHidden });
    abortListen();
    await enterPromise;

    expect(pausedSessionsStore.list.value[0]?.pauseReason).toBe("visibility-hidden");
  });

  it("idle prompt speech failure auto-pauses with idle-timeout", async () => {
    vi.useFakeTimers();
    try {
      let speakCount = 0;
      vi.spyOn(voice, "speak").mockImplementation((text, opts) => {
        voice.spokenTexts.push(text);
        opts?.onStart?.();
        speakCount += 1;
        return abortable<void>((resolve, reject) => {
          opts?.onEnd?.();
          if (speakCount === 2) {
            reject(new Error("idle prompt tts failed"));
            return;
          }
          resolve();
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
        idleTimeoutMs: 1_000,
      });
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await enterPromise;

      expect(pausedSessionsStore.list.value[0]?.pauseReason).toBe("idle-timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("hidden abort during idle prompt speech auto-pauses with visibility-hidden", async () => {
    vi.useFakeTimers();
    try {
      let pageHidden = false;
      let speakCount = 0;
      vi.spyOn(voice, "speak").mockImplementation((text, opts) => {
        voice.spokenTexts.push(text);
        opts?.onStart?.();
        speakCount += 1;
        return abortable<void>((resolve, reject) => {
          opts?.onEnd?.();
          if (speakCount === 2) {
            pageHidden = true;
            reject({ name: "AbortError" });
            return;
          }
          resolve();
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
        idleTimeoutMs: 1_000,
        isPageHidden: () => pageHidden,
      });
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await enterPromise;

      expect(pausedSessionsStore.list.value[0]?.pauseReason).toBe("visibility-hidden");
    } finally {
      vi.useRealTimers();
    }
  });

  it("user answer after idle prompt resumes the conversation", async () => {
    vi.useFakeTimers();
    try {
      summary = new FakeSummaryAdapter({
        replies: ["I'll continue after the idle check."],
      });
      orchestrator = createOrchestrator({
        voiceAdapter: voice,
        summaryAdapter: summary,
        notificationsStore: createNotificationsStore(),
        pausedSessionsStore: createInMemoryPausedSessionsStore(),
        skill: "skill text",
        commitPrompt,
        idleTimeoutMs: 1_000,
      });
      const enterPromise = orchestrator.enter(sampleNotification());
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("conversing");
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => {
        expect(voice.spokenTexts).toContain("Still there?");
      });
      voice.queueListen("Yes, continue.");
      await vi.waitFor(() => {
        expect(summary.replyCalls).toHaveLength(1);
      });

      expect(orchestrator.history.value.map((turn) => turn.text)).toContain("Yes, continue.");
      expect(orchestrator.state.value).toBe("conversing");

      voice.interrupt();
      await enterPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it("shipIt uses the default three-second countdown delay", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    summary = new FakeSummaryAdapter({
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
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 3_000);
    expect(commitPrompt).not.toHaveBeenCalled();

    orchestrator.cancelShip();
    await shipPromise;

    voice.interrupt();
    await enterPromise;
  });

  it("empty composed prompt uses the envelope fallback", async () => {
    summary = new FakeSummaryAdapter({
      summary: "Checkout is blocked on a totals mismatch.",
      replies: ["I'll patch the totals calculation."],
      composedPrompt: "   ",
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

    const sentPrompt = commitPrompt.mock.calls[0]?.[1] as string;
    expect(sentPrompt).toContain("On-the-go composer offline");
    expect(sentPrompt).toContain("Please make the focused fix.");
    await enterPromise;
  });

  it("cancel during a failed commit suppresses stale retry caption", async () => {
    vi.useFakeTimers();
    try {
      let rejectCommit!: (error: Error) => void;
      commitPrompt = vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            rejectCommit = reject;
          }),
      ) as CommitPromptMock;
      summary = new FakeSummaryAdapter({
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

      const shipPromise = orchestrator.shipIt();
      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => {
        expect(orchestrator.state.value).toBe("committing");
      });
      await orchestrator.cancel();
      rejectCommit(new Error("commit failed after cancel"));
      await shipPromise;

      expect(orchestrator.caption.value).toBe("");
      expect(orchestrator.state.value).toBe("idle");
      await enterPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it("failed commit returns to conversation with retry caption", async () => {
    commitPrompt = vi.fn(async () => {
      throw new Error("commit failed");
    }) as CommitPromptMock;
    summary = new FakeSummaryAdapter({
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

    expect(orchestrator.caption.value).toBe(
      "Couldn't deliver to main thread. Tap Ship it to retry.",
    );
    expect(orchestrator.state.value).toBe("conversing");

    voice.interrupt();
    await enterPromise;
  });

  it("cancelShip outside countdown is a no-op", () => {
    orchestrator.cancelShip();

    expect(voice.interruptCount).toBe(0);
    expect(orchestrator.state.value).toBe("idle");
  });
});
