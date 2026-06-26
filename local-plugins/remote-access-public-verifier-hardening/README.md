# Public Staging Verifier Hardening

## Purpose

Make public staging verification prove the real HTTPS path reaches the app and completes a project/chat flow.

## Current Commits

- `b790fe732c4c8d35cf56cf2f21f04fc73842cade` `fix(remote-access): harden public staging verification`

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

Pending legacy extraction:

- `apps/desktop/scripts/localTopics/remoteAccessPublicVerifierHardening/index.ts`
- `scripts/localTopics/remoteAccessPublicVerifierHardening/index.ts`

## Integration Points

- `apps/desktop/scripts/verify-staging-public.mjs`
- `scripts/lib/omarchy-dev-launchers.ts`
- `docs/operations/jordan-topic-stack.md`
- `docs/operations/staging-review-guide.md`

## Focused Implementation Snippets

`apps/desktop/scripts/verify-staging-public.mjs`

```js
await runNetworkPreflight(publicUrl);
await openProjectList(page);
await createChatAndSend(page, "Hi");
await expectNonEmptyAssistantResponse(page);
```

`scripts/lib/omarchy-dev-launchers.ts`

```ts
renderTailscaleReconcileScript(targets);
repairSameHostTailnetRoute(interfaceName, tailnetIp);
```

## Replay Notes

When replaying current staging history as-is, apply this after remote-access and dev-launch. When rebuilding topics, split it back into those owning topics.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run verify:staging-public`

## Known Follow-Up Work

- Move verifier preflight helpers into topic-owned script modules.
