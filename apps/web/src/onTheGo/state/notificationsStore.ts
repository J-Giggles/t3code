import type { ThreadId } from "@t3tools/contracts";

import type { Notification, NotificationStatus } from "../types";
import { createSignal, type Signal } from "./signal";

export interface NotificationsStore {
  readonly notifications: Signal<Notification[]>;
  readonly count: Signal<number>;
  add(notification: Notification): void;
  dismiss(threadId: ThreadId): void;
}

export function createNotificationsStore(): NotificationsStore {
  const notifications = createSignal<Notification[]>([]);
  const count = createSignal(0);

  function setNotifications(next: Notification[]): void {
    notifications.set(sortNotifications(next));
    count.set(notifications.value.length);
  }

  return {
    notifications,
    count,
    add(notification) {
      setNotifications([
        ...notifications.value.filter((item) => item.threadId !== notification.threadId),
        notification,
      ]);
      fireSystemNotification(notification);
    },
    dismiss(threadId) {
      setNotifications(notifications.value.filter((item) => item.threadId !== threadId));
    },
  };
}

function sortNotifications(notifications: Notification[]): Notification[] {
  return notifications.toSorted((left, right) => {
    const statusComparison = statusRank(left.status) - statusRank(right.status);

    if (statusComparison !== 0) return statusComparison;

    return right.updatedAt - left.updatedAt;
  });
}

function statusRank(status: NotificationStatus): number {
  return status === "errored" ? 0 : 1;
}

function fireSystemNotification(notification: Notification): void {
  const systemNotification = globalThis.Notification;
  const currentDocument = globalThis.document;

  if (
    !systemNotification ||
    !currentDocument?.hidden ||
    systemNotification.permission !== "granted"
  ) {
    return;
  }

  Reflect.construct(systemNotification, [
    "T3 Code",
    {
      body: `${notification.threadTitle}\n${notification.agentLastMessage}`,
      tag: notification.threadId,
    },
  ]);
}
