import type { SummaryAdapter } from "../adapters/SummaryAdapter";
import type { NotificationsStore } from "../state/notificationsStore";
import type { PausedSessionsStore } from "../state/pausedSessionsStore";
import { createSignal, type Signal } from "../state/signal";
import type { FlowState, Notification, PausedSession, PauseReason, Turn } from "../types";
import type { VoiceAdapter } from "../voice/VoiceAdapter";

export interface OnTheGoFlowOrchestrator {
  readonly state: Signal<FlowState>;
  readonly caption: Signal<string>;
  readonly history: Signal<Turn[]>;
  enter(notification: Notification): Promise<void>;
  resume(threadId: Notification["threadId"]): Promise<void>;
  pause(reason: PauseReason): Promise<void>;
  cancel(): Promise<void>;
  shipIt(): Promise<void>;
  cancelShip(): void;
  interruptBot(): void;
}

export type OrchestratorDeps = {
  voiceAdapter: VoiceAdapter;
  summaryAdapter: SummaryAdapter;
  notificationsStore: NotificationsStore;
  pausedSessionsStore: PausedSessionsStore;
  skill: string;
  commitPrompt: (threadId: Notification["threadId"], prompt: string) => Promise<void>;
  silenceTimeoutMs?: number;
  idleTimeoutMs?: number;
  idleSecondPromptMs?: number;
  countdownMs?: number;
};

function buildVerbatimEnvelope(turns: Turn[]): string {
  const transcript = turns.map((turn) => {
    const speaker = turn.role === "user" ? "User" : "On-the-go assistant";
    return `${speaker}: ${turn.text}`;
  });

  return [
    "[On-the-go composer offline]",
    "The optimized composer was unavailable, so this is the verbatim side-conversation transcript.",
    "Please synthesize the user's intended next instruction and proceed.",
    "",
    ...transcript,
  ].join("\n");
}

function buildContextRestorePrompt(history: Turn[]): string {
  const lastTurn = history.at(-1);

  if (lastTurn === undefined) {
    return "Welcome back. I've restored this on-the-go session. What should we do next?";
  }

  const speaker = lastTurn.role === "user" ? "you said" : "I said";
  return `Welcome back. I've restored this on-the-go session. Last turn, ${speaker}: ${lastTurn.text}`;
}

function isSameNotification(left: Notification, right: Notification): boolean {
  return (
    left.threadId === right.threadId &&
    left.threadTitle === right.threadTitle &&
    left.status === right.status &&
    left.agentLastMessage === right.agentLastMessage &&
    left.userLastMessage === right.userLastMessage &&
    left.changeSummary === right.changeSummary &&
    left.branch === right.branch &&
    left.updatedAt === right.updatedAt
  );
}

export function createOrchestrator(deps: OrchestratorDeps): OnTheGoFlowOrchestrator {
  const state = createSignal<FlowState>("idle");
  const caption = createSignal("");
  const history = createSignal<Turn[]>([]);
  let currentNotification: Notification | null = null;
  let pendingPauseSession: PausedSession | null = null;
  let countdownCancel: (() => void) | null = null;
  let listenLoopGeneration = 0;
  const threadFlowEpochs = new Map<string, number>();

  async function enterListenLoop(): Promise<void> {
    const generation = listenLoopGeneration;
    while (state.value === "conversing") {
      let finalText: string;

      try {
        const result = await deps.voiceAdapter.listen({
          silenceTimeoutMs: deps.silenceTimeoutMs ?? 1_500,
          onPartial: caption.set,
        });
        finalText = result.finalText;
      } catch {
        return;
      }

      if (state.value !== "conversing" || generation !== listenLoopGeneration) {
        return;
      }

      if (finalText.trim() === "") {
        continue;
      }

      const userTurn: Turn = { role: "user", text: finalText, at: Date.now() };
      history.set([...history.value, userTurn]);

      let reply: string;
      try {
        reply = await deps.summaryAdapter.reply({
          history: history.value,
          userTurn: finalText,
        });
      } catch {
        return;
      }

      if (state.value !== "conversing" || generation !== listenLoopGeneration) {
        return;
      }

      const assistantTurn: Turn = { role: "assistant", text: reply, at: Date.now() };
      history.set([...history.value, assistantTurn]);
      caption.set(reply);

      try {
        await deps.voiceAdapter.speak(reply);
      } catch {
        return;
      }
    }
  }

  function waitForCountdown(): Promise<"elapsed" | "cancelled"> {
    return new Promise((resolve) => {
      const timeout = globalThis.setTimeout(() => {
        countdownCancel = null;
        resolve("elapsed");
      }, deps.countdownMs ?? 3_000);

      countdownCancel = () => {
        globalThis.clearTimeout(timeout);
        countdownCancel = null;
        resolve("cancelled");
      };
    });
  }

  function resumeConversing(): void {
    listenLoopGeneration += 1;
    state.set("conversing");
    void enterListenLoop();
  }

  function isState(expected: FlowState): boolean {
    return state.value === expected;
  }

  function getThreadFlowEpoch(threadId: Notification["threadId"]): number {
    return threadFlowEpochs.get(String(threadId)) ?? 0;
  }

  function bumpThreadFlowEpoch(threadId: Notification["threadId"]): void {
    const key = String(threadId);
    threadFlowEpochs.set(key, (threadFlowEpochs.get(key) ?? 0) + 1);
  }

  return {
    state,
    caption,
    history,
    async enter(notification) {
      if (state.value !== "idle") {
        throw new Error(`Cannot enter on-the-go flow: not in idle state (${state.value})`);
      }

      currentNotification = notification;
      bumpThreadFlowEpoch(notification.threadId);
      const generation = listenLoopGeneration;
      state.set("entering");
      state.set("summarizing");

      const summary = await deps.summaryAdapter.summarize({
        agentMessage: notification.agentLastMessage,
        userMessage: notification.userLastMessage,
      });

      if (!isState("summarizing") || generation !== listenLoopGeneration) {
        return;
      }

      caption.set(summary);
      history.set([{ role: "assistant", text: summary, at: Date.now() }]);

      try {
        await deps.voiceAdapter.speak(summary);
      } catch {
        return;
      }

      if (!isState("summarizing") || generation !== listenLoopGeneration) {
        return;
      }

      state.set("conversing");
      await enterListenLoop();
    },
    async resume(threadId) {
      if (state.value !== "idle") {
        throw new Error(`Cannot resume on-the-go flow: not in idle state (${state.value})`);
      }

      const generation = listenLoopGeneration;
      state.set("entering");

      let pausedSession: PausedSession;
      try {
        pausedSession = await deps.pausedSessionsStore.restore(threadId);
        if (!isState("entering") || generation !== listenLoopGeneration) {
          return;
        }
      } catch (error) {
        if (generation === listenLoopGeneration && isState("entering")) {
          state.set("idle");
          throw error;
        }
        return;
      }

      if (!isState("entering") || generation !== listenLoopGeneration) {
        return;
      }

      currentNotification = pausedSession.notification;
      bumpThreadFlowEpoch(pausedSession.threadId);
      history.set([...pausedSession.history]);

      const restorePrompt = buildContextRestorePrompt(pausedSession.history);
      caption.set(restorePrompt);

      try {
        await deps.voiceAdapter.speak(restorePrompt);
      } catch {
        if (generation === listenLoopGeneration && isState("entering")) {
          currentNotification = null;
          history.set([]);
          caption.set("");
          state.set("idle");
        }
        return;
      }

      if (!isState("entering") || generation !== listenLoopGeneration) {
        return;
      }

      state.set("conversing");
      void enterListenLoop();
      void deps.pausedSessionsStore.drop(threadId);
    },
    async pause(reason) {
      const notification = currentNotification;
      if (
        notification === null ||
        state.value === "idle" ||
        state.value === "pausing" ||
        state.value === "committing"
      ) {
        return;
      }

      deps.voiceAdapter.interrupt();
      countdownCancel?.();
      listenLoopGeneration += 1;
      const generation = listenLoopGeneration;
      state.set("pausing");

      const currentHistory = [...history.value];
      const lastTurn = currentHistory.at(-1);
      const pausedSession: PausedSession = {
        threadId: notification.threadId,
        notification,
        history: currentHistory,
        ...(lastTurn ? { pendingDraft: lastTurn.text } : {}),
        pausedAt: Date.now(),
        pauseReason: reason,
      };
      pendingPauseSession = pausedSession;
      await deps.pausedSessionsStore.save(pausedSession);

      if (generation !== listenLoopGeneration) {
        const currentPausedSession = deps.pausedSessionsStore.list.value.find(
          (session) => session.threadId === notification.threadId,
        );
        if (currentPausedSession === pausedSession) {
          await deps.pausedSessionsStore.drop(notification.threadId);
        }
        pendingPauseSession = null;
        return;
      }

      pendingPauseSession = null;
      currentNotification = null;
      history.set([]);
      caption.set("");
      state.set("idle");
    },
    async cancel() {
      if (state.value === "idle") {
        return;
      }

      deps.voiceAdapter.interrupt();
      countdownCancel?.();
      listenLoopGeneration += 1;

      const pauseSessionToDrop = pendingPauseSession;
      pendingPauseSession = null;
      currentNotification = null;
      history.set([]);
      caption.set("");
      state.set("idle");
      if (pauseSessionToDrop !== null) {
        const currentPausedSession = deps.pausedSessionsStore.list.value.find(
          (session) => session.threadId === pauseSessionToDrop.threadId,
        );
        if (currentPausedSession === pauseSessionToDrop) {
          await deps.pausedSessionsStore.drop(pauseSessionToDrop.threadId);
        }
      }
    },
    async shipIt() {
      const notification = currentNotification;
      if (state.value !== "conversing" || notification === null) {
        return;
      }

      deps.voiceAdapter.interrupt();
      listenLoopGeneration += 1;
      const generation = listenLoopGeneration;
      state.set("composing");

      let prompt: string;
      try {
        prompt = await deps.summaryAdapter.composePrompt({
          history: history.value,
          skill: deps.skill,
        });

        if (prompt.trim() === "") {
          prompt = buildVerbatimEnvelope(history.value);
        }
      } catch {
        prompt = buildVerbatimEnvelope(history.value);
      }

      if (!isState("composing") || generation !== listenLoopGeneration) {
        return;
      }

      state.set("countdown");
      caption.set(prompt);
      void deps.voiceAdapter
        .speak(`Sending: ${prompt}. Tap cancel to abort.`)
        .catch(() => undefined);

      const countdownResult = await waitForCountdown();
      if (
        countdownResult === "cancelled" ||
        !isState("countdown") ||
        generation !== listenLoopGeneration
      ) {
        return;
      }

      state.set("committing");
      try {
        await deps.commitPrompt(notification.threadId, prompt);
      } catch {
        if (generation !== listenLoopGeneration) {
          return;
        }
        caption.set("Couldn't deliver to main thread. Tap Ship it to retry.");
        resumeConversing();
        return;
      }

      const currentStoredNotification = deps.notificationsStore.notifications.value.find(
        (item) => item.threadId === notification.threadId,
      );
      if (
        currentStoredNotification !== undefined &&
        isSameNotification(currentStoredNotification, notification)
      ) {
        deps.notificationsStore.dismiss(notification.threadId);
      }
      if (!isState("committing") || generation !== listenLoopGeneration) {
        return;
      }

      history.set([]);
      currentNotification = null;
      caption.set("");
      state.set("idle");
    },
    cancelShip() {
      if (state.value !== "countdown" || countdownCancel === null) {
        return;
      }

      countdownCancel();
      deps.voiceAdapter.interrupt();
      resumeConversing();
    },
    interruptBot() {},
  };
}
