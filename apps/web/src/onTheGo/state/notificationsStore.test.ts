import type { ThreadId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Notification } from "../types";
import { createNotificationsStore } from "./notificationsStore";

const originalBrowserGlobals = {
  document: Object.getOwnPropertyDescriptor(globalThis, "document"),
  notification: Object.getOwnPropertyDescriptor(globalThis, "Notification"),
};

afterEach(() => {
  restoreGlobalProperty("document", originalBrowserGlobals.document);
  restoreGlobalProperty("Notification", originalBrowserGlobals.notification);
});

function threadId(value: string): ThreadId {
  return value as ThreadId;
}

function notification(
  threadId: ThreadId,
  options: Partial<Omit<Notification, "threadId">> = {},
): Notification {
  return {
    threadId,
    threadTitle: `Thread ${threadId}`,
    status: "awaiting",
    agentLastMessage: "Agent message",
    userLastMessage: "User message",
    updatedAt: 1,
    ...options,
  };
}

describe("NotificationsStore", () => {
  it("adds notifications and reflects the current count", () => {
    const store = createNotificationsStore();
    const first = notification(threadId("thread-1"));
    const second = notification(threadId("thread-2"));

    store.add(first);
    store.add(second);

    expect(store.notifications.value).toEqual([first, second]);
    expect(store.count.value).toBe(2);
  });

  it("dedupes by threadId with the last write winning", () => {
    const store = createNotificationsStore();
    const original = notification(threadId("thread-1"), {
      agentLastMessage: "Original",
      updatedAt: 1,
    });
    const replacement = notification(threadId("thread-1"), {
      agentLastMessage: "Replacement",
      updatedAt: 2,
    });

    store.add(original);
    store.add(replacement);

    expect(store.notifications.value).toEqual([replacement]);
    expect(store.count.value).toBe(1);
  });

  it("sorts errored notifications before awaiting, then by updatedAt descending", () => {
    const store = createNotificationsStore();
    const awaitingNewer = notification(threadId("awaiting-newer"), {
      status: "awaiting",
      updatedAt: 40,
    });
    const erroredOlder = notification(threadId("errored-older"), {
      status: "errored",
      updatedAt: 20,
    });
    const awaitingOlder = notification(threadId("awaiting-older"), {
      status: "awaiting",
      updatedAt: 10,
    });
    const erroredNewer = notification(threadId("errored-newer"), {
      status: "errored",
      updatedAt: 30,
    });

    store.add(awaitingNewer);
    store.add(erroredOlder);
    store.add(awaitingOlder);
    store.add(erroredNewer);

    expect(store.notifications.value.map((item) => item.threadId)).toEqual([
      threadId("errored-newer"),
      threadId("errored-older"),
      threadId("awaiting-newer"),
      threadId("awaiting-older"),
    ]);
  });

  it("dismisses notifications by threadId and reflects the current count", () => {
    const store = createNotificationsStore();
    const first = notification(threadId("thread-1"));
    const second = notification(threadId("thread-2"));

    store.add(first);
    store.add(second);
    store.dismiss(threadId("thread-1"));

    expect(store.notifications.value).toEqual([second]);
    expect(store.count.value).toBe(1);
  });

  it("fires a system notification when adding while hidden and permission is granted", () => {
    const systemNotification = mockSystemNotifications({
      hidden: true,
      permission: "granted",
    });
    const store = createNotificationsStore();

    store.add(
      notification(threadId("thread-1"), {
        threadTitle: "Fix mobile auth",
        agentLastMessage: "The auth callback now needs a guarded redirect before resume.",
      }),
    );

    expect(systemNotification).toHaveBeenCalledWith("T3 Code", {
      body: "Fix mobile auth\nThe auth callback now needs a guarded redirect before resume.",
      tag: "thread-1",
    });
  });

  it("does not fire a system notification when adding while visible", () => {
    const systemNotification = mockSystemNotifications({
      hidden: false,
      permission: "granted",
    });
    const store = createNotificationsStore();

    store.add(notification(threadId("thread-1")));

    expect(systemNotification).not.toHaveBeenCalled();
  });

  it("does not fire a system notification when permission is not granted", () => {
    const systemNotification = mockSystemNotifications({
      hidden: true,
      permission: "denied",
    });
    const store = createNotificationsStore();

    store.add(notification(threadId("thread-1")));

    expect(systemNotification).not.toHaveBeenCalled();
  });
});

function mockSystemNotifications(options: {
  hidden: boolean;
  permission: globalThis.NotificationPermission;
}): ReturnType<typeof vi.fn> {
  const systemNotification = vi.fn();
  const mockDocument = {};

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: mockDocument,
  });
  Object.defineProperty(globalThis.document, "hidden", {
    configurable: true,
    get: () => options.hidden,
  });

  class MockNotification {
    static permission = options.permission;

    constructor(title: string, notificationOptions?: globalThis.NotificationOptions) {
      systemNotification(title, notificationOptions);
    }
  }

  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: MockNotification,
  });

  return systemNotification;
}

function restoreGlobalProperty(
  property: "document" | "Notification",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, property, descriptor);
    return;
  }

  Reflect.deleteProperty(globalThis, property);
}
