import type { ThreadId } from "@t3tools/contracts";

export type NotificationStatus = "awaiting" | "errored";

export type Notification = {
  threadId: ThreadId;
  threadTitle: string;
  status: NotificationStatus;
  agentLastMessage: string;
  userLastMessage: string;
  changeSummary?: string;
  branch?: string;
  updatedAt: number;
};

export type Turn = {
  role: "user" | "assistant";
  text: string;
  at: number;
};

export type PauseReason = "manual" | "idle-timeout";

export type PausedSession = {
  threadId: ThreadId;
  notification: Notification;
  history: Turn[];
  pendingDraft?: string;
  pausedAt: number;
  pauseReason: PauseReason;
};

export type FlowState =
  | "idle"
  | "entering"
  | "summarizing"
  | "conversing"
  | "pausing"
  | "composing"
  | "countdown"
  | "committing";
