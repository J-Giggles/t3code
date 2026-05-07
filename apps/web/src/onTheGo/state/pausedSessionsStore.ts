import type { ThreadId } from "@t3tools/contracts";

import type { PausedSession } from "../types";
import { createSignal, type Signal } from "./signal";

export interface PausedSessionsStore {
  readonly list: Signal<PausedSession[]>;
  save(session: PausedSession): Promise<void>;
  restore(threadId: ThreadId): Promise<PausedSession>;
  drop(threadId: ThreadId): Promise<void>;
}

export function createInMemoryPausedSessionsStore(): PausedSessionsStore {
  const list = createSignal<PausedSession[]>([]);

  return {
    list,
    async save(session) {
      const existingIndex = list.value.findIndex((item) => item.threadId === session.threadId);

      if (existingIndex === -1) {
        list.set([...list.value, session]);
        return;
      }

      const next = list.value.slice();
      next[existingIndex] = session;
      list.set(next);
    },
    async restore(threadId) {
      const session = list.value.find((item) => item.threadId === threadId);

      if (!session) {
        throw new Error(`No paused session found for thread ${threadId}`);
      }

      return session;
    },
    async drop(threadId) {
      list.set(list.value.filter((item) => item.threadId !== threadId));
    },
  };
}
