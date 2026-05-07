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

async function enterListenLoop(notification: Notification): Promise<void> {
  void notification;
}

export function createOrchestrator(deps: OrchestratorDeps): OnTheGoFlowOrchestrator {
  const state = createSignal<FlowState>("idle");
  const caption = createSignal("");
  const history = createSignal<Turn[]>([]);
  let currentNotification: Notification | undefined;

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
      await enterListenLoop(currentNotification);
    },
    async resume(_threadId) {},
    async pause(_reason) {},
    async cancel() {},
    async shipIt() {},
    cancelShip() {},
    interruptBot() {},
  };
}
