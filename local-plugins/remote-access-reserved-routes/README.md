# Authoritative Reserved Staging Routes

## Purpose

Ensure reserved routes such as `/staging/`, `/main/`, and `/original/` come from launcher-owned identity instead of stale persisted settings.

## Current Commits

- `c57b5caf3cd50a915901994bad7f183009ff0cdf` `fix(remote-access): keep reserved staging routes authoritative`

## Squash / Replay History

This is a June 26 remote-access follow-up. Fold it into the base remote-access topic during the next full replay.

## Added Features

- [x] Reserved route precedence overrides stale persisted desktop exposure settings (`apps/desktop/src/localTopics/remoteAccess/reservedRoutes.ts`, `apps/desktop/src/backend/DesktopServerExposure.ts`).
- [x] Reserved `/main`, `/original`, and `/staging` ownership is checked against actual branch/worktree identity (`packages/shared/src/localTopics/remoteAccess/reservedRoutes.ts`).

## Added UI

- [x] Settings and copied URLs reflect the launcher-owned route after reserved-route resolution (`apps/web/src/localTopics/remoteAccess/reservedRoutes.ts`, `apps/web/src/publicPath.ts`).

## Added Server And Runtime Behavior

- [x] Hosted route selection avoids doubled or cross-worktree prefixes (`packages/shared/src/localTopics/remoteAccess/reservedRoutes.ts`, `apps/web/src/localTopics/remoteAccess/reservedRoutes.ts`).
- [x] Desktop exposure refuses route ownership when the actual checkout does not match the reservation (`apps/desktop/src/localTopics/remoteAccess/reservedRoutes.ts`, `apps/desktop/src/backend/DesktopServerExposure.ts`).

## Added Tests

- [x] Focused route precedence and public path behavior are covered by shared/web/desktop route tests (`packages/shared/src/publicPath.test.ts`, `apps/web/src/publicPath.test.ts`, `apps/desktop/src/backend/DesktopServerExposure.test.ts`).

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
