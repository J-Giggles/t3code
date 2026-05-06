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
  const initialSessions = await transport.loadAll();

  for (const session of initialSessions) {
    await store.save(session);
  }

  return {
    list: store.list,
    async save(session) {
      await store.save(session);

      try {
        await transport.upsert(session);
      } catch {
        backupPausedSession(session);
      }
    },
    restore(threadId) {
      return store.restore(threadId);
    },
    async drop(threadId) {
      await store.drop(threadId);

      try {
        await transport.remove(threadId);
      } catch {
        // Drop already updated local state. Persistence removal is best-effort.
      }
    },
  };
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
