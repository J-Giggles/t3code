import type { ThreadId } from "@t3tools/contracts";

import type { PausedSession } from "../types";
import { createInMemoryPausedSessionsStore, type PausedSessionsStore } from "./pausedSessionsStore";

const BACKUP_KEY = "on-the-go:paused-backup";

export interface PausedSessionsTransport {
  loadAll(): Promise<PausedSession[]>;
  upsert(session: PausedSession): Promise<void>;
  remove(threadId: ThreadId): Promise<void>;
}

export async function createPersistedPausedSessionsStore(
  transport: PausedSessionsTransport,
): Promise<PausedSessionsStore> {
  const store = createInMemoryPausedSessionsStore();
  const transportQueues = new Map<string, Promise<void>>();
  let initialSessions: PausedSession[];
  try {
    initialSessions = await transport.loadAll();
  } catch {
    initialSessions = [];
  }
  const backedUpSessions = readBackupPausedSessions();
  const initialSessionsByThread = new Map<string, PausedSession>();

  for (const session of initialSessions) {
    initialSessionsByThread.set(String(session.threadId), session);
  }
  for (const session of backedUpSessions) {
    const key = String(session.threadId);
    const persisted = initialSessionsByThread.get(key);
    if (persisted === undefined || session.pausedAt > persisted.pausedAt) {
      initialSessionsByThread.set(key, session);
    }
  }
  for (const session of initialSessionsByThread.values()) {
    await store.save(session);
  }

  return {
    list: store.list,
    async save(session) {
      await store.save(session);
      backupPausedSession(session);
      await enqueueTransport(session.threadId, async () => {
        try {
          await transport.upsert(session);
        } catch {
          // The local backup mirrors the latest in-memory save for reload recovery.
        }
      });
    },
    restore(threadId) {
      return store.restore(threadId);
    },
    async drop(threadId) {
      const droppedSession = store.list.value.find((session) => session.threadId === threadId);
      await store.drop(threadId);
      await enqueueTransport(threadId, async () => {
        try {
          await transport.remove(threadId);
        } catch {
          // Drop already updated local state. Persistence removal is best-effort.
        }
        const hasReplacement = store.list.value.some((session) => session.threadId === threadId);
        if (!hasReplacement) {
          removeBackupPausedSession(threadId, droppedSession);
        }
      });
    },
  };

  async function enqueueTransport(
    threadId: ThreadId,
    operation: () => Promise<void>,
  ): Promise<void> {
    const key = String(threadId);
    const previous = transportQueues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    transportQueues.set(key, next);

    try {
      await next;
    } finally {
      if (transportQueues.get(key) === next) {
        transportQueues.delete(key);
      }
    }
  }
}

function readBackupPausedSessions(): PausedSession[] {
  const storage = readLocalStorage();

  if (!storage) {
    return [];
  }

  try {
    const existing = JSON.parse(storage.getItem(BACKUP_KEY) ?? "{}") as Record<
      string,
      PausedSession
    >;
    return Object.values(existing);
  } catch {
    return [];
  }
}

function removeBackupPausedSession(threadId: ThreadId, droppedSession?: PausedSession): void {
  const storage = readLocalStorage();

  if (!storage) {
    return;
  }

  try {
    const existing = JSON.parse(storage.getItem(BACKUP_KEY) ?? "{}") as Record<
      string,
      PausedSession
    >;
    const backedUpSession = existing[String(threadId)];
    if (
      droppedSession !== undefined &&
      backedUpSession !== undefined &&
      backedUpSession.pausedAt > droppedSession.pausedAt
    ) {
      return;
    }
    delete existing[String(threadId)];
    storage.setItem(BACKUP_KEY, JSON.stringify(existing));
  } catch {
    // Backup cleanup should not mask the successful in-memory drop.
  }
}

function backupPausedSession(session: PausedSession): void {
  const storage = readLocalStorage();

  if (!storage) {
    return;
  }

  try {
    const existing = JSON.parse(storage.getItem(BACKUP_KEY) ?? "{}") as Record<
      string,
      PausedSession
    >;
    existing[String(session.threadId)] = session;
    storage.setItem(BACKUP_KEY, JSON.stringify(existing));
  } catch {
    // Backup should not mask the successful in-memory pause.
  }
}

function readLocalStorage(): Storage | null {
  if (typeof globalThis.localStorage === "undefined") {
    return null;
  }

  if (typeof globalThis.localStorage.setItem !== "function") {
    return null;
  }

  return globalThis.localStorage;
}
