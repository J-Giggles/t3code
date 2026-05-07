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
  void deps;

  const state = createSignal<FlowState>("idle");
  const caption = createSignal("");
  const history = createSignal<Turn[]>([]);

  return {
    state,
    caption,
    history,
    async enter(_notification) {},
    async resume(_threadId) {},
    async pause(_reason) {},
    async cancel() {},
    async shipIt() {},
    cancelShip() {},
    interruptBot() {},
  };
}
