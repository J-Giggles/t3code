# Canonical Staging Asset Prefixes

## Purpose

Prevent duplicated staging prefixes in generated asset URLs and static HTML responses.

## Current Commits

- `05fd01bb211cc34d3fd1ac5ec0c05fe5075ab85d` `fix(remote-access): canonicalize staging asset prefixes`

## Squash / Replay History

This is a June 26 remote-access follow-up. Fold it into the base remote-access topic during the next full replay.

## Added Features

- Canonical asset prefix rewriting for staging public paths.

## Added UI

- No direct UI beyond fixing blank or partially loaded staging pages.

## Added Server And Runtime Behavior

- Static shell HTML and generated asset paths use `/staging/...` exactly once.

## Added Tests

- Asset prefix and MIME verification through focused tests and the staging public verifier.

## Component Entrypoints

Pending legacy extraction:

- `apps/server/src/localTopics/remoteAccessStagingAssetPrefixes/index.ts`
- `apps/web/src/localTopics/remoteAccessStagingAssetPrefixes/index.ts`

## Integration Points

- `apps/server/src/http.ts`
- `apps/web/src/publicPath.ts`
- `packages/shared/src/publicPath.ts`

## Focused Implementation Snippets

`apps/server/src/http.ts`

```ts
const html = rewriteReservedAssetPrefixes(shellHtml, publicPath);
sendHtml(html);
assertJavaScriptMimeForModuleAssets(assetPath);
```

`apps/web/src/publicPath.ts`

```ts
const assetBase = normalizePublicPathPrefix(importMetaBase);
resolveAssetPath(assetBase, href);
```

## Replay Notes

Keep this with remote-access when replaying against a new upstream main.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- Consolidate asset prefix rewrites under the remote-access topic entrypoint.
