# Remote Access Through Tailscale HTTPS Links

## Purpose

Keep local T3 Code worktrees reachable through stable Tailscale HTTPS URLs, including path-prefixed routes such as `/staging/`.

## Current Commits

- `3d7656e8952955f87204e4c44c1354a5961811ba` `feat(remote-access): manage Tailscale and routed browser access`

## Squash / Replay History

This is the base remote-access topic from the June 25, 2026 replay stack. Later hardening commits stay separate in the manifest until the topic is replayed and folded.

## Added Features

- Public path normalization for assets, APIs, WebSockets, and pairing URLs.
- Tailscale Serve endpoint validation and hosted route management.
- User-managed Tailscale routes are validated as single segments, probed for availability, and blocked when reserved
  for another branch/worktree.
- Live staging verification through the public HTTPS route.

## Added UI

- Settings surfaces show and copy hosted access and pairing URLs with the active route preserved.
- Connections settings probe edited routes before apply and show available, owned, taken, and reserved-route states.

## Added Server And Runtime Behavior

- Server static, API, and WebSocket handlers accept the configured public path prefix.
- Server startup and desktop exposure check route availability before provisioning so they do not overwrite another
  backend's Tailscale Serve target.
- Desktop exposure code owns mutable Tailscale Serve state, advertised endpoint selection, and reserved `/main`,
  `/original`, and `/staging` ownership checks against actual git identity.

## Added Tests

- Public path, single-segment route validation, route availability, reserved ownership, pairing URL, and staging public
  verifier coverage.

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
