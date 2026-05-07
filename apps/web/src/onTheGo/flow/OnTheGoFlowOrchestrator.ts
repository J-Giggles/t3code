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
  silenceTimeoutMs?: number;
  idleTimeoutMs?: number;
  idleSecondPromptMs?: number;
  countdownMs?: number;
};

export function createOrchestrator(deps: OrchestratorDeps): OnTheGoFlowOrchestrator {
  const state = createSignal<FlowState>("idle");
  const caption = createSignal("");
  const history = createSignal<Turn[]>([]);

  async function enterListenLoop(): Promise<void> {
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

      if (finalText.trim() === "") {
        continue;
      }

      const userTurn: Turn = { role: "user", text: finalText, at: Date.now() };
      history.set([...history.value, userTurn]);

      const reply = await deps.summaryAdapter.reply({
        history: history.value,
        userTurn: finalText,
      });
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

  return {
    state,
    caption,
    history,
    async enter(notification) {
      if (state.value !== "idle") {
        throw new Error(`Cannot enter on-the-go flow: not in idle state (${state.value})`);
      }

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
    async shipIt() {},
    cancelShip() {},
    interruptBot() {},
  };
}
