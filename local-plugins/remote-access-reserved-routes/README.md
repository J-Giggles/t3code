# Authoritative Reserved Staging Routes

## Purpose

Ensure reserved routes such as `/staging/`, `/main/`, and `/original/` come from launcher-owned identity instead of stale persisted settings.

## Current Commits

- `a49f0ee77fabbfd2f46b2adb7ef6206595f57a85` `fix(remote-access): keep reserved staging routes authoritative`

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

Pending legacy extraction:

- `apps/web/src/localTopics/remoteAccessReservedRoutes/index.ts`
- `apps/desktop/src/localTopics/remoteAccessReservedRoutes/index.ts`

## Integration Points

- `apps/desktop/src/backend/DesktopServerExposure.ts`
- `apps/web/src/publicPath.ts`
- `packages/shared/src/publicPath.ts`

## Focused Implementation Snippets

`apps/desktop/src/backend/DesktopServerExposure.ts`

```ts
const launcherRoute = readLauncherReservedRoute(env);
const persistedRoute = readDesktopSettingsRoute();
return launcherRoute ?? persistedRoute;
```

`apps/web/src/publicPath.ts`

```ts
resolveActivePublicPath({ launcherPath, runtimePath });
normalizePublicPathPrefix(activePath);
```

## Replay Notes

When rebuilding, fold this with remote-access unless replaying current staging history as-is.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- Move reserved-route precedence helpers into the remote-access topic module.
