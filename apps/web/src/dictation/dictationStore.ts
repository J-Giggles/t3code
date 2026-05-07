export type DictationState =
  | { state: "idle"; sessionId: null }
  | { state: "requesting-permission"; sessionId: null }
  | { state: "recording"; sessionId: string; modelLabel: string }
  | { state: "stopping"; sessionId: string }
  | { state: "error"; reason: string };

export type DictationEvent =
  | { type: "request-start" }
  | { type: "session-started"; sessionId: string; modelLabel: string }
  | { type: "permission-denied" }
  | { type: "request-stop"; reason: string }
  | { type: "session-stopped" }
  | { type: "backend-error"; code: string; message: string };

const INITIAL: DictationState = { state: "idle", sessionId: null };

export function reduce(state: DictationState, event: DictationEvent): DictationState {
  switch (event.type) {
    case "request-start":
      return state.state === "idle" || state.state === "error"
        ? { state: "requesting-permission", sessionId: null }
        : state;
    case "session-started":
      return state.state === "requesting-permission"
        ? {
            state: "recording",
            sessionId: event.sessionId,
            modelLabel: event.modelLabel,
          }
        : state;
    case "permission-denied":
      return state.state === "requesting-permission"
        ? { state: "error", reason: "Microphone permission denied." }
        : state;
    case "request-stop":
      return state.state === "recording"
        ? { state: "stopping", sessionId: state.sessionId }
        : state;
    case "session-stopped":
      return state.state === "stopping" ? INITIAL : state;
    case "backend-error":
      return { state: "error", reason: event.message };
  }
}

export interface DictationStore {
  read(): DictationState;
  dispatch(event: DictationEvent): void;
  subscribe(listener: (state: DictationState) => void): () => void;
}

export function createDictationStore(): DictationStore {
  let state: DictationState = INITIAL;
  const listeners = new Set<(s: DictationState) => void>();
  return {
    read: () => state,
    dispatch: (event) => {
      const next = reduce(state, event);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
