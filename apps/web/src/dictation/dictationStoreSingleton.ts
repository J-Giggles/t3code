import { createDictationStore, type DictationStore } from "./dictationStore.ts";

/**
 * Process-wide singleton dictation store. There is exactly one dictation
 * session per browser session (the WebSocket multiplexes a single session at
 * a time), so a single store instance is sufficient and avoids prop-drilling
 * across the composer + keybinding matcher + UI shell.
 *
 * Tests can call {@link resetDictationStoreForTests} to reset state between
 * runs.
 */
let store: DictationStore = createDictationStore();

export function getDictationStore(): DictationStore {
  return store;
}

export function resetDictationStoreForTests(): void {
  store = createDictationStore();
}
