# Remote Access Through Tailscale HTTPS Links

## Purpose

Keep local T3 Code worktrees reachable through stable Tailscale HTTPS URLs, including path-prefixed routes such as `/staging/`.

## Current Commits

- `10285aa14227fd1d727679429ec81e6bc2204b10` `feat(remote-access): manage Tailscale and routed browser access`

## Squash / Replay History

This is the base remote-access topic from the June 25, 2026 replay stack. Later hardening commits stay separate in the manifest until the topic is replayed and folded.

## Added Features

- Public path normalization for assets, APIs, WebSockets, and pairing URLs.
- Tailscale Serve endpoint validation and hosted route management.
- Live staging verification through the public HTTPS route.

## Added UI

- Settings surfaces show and copy hosted access and pairing URLs with the active route preserved.

## Added Server And Runtime Behavior

- Server static, API, and WebSocket handlers accept the configured public path prefix.
- Desktop exposure code owns mutable Tailscale Serve state and advertised endpoint selection.

## Added Tests

- Public path, advertised endpoint, Tailscale route, pairing URL, and staging public verifier coverage.

## Component Entrypoints

Pending legacy extraction:

- `apps/web/src/localTopics/remoteAccess/index.ts`
- `apps/server/src/localTopics/remoteAccess/index.ts`
- `packages/client-runtime/src/localTopics/remoteAccess/index.ts`

## Integration Points

- `apps/server/src/http.ts`
- `apps/web/src/publicPath.ts`
- `apps/desktop/src/backend/DesktopServerExposure.ts`
- `packages/shared/src/publicPath.ts`
- `packages/tailscale/src/tailscale.ts`

## Focused Implementation Snippets

`packages/shared/src/publicPath.ts`

```ts
normalizePublicPathPrefix(input);
joinPublicPath(prefix, route);
stripPublicPathPrefix(prefix, requestPath);
```

`apps/server/src/http.ts`

```ts
const publicPath = normalizePublicPathPrefix(config.publicPath);
serveStaticAssets(publicPath, request);
upgradeWebSocket(publicPath, request);
```

## Replay Notes

Replay this before dev-launch so launch profiles can consume normalized hosted endpoints. Keep route normalization changes in this topic when rebuilding.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- Extract remote-access helpers into package-local `localTopics/remoteAccess` modules and leave main files as thin wiring.
