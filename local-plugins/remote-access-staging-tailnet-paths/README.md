# Staging Tailnet Path Serving

## Purpose

Serve staging assets, API routes, and WebSocket paths correctly when the public tailnet URL includes `/staging/`.

## Current Commits

- `f95d294840b90a9c7d7e6bb92b6c2406f35d6c11` `fix(remote-access): serve staging tailnet paths`

## Squash / Replay History

This is a June 26 remote-access follow-up. Fold it into the base remote-access topic during the next full replay.

## Added Features

- [x] Tailnet path handling supports staging-prefixed public requests (`packages/shared/src/localTopics/remoteAccess/stagingTailnetPaths.ts`, `/staging/`).
- [x] Browser local API paths preserve the active public prefix (`apps/web/src/localTopics/remoteAccess/stagingTailnetPaths.ts`, `apps/web/src/localApi.ts`).

## Added UI

- [x] Public staging load behavior works through the visible hosted route (`apps/web/src/localTopics/remoteAccess/stagingTailnetPaths.ts`, `/staging/`).

## Added Server And Runtime Behavior

- [x] Server routes accept staging-prefixed static and metadata requests (`apps/server/src/localTopics/remoteAccess/stagingTailnetPaths.ts`, `apps/server/src/http.ts`).
- [x] Server routes accept staging-prefixed API and WebSocket requests (`apps/server/src/localTopics/remoteAccess/stagingTailnetPaths.ts`, `/staging/ws`).

## Added Tests

- [x] Prefixed route behavior and public staging coverage are verified by focused tests and the public verifier (`packages/shared/src/publicPath.test.ts`, `apps/desktop/scripts/verify-staging-public.mjs`).

## Component Entrypoints

Componentization status: `complete`.

- `packages/shared/src/localTopics/remoteAccess/stagingTailnetPaths.ts` (source, internal)
- `apps/server/src/localTopics/remoteAccess/stagingTailnetPaths.ts` (source, internal)
- `apps/web/src/localTopics/remoteAccess/stagingTailnetPaths.ts` (source, internal)

## Integration Points

- `apps/server/src/http.ts`
- `apps/web/src/localApi.ts`
- `packages/shared/src/publicPath.ts`

## Focused Implementation Snippets

`packages/shared/src/localTopics/remoteAccess/stagingTailnetPaths.ts`

```ts
export {
  joinPublicPathPrefix,
  normalizePublicPathPrefix,
  readLocalPublicPathPrefixFromPathname,
} from "./publicPath.ts";
```

`apps/server/src/localTopics/remoteAccess/stagingTailnetPaths.ts`

```ts
export {
  resolveDevRedirectUrl,
  resolveDevRequestUrl,
  stripPublicPathPrefixFromUrl,
} from "./httpRouting.ts";
```

## Replay Notes

Replay after the base remote-access and dev-launch topics if kept as a separate commit.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
