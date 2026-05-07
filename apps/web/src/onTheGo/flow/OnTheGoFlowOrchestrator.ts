import type { SummaryAdapter } from "../adapters/SummaryAdapter";
import type { NotificationsStore } from "../state/notificationsStore";
import type { PausedSessionsStore } from "../state/pausedSessionsStore";
import { createSignal, type Signal } from "../state/signal";
import type { FlowState, Notification, PauseReason, Turn } from "../types";
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

export function createOrchestrator(deps: OrchestratorDeps): OnTheGoFlowOrchestrator {
  const state = createSignal<FlowState>("idle");
  const caption = createSignal("");
  const history = createSignal<Turn[]>([]);
  let currentNotification: Notification | null = null;
  let countdownCancel: (() => void) | null = null;
  let listenLoopGeneration = 0;

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

  return {
    state,
    caption,
    history,
    async enter(notification) {
      if (state.value !== "idle") {
        throw new Error(`Cannot enter on-the-go flow: not in idle state (${state.value})`);
      }

      currentNotification = notification;
      state.set("entering");
      state.set("summarizing");

      const summary = await deps.summaryAdapter.summarize({
        agentMessage: notification.agentLastMessage,
        userMessage: notification.userLastMessage,
      });

      caption.set(summary);
      history.set([{ role: "assistant", text: summary, at: Date.now() }]);

      await deps.voiceAdapter.speak(summary);

      state.set("conversing");
      await enterListenLoop();
    },
    async resume(_threadId) {},
    async pause(_reason) {},
    async cancel() {},
    async shipIt() {
      const notification = currentNotification;
      if (state.value !== "conversing" || notification === null) {
        return;
      }

      deps.voiceAdapter.interrupt();
      listenLoopGeneration += 1;
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

      if (!isState("composing")) {
        return;
      }

      state.set("countdown");
      caption.set(prompt);
      void deps.voiceAdapter
        .speak(`Sending: ${prompt}. Tap cancel to abort.`)
        .catch(() => undefined);

      const countdownResult = await waitForCountdown();
      if (countdownResult === "cancelled" || !isState("countdown")) {
        return;
      }

      state.set("committing");
      try {
        await deps.commitPrompt(notification.threadId, prompt);
      } catch {
        caption.set("Couldn't deliver to main thread. Tap Ship it to retry.");
        resumeConversing();
        return;
      }

      deps.notificationsStore.dismiss(notification.threadId);
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
