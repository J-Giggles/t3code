# Remote Access Through Tailscale HTTPS Links

## Purpose

Keep local T3 Code worktrees reachable through stable Tailscale HTTPS URLs, including path-prefixed routes such as `/staging/`.

## Current Commits

- `3d7656e8952955f87204e4c44c1354a5961811ba` `feat(remote-access): manage Tailscale and routed browser access`

## Squash / Replay History

This is the base remote-access topic from the June 25, 2026 replay stack. Later hardening commits stay separate in the manifest until the topic is replayed and folded.

## Added Features

- [x] Public path normalization covers assets, APIs, WebSockets, and pairing URLs (`packages/shared/src/localTopics/remoteAccess/publicPath.ts`, `apps/server/src/localTopics/remoteAccess/httpRouting.ts`).
- [x] Tailscale Serve endpoint validation and hosted route management are centralized (`packages/tailscale/src/tailscale.ts`, `apps/desktop/src/localTopics/remoteAccess/exposure.ts`).
- [x] User-managed Tailscale routes are validated as single segments and probed before use (`packages/shared/src/localTopics/remoteAccess/publicPath.ts`, `packages/tailscale/src/tailscale.ts`).
- [x] Live staging verification runs through the public HTTPS route (`apps/desktop/scripts/verify-staging-public.mjs`, `vp run verify:staging-public`).

## Added UI

- [x] Settings surfaces show and copy hosted access and pairing URLs with the active route preserved (`apps/web/src/components/settings/pairingUrls.ts`, `apps/web/src/publicPath.ts`).
- [x] Connections settings probes edited routes and displays available, owned, taken, and reserved states (`apps/web/src/components/settings/ConnectionsSettings.tsx`, `packages/shared/src/localTopics/remoteAccess/publicPath.ts`).

## Added Server And Runtime Behavior

- [x] Server static, API, and WebSocket handlers accept the configured public path prefix (`apps/server/src/localTopics/remoteAccess/httpRouting.ts`, `apps/server/src/http.ts`).
- [x] Server startup and desktop exposure avoid overwriting another backend Tailscale Serve target (`apps/desktop/src/localTopics/remoteAccess/exposure.ts`, `apps/desktop/src/backend/DesktopServerExposure.ts`).
- [x] Desktop exposure owns mutable Tailscale Serve state and advertised endpoint selection (`apps/desktop/src/localTopics/remoteAccess/exposure.ts`, `apps/desktop/src/backend/tailscaleEndpointProvider.ts`).

## Added Tests

- [x] Public path, route validation, route availability, reserved ownership, pairing URL, and staging public verifier coverage protect this topic (`packages/shared/src/publicPath.test.ts`, `packages/tailscale/src/tailscale.test.ts`, `apps/web/src/components/settings/pairingUrls.test.ts`, `apps/desktop/src/backend/DesktopServerExposure.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `packages/shared/src/localTopics/remoteAccess/publicPath.ts` (source, facade)
- `apps/web/src/localTopics/remoteAccess/publicPath.ts` (source, facade)
- `apps/server/src/localTopics/remoteAccess/httpRouting.ts` (source, internal)
- `apps/desktop/src/localTopics/remoteAccess/exposure.ts` (source, internal)

## Integration Points

- `apps/server/src/http.ts`
- `apps/web/src/publicPath.ts`
- `apps/desktop/src/backend/DesktopServerExposure.ts`
- `packages/shared/src/publicPath.ts`
- `packages/tailscale/src/tailscale.ts`

## Focused Implementation Snippets

`packages/shared/src/localTopics/remoteAccess/publicPath.ts`

```ts
const LOCAL_TAILSCALE_PATH_PREFIX_PATTERN =
  /^(\/(?:main|staging|original|t3code(?:-[a-z0-9][a-z0-9-]*)?))(?:\/|$)/u;
export const DEFAULT_PUBLIC_PATH_PREFIX = "/t3code";
export function normalizePublicPathSegment(value: string | null | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized && normalized.length > 0 ? normalized : undefined;
}
export function resolveWorkspacePublicPathPrefix(input: {
```

`packages/tailscale/src/tailscale.ts`

```ts
export async function readTailscaleServeRouteAvailability(
  input: Readonly<TailscaleServeRouteAvailabilityInput>,
): Promise<TailscaleServeRouteAvailability> {
```

`apps/web/src/localTopics/remoteAccess/publicPath.ts`

```ts
import {
  joinPublicPathPrefix,
  normalizePublicPathPrefix,
  readLocalPublicPathPrefixFromPathname,
} from "@t3tools/shared/publicPath";
const PUBLIC_PATH_PREFIX_META_SELECTOR = 'meta[name="t3code-public-path-prefix"]';
interface PublicPathEnv {
  readonly VITE_T3CODE_PUBLIC_ORIGIN?: string | undefined;
  readonly VITE_T3CODE_PUBLIC_BASE_PATH?: string | undefined;
  readonly VITE_T3CODE_PUBLIC_BASE_URL?: string | undefined;
}
export function readPublicPathPrefixFromPathname(pathname: string): string | undefined {
```

## Replay Notes

Replay this before dev-launch so launch profiles can consume normalized hosted endpoints. Keep route normalization,
route availability probing, Settings route status UI, server no-overwrite checks, and reserved-route ownership checks
in this topic when rebuilding.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
