import type { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import type { Notification } from "../types";
import { createNotificationsStore } from "./notificationsStore";

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
});
