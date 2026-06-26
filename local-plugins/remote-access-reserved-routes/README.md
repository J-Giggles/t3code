# Authoritative Reserved Staging Routes

## Purpose

Ensure reserved routes such as `/staging/`, `/main/`, and `/original/` come from launcher-owned identity instead of stale persisted settings.

## Current Commits

- `c57b5caf3cd50a915901994bad7f183009ff0cdf` `fix(remote-access): keep reserved staging routes authoritative`

## Squash / Replay History

This is a June 26 remote-access follow-up. Fold it into the base remote-access topic during the next full replay.

## Added Features

- Reserved route precedence over persisted desktop exposure settings.

## Added UI

- Settings and copied URLs reflect the launcher-owned route.

## Added Server And Runtime Behavior

- Hosted route selection avoids doubled or cross-worktree prefixes.

## Added Tests

- Focused route precedence and public path tests.

## Component Entrypoints

Componentization status: `complete`.

- `packages/shared/src/localTopics/remoteAccess/reservedRoutes.ts` (source, internal)
- `apps/web/src/localTopics/remoteAccess/reservedRoutes.ts` (source, internal)
- `apps/desktop/src/localTopics/remoteAccess/reservedRoutes.ts` (source, internal)

## Integration Points

- `apps/desktop/src/backend/DesktopServerExposure.ts`
- `apps/web/src/publicPath.ts`
- `packages/shared/src/publicPath.ts`

## Focused Implementation Snippets

`packages/shared/src/localTopics/remoteAccess/reservedRoutes.ts`

```ts
export {
  normalizePublicPathPrefix,
  readLocalPublicPathPrefixFromPathname,
  resolveWorkspacePublicPathPrefix,
} from "./publicPath.ts";
```

`apps/web/src/localTopics/remoteAccess/reservedRoutes.ts`

```ts
export {
  readBrowserPublicPathPrefix,
  readPublicPathPrefixFromPathname,
  resolveBrowserPublicBaseUrl,
  resolveBrowserPublicPath,
} from "./publicPath.ts";
```

## Replay Notes

When rebuilding, fold this with remote-access unless replaying current staging history as-is.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
