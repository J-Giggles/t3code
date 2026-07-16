// Compression keeps large thread snapshots bounded in normal operation, while
// this timeout leaves enough room for remote hosts without prematurely
// duplicating the same snapshot over the WebSocket fallback.
export const DEFAULT_THREAD_SNAPSHOT_TIMEOUT_MS = 30_000;
