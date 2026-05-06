import type { ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Notification, PausedSession } from "../types";
import {
  createPersistedPausedSessionsStore,
  type PausedSessionsTransport,
} from "./persistedPausedSessionsStore";

const BACKUP_KEY = "on-the-go:paused-backup";

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

function fakeTransport(initial: PausedSession[] = []): PausedSessionsTransport {
  return {
    loadAll: vi.fn(async () => initial),
    upsert: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
}

function stubLocalStorage(): Storage {
  const items = new Map<string, string>();

  return {
    get length() {
      return items.size;
    },
    clear: vi.fn(() => items.clear()),
    getItem: vi.fn((key: string) => items.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(items.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => {
      items.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      items.set(key, value);
    }),
  };
}

describe("createPersistedPausedSessionsStore", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", stubLocalStorage());
    localStorage.removeItem(BACKUP_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(BACKUP_KEY);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("hydrates sessions from transport on construction", async () => {
    const first = pausedSession(threadId("thread-1"));
    const second = pausedSession(threadId("thread-2"));
    const transport = fakeTransport([first, second]);

    const store = await createPersistedPausedSessionsStore(transport);

    expect(transport.loadAll).toHaveBeenCalledOnce();
    expect(store.list.value).toEqual([first, second]);
  });

  it("writes through on save", async () => {
    const transport = fakeTransport();
    const store = await createPersistedPausedSessionsStore(transport);
    const session = pausedSession(threadId("thread-1"));

    await store.save(session);

    expect(store.list.value).toEqual([session]);
    expect(transport.upsert).toHaveBeenCalledWith(session);
  });

  it("writes through on drop", async () => {
    const session = pausedSession(threadId("thread-1"));
    const transport = fakeTransport([session]);
    const store = await createPersistedPausedSessionsStore(transport);

    await store.drop(threadId("thread-1"));

    expect(store.list.value).toEqual([]);
    expect(transport.remove).toHaveBeenCalledWith(threadId("thread-1"));
  });

  it("keeps drop best-effort when transport remove fails", async () => {
    const session = pausedSession(threadId("thread-1"));
    const transport = fakeTransport([session]);
    vi.mocked(transport.remove).mockRejectedValueOnce(new Error("offline"));
    const store = await createPersistedPausedSessionsStore(transport);

    await expect(store.drop(threadId("thread-1"))).resolves.toBeUndefined();

    expect(store.list.value).toEqual([]);
  });

  it("restores hydrated sessions through the in-memory store", async () => {
    const session = pausedSession(threadId("thread-1"));
    const transport = fakeTransport([session]);
    const store = await createPersistedPausedSessionsStore(transport);

    await expect(store.restore(threadId("thread-1"))).resolves.toEqual(session);
  });

  it("backs up failed saves to localStorage and keeps the in-memory list updated", async () => {
    const transport = fakeTransport();
    vi.mocked(transport.upsert).mockRejectedValueOnce(new Error("offline"));
    const store = await createPersistedPausedSessionsStore(transport);
    const session = pausedSession(threadId("thread-1"));

    await expect(store.save(session)).resolves.toBeUndefined();

    expect(store.list.value).toEqual([session]);
    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}")).toEqual({
      "thread-1": session,
    });
  });
});
