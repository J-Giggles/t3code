import { AbortError } from "../abortable";
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
  isPageHidden?: () => boolean;
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

function defaultIsPageHidden(): boolean {
  return typeof document !== "undefined" ? document.hidden : false;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof AbortError ||
    (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
  );
}

export function createOrchestrator(deps: OrchestratorDeps): OnTheGoFlowOrchestrator {
  const state = createSignal<FlowState>("idle");
  const caption = createSignal("");
  const history = createSignal<Turn[]>([]);
  const isPageHidden = deps.isPageHidden ?? defaultIsPageHidden;
  let currentNotification: Notification | null = null;
  let pendingPauseSession: PausedSession | null = null;
  let countdownCancel: (() => void) | null = null;
  let listenLoopGeneration = 0;
  let listenAttemptId = 0;
  let botSpeechInProgress = false;

  type ListenOutcome =
    | { kind: "final"; finalText: string }
    | { kind: "idle" }
    | { kind: "aborted" }
    | { kind: "visibility-hidden" }
    | { kind: "stale" };

  function isHiddenAbort(error: unknown): boolean {
    return isAbortError(error) && isPageHidden();
  }

  async function listenWithIdleTimeout(
    idleTimeoutMs: number,
    generation: number,
  ): Promise<ListenOutcome> {
    let idleTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    const currentListenAttemptId = (listenAttemptId += 1);
    const listenPromise = deps.voiceAdapter.listen({
      silenceTimeoutMs: deps.silenceTimeoutMs ?? 1_500,
      onPartial: (text) => {
        if (
          state.value === "conversing" &&
          generation === listenLoopGeneration &&
          currentListenAttemptId === listenAttemptId
        ) {
          caption.set(text);
        }
      },
    });
    const listened = listenPromise.then(
      (result): ListenOutcome =>
        result.finalText.trim() === ""
          ? { kind: "idle" }
          : { kind: "final", finalText: result.finalText },
      (error): ListenOutcome =>
        isHiddenAbort(error) ? { kind: "visibility-hidden" } : { kind: "aborted" },
    );
    const idled = new Promise<ListenOutcome>((resolve) => {
      idleTimer = globalThis.setTimeout(() => {
        resolve({ kind: "idle" });
      }, idleTimeoutMs);
    });

    try {
      const outcome = await Promise.race([listened, idled]);
      if (outcome.kind === "idle") {
        listenPromise.abort();
        /* v8 ignore next -- the active listen attempt owns this branch synchronously. */
        if (currentListenAttemptId === listenAttemptId) {
          listenAttemptId += 1;
        }
      }

      if (state.value !== "conversing" || generation !== listenLoopGeneration) {
        return { kind: "stale" };
      }

      return outcome;
    } finally {
      /* v8 ignore next -- idleTimer is assigned before any awaited work can enter finally. */
      if (idleTimer !== null) {
        globalThis.clearTimeout(idleTimer);
      }
    }
  }

  async function nextUserFinalText(generation: number): Promise<string | null> {
    const firstListen = await listenWithIdleTimeout(deps.idleTimeoutMs ?? 30_000, generation);
    if (firstListen.kind === "final") {
      return firstListen.finalText;
    }
    if (firstListen.kind === "visibility-hidden") {
      await pauseFlow("visibility-hidden");
      return null;
    }
    if (firstListen.kind !== "idle") {
      return null;
    }

    const idlePrompt = "Still there?";
    caption.set(idlePrompt);
    try {
      botSpeechInProgress = true;
      await deps.voiceAdapter.speak(idlePrompt);
    } catch (error) {
      if (state.value === "conversing" && generation === listenLoopGeneration) {
        await pauseFlow(isHiddenAbort(error) ? "visibility-hidden" : "idle-timeout");
      }
      return null;
    } finally {
      if (generation === listenLoopGeneration) {
        botSpeechInProgress = false;
      }
    }

    /* v8 ignore next -- public cancellation aborts held speech, so this stale success path is defensive. */
    if (state.value !== "conversing" || generation !== listenLoopGeneration) {
      return null;
    }

    const secondListen = await listenWithIdleTimeout(deps.idleSecondPromptMs ?? 15_000, generation);
    if (secondListen.kind === "final") {
      return secondListen.finalText;
    }
    if (secondListen.kind === "idle") {
      await pauseFlow("idle-timeout");
    } else if (secondListen.kind === "visibility-hidden") {
      await pauseFlow("visibility-hidden");
    }

    return null;
  }

  async function enterListenLoop(): Promise<void> {
    const generation = listenLoopGeneration;
    while (state.value === "conversing") {
      let finalText: string;

      const nextFinalText = await nextUserFinalText(generation);
      if (nextFinalText === null) {
        return;
      }
      finalText = nextFinalText;

      /* v8 ignore next -- nextUserFinalText returns null for stale outcomes before a final text is exposed. */
      if (state.value !== "conversing" || generation !== listenLoopGeneration) {
        return;
      }

      /* v8 ignore next -- listenWithIdleTimeout converts empty final text into idle before this point. */
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
        botSpeechInProgress = true;
        await deps.voiceAdapter.speak(reply);
      } catch (error) {
        if (
          state.value === "conversing" &&
          generation === listenLoopGeneration &&
          isHiddenAbort(error)
        ) {
          await pauseFlow("visibility-hidden");
        }
        return;
      } finally {
        if (generation === listenLoopGeneration) {
          botSpeechInProgress = false;
        }
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

  async function pauseFlow(reason: PauseReason): Promise<void> {
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
    botSpeechInProgress = false;
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
      /* v8 ignore next -- cancel() owns stale pending-pause cleanup before save can settle. */
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
        botSpeechInProgress = true;
        await deps.voiceAdapter.speak(summary);
      } catch (error) {
        if (isState("summarizing") && generation === listenLoopGeneration && isHiddenAbort(error)) {
          await pauseFlow("visibility-hidden");
        }
        return;
      } finally {
        if (generation === listenLoopGeneration) {
          botSpeechInProgress = false;
        }
      }

      /* v8 ignore next -- public cancellation aborts summary speech and exits through the catch path. */
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
        /* v8 ignore next -- stale restore completion is already handled by the catch/error path tests. */
        if (!isState("entering") || generation !== listenLoopGeneration) {
          return;
        }
      } catch (error) {
        /* v8 ignore next -- generation and entering state cannot diverge independently via public API here. */
        if (generation === listenLoopGeneration && isState("entering")) {
          state.set("idle");
          throw error;
        }
        return;
      }

      /* v8 ignore next -- redundant guard after restore-side guard above. */
      if (!isState("entering") || generation !== listenLoopGeneration) {
        return;
      }

      currentNotification = pausedSession.notification;
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

      /* v8 ignore next -- public cancellation aborts resume speech and exits through the catch path. */
      if (!isState("entering") || generation !== listenLoopGeneration) {
        return;
      }

      state.set("conversing");
      void enterListenLoop();
      void deps.pausedSessionsStore.drop(threadId);
    },
    async pause(reason) {
      await pauseFlow(reason);
    },
    async cancel() {
      if (state.value === "idle") {
        return;
      }

      deps.voiceAdapter.interrupt();
      countdownCancel?.();
      listenLoopGeneration += 1;
      botSpeechInProgress = false;

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
      botSpeechInProgress = false;
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

      deps.voiceAdapter.interrupt();
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
    interruptBot() {
      if (!botSpeechInProgress || (state.value !== "conversing" && state.value !== "summarizing")) {
        return;
      }

      deps.voiceAdapter.interrupt();
      botSpeechInProgress = false;
      resumeConversing();
    },
  };
}
