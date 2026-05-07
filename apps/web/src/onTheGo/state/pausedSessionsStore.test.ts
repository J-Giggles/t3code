import type { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import type { Notification, PausedSession } from "../types";
import { createInMemoryPausedSessionsStore } from "./pausedSessionsStore";

function threadId(value: string): ThreadId {
  return value as ThreadId;
}

function notification(threadId: ThreadId): Notification {
  return {
    threadId,
    threadTitle: `Thread ${threadId}`,
    status: "awaiting",
    agentLastMessage: "Agent message",
    userLastMessage: "User message",
    updatedAt: 1,
  };
}

function pausedSession(
  threadId: ThreadId,
  options: Partial<Omit<PausedSession, "threadId" | "notification">> = {},
): PausedSession {
  return {
    threadId,
    notification: notification(threadId),
    history: [{ role: "assistant", text: "Ready for review.", at: 1 }],
    pausedAt: 1,
    pauseReason: "manual",
    ...options,
  };
}

describe("PausedSessionsStore", () => {
  it("starts empty", () => {
    const store = createInMemoryPausedSessionsStore();

    expect(store.list.value).toEqual([]);
  });

  it("saves sessions in insertion order", async () => {
    const store = createInMemoryPausedSessionsStore();
    const first = pausedSession(threadId("thread-1"));
    const second = pausedSession(threadId("thread-2"));

    await store.save(first);
    await store.save(second);

    expect(store.list.value).toEqual([first, second]);
  });

  it("overwrites an existing session for the same threadId", async () => {
    const store = createInMemoryPausedSessionsStore();
    const original = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "Original", at: 1 }],
      pausedAt: 1,
    });
    const replacement = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "Replacement", at: 2 }],
      pausedAt: 2,
    });

    await store.save(original);
    await store.save(replacement);

    expect(store.list.value).toEqual([replacement]);
  });

  it("restores a saved session", async () => {
    const store = createInMemoryPausedSessionsStore();
    const session = pausedSession(threadId("thread-1"));

    await store.save(session);

    await expect(store.restore(threadId("thread-1"))).resolves.toEqual(session);
  });

  it("throws when restoring a missing session", async () => {
    const store = createInMemoryPausedSessionsStore();

    await expect(store.restore(threadId("missing"))).rejects.toThrow(
      "No paused session found for thread missing",
    );
  });

  it("drops sessions by threadId", async () => {
    const store = createInMemoryPausedSessionsStore();
    const first = pausedSession(threadId("thread-1"));
    const second = pausedSession(threadId("thread-2"));

    await store.save(first);
    await store.save(second);
    await store.drop(threadId("thread-1"));

    expect(store.list.value).toEqual([second]);
  });
});
