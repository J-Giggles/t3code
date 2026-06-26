# Staging Tailnet Path Serving

## Purpose

Serve staging assets, API routes, and WebSocket paths correctly when the public tailnet URL includes `/staging/`.

## Current Commits

- `b840026a3b637db965a061c4db1eb5304d0e0179` `fix(remote-access): serve staging tailnet paths`

## Squash / Replay History

This is a June 26 remote-access follow-up. Fold it into the base remote-access topic during the next full replay.

## Added Features

- Tailnet path handling for staging-prefixed public requests.

## Added UI

- No direct UI beyond fixing public staging load behavior.

## Added Server And Runtime Behavior

- Server routes accept staging-prefixed static, metadata, API, and WebSocket requests.

## Added Tests

- Focused prefixed route tests and public staging verifier coverage.

## Component Entrypoints

Pending legacy extraction:

- `apps/server/src/localTopics/remoteAccessStagingTailnetPaths/index.ts`
- `apps/web/src/localTopics/remoteAccessStagingTailnetPaths/index.ts`

## Integration Points

- `apps/server/src/http.ts`
- `apps/web/src/localApi.ts`
- `packages/shared/src/publicPath.ts`

## Focused Implementation Snippets

`apps/server/src/http.ts`

```ts
const strippedPath = stripPublicPathPrefix(publicPath, request.url);
routeStaticAsset(strippedPath);
routeApiRequest(strippedPath);
```

`apps/web/src/localApi.ts`

```ts
const apiUrl = joinPublicPath(publicPath, "/api/local");
const wsUrl = joinPublicPath(publicPath, "/ws");
```

## Replay Notes

Replay after the base remote-access and dev-launch topics if kept as a separate commit.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- Extract prefixed-route server helpers into the remote-access server topic module.
