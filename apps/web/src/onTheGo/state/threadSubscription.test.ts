import type { RuntimeThreadState, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { createNotificationsStore } from "./notificationsStore";
import {
  bindNotificationsToThreadStream,
  type ThreadStateEvent,
  type ThreadStateStream,
} from "./threadSubscription";

function threadId(value: string): ThreadId {
  return value as ThreadId;
}

function event(options: Partial<ThreadStateEvent> = {}): ThreadStateEvent {
  return {
    threadId: threadId("thread-1"),
    threadTitle: "Fix mobile auth",
    state: "idle",
    agentLastMessage: "Agent is waiting on a redirect decision.",
    userLastMessage: "Please check the auth callback.",
    updatedAt: 100,
    ...options,
  };
}

function stream(): ThreadStateStream & {
  emit(event: ThreadStateEvent): void;
  listenerCount(): number;
} {
  const listeners = new Set<(event: ThreadStateEvent) => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    emit(nextEvent) {
      for (const listener of listeners) {
        listener(nextEvent);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

describe("bindNotificationsToThreadStream", () => {
  it("adds an awaiting notification for idle thread state", () => {
    const source = stream();
    const store = createNotificationsStore();

    bindNotificationsToThreadStream(source, store);
    source.emit(
      event({
        changeSummary: "Auth redirect now preserves the paired session.",
        branch: "feat/on-the-go-mode",
      }),
    );

    expect(store.notifications.value).toEqual([
      {
        threadId: threadId("thread-1"),
        threadTitle: "Fix mobile auth",
        status: "awaiting",
        agentLastMessage: "Agent is waiting on a redirect decision.",
        userLastMessage: "Please check the auth callback.",
        changeSummary: "Auth redirect now preserves the paired session.",
        branch: "feat/on-the-go-mode",
        updatedAt: 100,
      },
    ]);
  });

  it("adds an errored notification for error thread state", () => {
    const source = stream();
    const store = createNotificationsStore();

    bindNotificationsToThreadStream(source, store);
    source.emit(event({ state: "error" }));

    expect(store.notifications.value).toMatchObject([{ status: "errored" }]);
  });

  it("dismisses an existing notification for active thread state", () => {
    const source = stream();
    const store = createNotificationsStore();

    bindNotificationsToThreadStream(source, store);
    source.emit(event({ state: "idle" }));
    source.emit(event({ state: "active" }));

    expect(store.notifications.value).toEqual([]);
  });

  it.each<RuntimeThreadState>(["archived", "closed", "compacted"])(
    "dismisses an existing notification for terminal %s thread state",
    (state) => {
      const source = stream();
      const store = createNotificationsStore();

      bindNotificationsToThreadStream(source, store);
      source.emit(event({ state: "idle" }));
      source.emit(event({ state }));

      expect(store.notifications.value).toEqual([]);
    },
  );

  it("unsubscribes cleanly", () => {
    const source = stream();
    const store = createNotificationsStore();
    const unsubscribe = bindNotificationsToThreadStream(source, store);

    expect(source.listenerCount()).toBe(1);

    unsubscribe();
    source.emit(event({ state: "idle" }));

    expect(source.listenerCount()).toBe(0);
    expect(store.notifications.value).toEqual([]);
  });
});
