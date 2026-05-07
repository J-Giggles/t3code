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

  it("hydrates backed-up sessions that are missing from transport", async () => {
    const persisted = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "persisted", at: 1 }],
    });
    const backedUp = pausedSession(threadId("thread-2"), {
      history: [{ role: "assistant", text: "backed up", at: 2 }],
    });
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ "thread-2": backedUp }));
    const transport = fakeTransport([persisted]);

    const store = await createPersistedPausedSessionsStore(transport);

    expect(store.list.value).toEqual([persisted, backedUp]);
  });

  it("hydrates backed-up sessions when transport load fails", async () => {
    const backedUp = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "backed up", at: 1 }],
    });
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ "thread-1": backedUp }));
    const transport = fakeTransport();
    vi.mocked(transport.loadAll).mockRejectedValueOnce(new Error("offline"));

    const store = await createPersistedPausedSessionsStore(transport);

    expect(store.list.value).toEqual([backedUp]);
  });

  it("lets transport sessions win over stale backup entries for the same thread", async () => {
    const persisted = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "persisted", at: 2 }],
      pausedAt: 2,
    });
    const backedUp = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "stale backup", at: 1 }],
      pausedAt: 1,
    });
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ "thread-1": backedUp }));
    const transport = fakeTransport([persisted]);

    const store = await createPersistedPausedSessionsStore(transport);

    expect(store.list.value).toEqual([persisted]);
  });

  it("lets newer backup entries win over older transport sessions for the same thread", async () => {
    const persisted = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "older persisted", at: 1 }],
      pausedAt: 1,
    });
    const backedUp = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "newer backup", at: 2 }],
      pausedAt: 2,
    });
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ "thread-1": backedUp }));
    const transport = fakeTransport([persisted]);

    const store = await createPersistedPausedSessionsStore(transport);

    expect(store.list.value).toEqual([backedUp]);
  });

  it("writes backup immediately when saving before slow transport settles", async () => {
    let resolveUpsert!: () => void;
    const transport = fakeTransport();
    vi.mocked(transport.upsert).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveUpsert = resolve;
        }),
    );
    const store = await createPersistedPausedSessionsStore(transport);
    const session = pausedSession(threadId("thread-1"));

    const save = store.save(session);
    await vi.waitFor(() => {
      expect(transport.upsert).toHaveBeenCalledOnce();
    });

    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}")).toEqual({
      "thread-1": session,
    });

    resolveUpsert();
    await save;
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

  it("removes dropped sessions from the localStorage backup", async () => {
    const transport = fakeTransport();
    vi.mocked(transport.upsert).mockRejectedValueOnce(new Error("offline"));
    const store = await createPersistedPausedSessionsStore(transport);
    const session = pausedSession(threadId("thread-1"));

    await store.save(session);
    await store.drop(threadId("thread-1"));

    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}")).toEqual({});
  });

  it("keeps backup cleanup ordered after a failed in-flight save", async () => {
    let rejectUpsert!: (error: Error) => void;
    const transport = fakeTransport();
    vi.mocked(transport.upsert).mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectUpsert = reject;
        }),
    );
    const store = await createPersistedPausedSessionsStore(transport);
    const session = pausedSession(threadId("thread-1"));

    const save = store.save(session);
    await vi.waitFor(() => {
      expect(transport.upsert).toHaveBeenCalledOnce();
    });
    const drop = store.drop(threadId("thread-1"));

    rejectUpsert(new Error("offline"));
    await save;
    await drop;

    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}")).toEqual({});
  });

  it("keeps backup while a drop remove is pending", async () => {
    let resolveRemove!: () => void;
    const session = pausedSession(threadId("thread-1"));
    const transport = fakeTransport([session]);
    vi.mocked(transport.remove).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve;
        }),
    );
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ "thread-1": session }));
    const store = await createPersistedPausedSessionsStore(transport);

    const drop = store.drop(threadId("thread-1"));
    await vi.waitFor(() => {
      expect(transport.remove).toHaveBeenCalledOnce();
    });

    expect(store.list.value).toEqual([]);
    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}")).toEqual({
      "thread-1": session,
    });

    resolveRemove();
    await drop;
    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}")).toEqual({});
  });

  it("updates an older backup after a newer successful save", async () => {
    const older = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "older backup", at: 1 }],
      pausedAt: 1,
    });
    const newer = pausedSession(threadId("thread-1"), {
      history: [{ role: "assistant", text: "newer persisted", at: 2 }],
      pausedAt: 2,
    });
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ "thread-1": older }));
    const transport = fakeTransport();
    const store = await createPersistedPausedSessionsStore(transport);

    await store.save(newer);

    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}")).toEqual({
      "thread-1": newer,
    });
  });

  it("serializes same-thread saves so an older delayed upsert cannot overwrite a newer pause", async () => {
    let resolveFirstUpsert!: () => void;
    const persisted: Record<string, PausedSession | undefined> = {};
    const transport = fakeTransport();
    vi.mocked(transport.upsert)
      .mockImplementationOnce(
        (session) =>
          new Promise<void>((resolve) => {
            resolveFirstUpsert = () => {
              persisted[String(session.threadId)] = session;
              resolve();
            };
          }),
      )
      .mockImplementationOnce(async (session) => {
        persisted[String(session.threadId)] = session;
      });
    const store = await createPersistedPausedSessionsStore(transport);
    const older = pausedSession(threadId("thread-1"), {
      history: [{ role: "user", text: "older pause", at: 1 }],
      pausedAt: 1,
    });
    const newer = pausedSession(threadId("thread-1"), {
      history: [{ role: "user", text: "newer pause", at: 2 }],
      pausedAt: 2,
    });

    const olderSave = store.save(older);
    await vi.waitFor(() => {
      expect(transport.upsert).toHaveBeenCalledTimes(1);
    });
    const newerSave = store.save(newer);
    await Promise.resolve();

    expect(store.list.value).toEqual([newer]);
    expect(transport.upsert).toHaveBeenCalledTimes(1);

    resolveFirstUpsert();
    await olderSave;
    await newerSave;

    expect(transport.upsert).toHaveBeenCalledTimes(2);
    expect(persisted["thread-1"]).toEqual(newer);
  });

  it("serializes same-thread drop before save so a delayed remove cannot delete a newer pause", async () => {
    let resolveRemove!: () => void;
    const initial = pausedSession(threadId("thread-1"), {
      history: [{ role: "user", text: "initial pause", at: 1 }],
    });
    const persisted: Record<string, PausedSession | undefined> = { "thread-1": initial };
    const transport = fakeTransport([initial]);
    vi.mocked(transport.remove).mockImplementationOnce(
      (removedThreadId) =>
        new Promise<void>((resolve) => {
          resolveRemove = () => {
            delete persisted[String(removedThreadId)];
            resolve();
          };
        }),
    );
    vi.mocked(transport.upsert).mockImplementationOnce(async (session) => {
      persisted[String(session.threadId)] = session;
    });
    const store = await createPersistedPausedSessionsStore(transport);
    const newer = pausedSession(threadId("thread-1"), {
      history: [{ role: "user", text: "newer pause", at: 2 }],
      pausedAt: 2,
    });

    const drop = store.drop(threadId("thread-1"));
    await vi.waitFor(() => {
      expect(transport.remove).toHaveBeenCalledOnce();
    });
    const save = store.save(newer);
    await Promise.resolve();

    expect(store.list.value).toEqual([newer]);
    expect(transport.upsert).not.toHaveBeenCalled();

    resolveRemove();
    await drop;
    await save;

    expect(transport.upsert).toHaveBeenCalledWith(newer);
    expect(persisted["thread-1"]).toEqual(newer);
    expect(JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}")).toEqual({
      "thread-1": newer,
    });
  });
});
