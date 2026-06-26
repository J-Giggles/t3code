# Public Staging Verifier Hardening

## Purpose

Make public staging verification prove the real HTTPS path reaches the app and completes a project/chat flow.

## Current Commits

- `5aadf3c563191f2c449a30d31b3ed57a9e6ccf1c` `fix(remote-access): harden public staging verification`

## Squash / Replay History

This is the June 26 remote-access hardening follow-up currently at the tip of staging. Fold web/server/verifier pieces into remote-access and reconcile-helper pieces into dev-launch when replaying.

## Added Features

- Interface-bound network preflight for same-host Tailscale routing.
- Verifier requires project listing, new chat creation, `Hi`, and a non-empty assistant response.
- Failure artifacts capture network preflight details.

## Added UI

- No product UI; verifier behavior exercises the public staging UI.

## Added Server And Runtime Behavior

- Tailscale same-host route repair guidance and launcher reconcile behavior are documented with verifier expectations.

## Added Tests

- Strict public staging verifier coverage.

## Component Entrypoints

Componentization status: `complete`.

- `apps/desktop/src/localTopics/remoteAccess/publicVerifierHardening.ts` (source, internal)
- `scripts/localTopics/devLaunch/index.ts` (source, internal)

## Integration Points

- `apps/desktop/scripts/verify-staging-public.mjs`
- `scripts/lib/omarchy-dev-launchers.ts`
- `docs/operations/jordan-topic-stack.md`
- `docs/operations/staging-review-guide.md`

## Focused Implementation Snippets

`apps/desktop/src/localTopics/remoteAccess/publicVerifierHardening.ts`

```ts
export const STAGING_PUBLIC_VERIFIER_DEFAULT_MESSAGE = "Hi";
export const STAGING_PUBLIC_VERIFIER_NETWORK_PREFLIGHT_ARTIFACT = "network-preflight.json";
```

`scripts/localTopics/devLaunch/index.ts`

```ts
export * from "../../dev-runner.ts";
export * from "../../lib/omarchy-dev-launchers.ts";
```

## Replay Notes

When replaying current staging history as-is, apply this after remote-access and dev-launch. When rebuilding topics, split it back into those owning topics.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
