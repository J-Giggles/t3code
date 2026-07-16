# Oversized Thread Detail Loading

## Purpose

Keep very large task histories loadable over remote HTTP connections without making sidebar startup fetch every task body.

## Current Commits

- `89dc1c114f21cd909a641f2fc1d4a8e95a1e1400` `fix(remote-access): load oversized thread details reliably`

## Squash / Replay History

This is the July 16 remote-access follow-up. Fold it into the remote-access topic during the next full replay.

## Added Features

- [x] Large JSON task-detail responses are gzip-compressed when the client supports it (`apps/server/src/localTopics/remoteAccess/httpCompression.ts`).
- [x] Selected-task HTTP loading allows measured remote transfers to finish before using the existing WebSocket fallback (`packages/client-runtime/src/localTopics/remoteAccess/threadDetailLoading.ts`).

## Added UI

- [x] Sidebar startup renders task summaries without preloading full task histories (`apps/web/src/localTopics/remoteAccess/threadDetailLoading.ts`, `apps/web/src/components/Sidebar.logic.ts`).

## Added Server And Runtime Behavior

- [x] Compression preserves existing encodings, skips small or non-JSON bodies, and keeps `Vary: Origin, Accept-Encoding` correct (`apps/server/src/localTopics/remoteAccess/httpCompression.ts`).
- [x] Gzip failures fall back to the original response and emit a structured warning (`apps/server/src/localTopics/remoteAccess/httpCompression.ts`).

## Added Tests

- [x] Server tests cover gzip round trips, negotiation opt-out, body thresholds, and `Vary` merging (`apps/server/src/localTopics/remoteAccess/httpCompression.test.ts`).
- [x] Sidebar tests prove default startup prewarming returns no task-detail IDs (`apps/web/src/components/Sidebar.logic.test.ts`).
- [x] A headed POM regression proves cold sidebar startup makes zero detail requests, then selection makes one gzip response and renders the task (`apps/desktop/e2e/localTopics/remoteAccess/ThreadDetailLoadingPage.ts`, `apps/desktop/e2e/specs/thread-detail-loading.spec.ts`).
- [x] Isolated production-size verification opens the 57 MB `Map kiosk copy sources` task through an 11.8 MB gzip response (`vp run dev:desktop`, `/api/orchestration/threads/:threadId`).

## Component Entrypoints

Componentization status: `complete`.

- `apps/server/src/localTopics/remoteAccess/httpCompression.ts` (source, internal)
- `apps/web/src/localTopics/remoteAccess/threadDetailLoading.ts` (source, internal)
- `packages/client-runtime/src/localTopics/remoteAccess/threadDetailLoading.ts` (source, internal)

## Integration Points

- `apps/server/src/server.ts`
- `apps/web/src/components/Sidebar.logic.ts`
- `packages/client-runtime/src/state/threadSnapshotHttp.ts`
- `apps/desktop/e2e/localTopics/remoteAccess/ThreadDetailLoadingPage.ts`
- `apps/desktop/e2e/support/seedChatLayoutState.ts`

## Focused Implementation Snippets

`apps/web/src/localTopics/remoteAccess/threadDetailLoading.ts`

```ts
export const SIDEBAR_THREAD_PREWARM_LIMIT = 0;
```

`packages/client-runtime/src/localTopics/remoteAccess/threadDetailLoading.ts`

```ts
export const DEFAULT_THREAD_SNAPSHOT_TIMEOUT_MS = 30_000;
```

## Replay Notes

Replay after remote-access if kept separate; otherwise fold the server, web, and client-runtime seams into the owning remote-access topic.

## Verification

- `vp check`
- `vp run typecheck`
- `vp test apps/server/src/localTopics/remoteAccess/httpCompression.test.ts apps/web/src/components/Sidebar.logic.test.ts`
- `vp run --filter @t3tools/desktop e2e:headed -- -- e2e/specs/thread-detail-loading.spec.ts`
- `vp run verify:staging-public`

## Known Follow-Up Work

- The isolated verification artifact is run-scoped and ignored by Git; repeat the headed cold-open check after a future replay changes HTTP or task projection behavior.
