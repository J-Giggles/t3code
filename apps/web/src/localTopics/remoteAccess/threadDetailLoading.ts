// Thread detail snapshots can contain the complete activity history and grow to
// tens of megabytes. Keep sidebar rendering shell-only; the selected route owns
// loading its thread detail.
export const SIDEBAR_THREAD_PREWARM_LIMIT = 0;
