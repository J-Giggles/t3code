# Public Staging Verifier Hardening

## Purpose

Make public staging verification prove the real HTTPS path reaches the app and completes a project/chat flow.

## Current Commits

- `5aadf3c563191f2c449a30d31b3ed57a9e6ccf1c` `fix(remote-access): harden public staging verification`

## Squash / Replay History

This is the June 26 remote-access hardening follow-up currently at the tip of staging. Fold web/server/verifier pieces into remote-access and reconcile-helper pieces into dev-launch when replaying.

## Added Features

- [x] Public verifier performs an interface-bound network preflight for same-host Tailscale routing (`apps/desktop/scripts/verify-staging-public.mjs`).
- [x] Public verifier requires project listing, new chat creation, `Hi`, and a non-empty assistant response (`apps/desktop/scripts/verify-staging-public.mjs`).
- [x] Failure artifacts capture network preflight details for route diagnosis (`apps/desktop/scripts/verify-staging-public.mjs`).

## Added UI

- [x] Public staging verification exercises the visible hosted app flow rather than a shallow status check (`apps/desktop/scripts/verify-staging-public.mjs`, `/staging/`).

## Added Server And Runtime Behavior

- [x] Tailscale same-host route repair guidance is tied to public verifier expectations (`docs/operations/jordan-topic-stack.md`, `docs/operations/staging-review-guide.md`).
- [x] Launcher reconcile behavior remains associated with durable launch support (`scripts/lib/omarchy-dev-launchers.ts`, `scripts/localTopics/devLaunch/index.ts`).

## Added Tests

- [x] Strict public staging verification is enforced through the staging public verifier command (`apps/desktop/scripts/verify-staging-public.mjs`, `vp run verify:staging-public`).

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
