# Canonical Staging Asset Prefixes

## Purpose

Prevent duplicated staging prefixes in generated asset URLs and static HTML responses.

## Current Commits

- `d0410647ab5f161259b1fcca0f41144eaebf8fd2` `fix(remote-access): canonicalize staging asset prefixes`

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

Componentization status: `complete`.

- `packages/shared/src/localTopics/remoteAccess/stagingAssetPrefixes.ts` (source, internal)
- `apps/server/src/localTopics/remoteAccess/stagingAssetPrefixes.ts` (source, internal)
- `apps/web/src/localTopics/remoteAccess/stagingAssetPrefixes.ts` (source, internal)

## Integration Points

- `apps/server/src/http.ts`
- `apps/web/src/publicPath.ts`
- `packages/shared/src/publicPath.ts`

## Focused Implementation Snippets

`packages/shared/src/localTopics/remoteAccess/stagingAssetPrefixes.ts`

```ts
export { joinPublicPathPrefix, normalizePublicPathPrefix } from "./publicPath.ts";
```

`apps/server/src/localTopics/remoteAccess/stagingAssetPrefixes.ts`

```ts
export { rewriteCssForPublicPathPrefix, rewriteHtmlForPublicPathPrefix } from "./httpRouting.ts";
```

## Replay Notes

Keep this with remote-access when replaying against a new upstream main.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
