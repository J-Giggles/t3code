import type { RuntimeThreadState, ThreadId } from "@t3tools/contracts";

import type { Notification } from "../types";
import type { NotificationsStore } from "./notificationsStore";

export type ThreadStateEvent = {
  threadId: ThreadId;
  threadTitle: string;
  state: RuntimeThreadState;
  agentLastMessage: string;
  userLastMessage: string;
  changeSummary?: string;
  branch?: string;
  updatedAt: number;
};

export interface ThreadStateStream {
  subscribe(listener: (event: ThreadStateEvent) => void): () => void;
}

export function bindNotificationsToThreadStream(
  stream: ThreadStateStream,
  store: NotificationsStore,
): () => void {
  return stream.subscribe((event) => {
    if (event.state === "idle") {
      store.add(notificationFromThreadState(event, "awaiting"));
      return;
    }

    if (event.state === "error") {
      store.add(notificationFromThreadState(event, "errored"));
      return;
    }

    store.dismiss(event.threadId);
  });
}

function notificationFromThreadState(
  event: ThreadStateEvent,
  status: Notification["status"],
): Notification {
  return {
    threadId: event.threadId,
    threadTitle: event.threadTitle,
    status,
    agentLastMessage: event.agentLastMessage,
    userLastMessage: event.userLastMessage,
    ...(event.changeSummary !== undefined ? { changeSummary: event.changeSummary } : {}),
    ...(event.branch !== undefined ? { branch: event.branch } : {}),
    updatedAt: event.updatedAt,
  };
}
