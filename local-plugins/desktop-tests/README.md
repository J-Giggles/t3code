# Headed Desktop Verification Coverage

## Purpose

Add headed Electron verification infrastructure for staging workflows and UI-sensitive local topics.

## Current Commits

- `57ef11c7fad9d06afb43677d583bb46a4351c965` `test(desktop): add headed desktop verification coverage`

## Squash / Replay History

This is the desktop verification topic from the June 25 replay stack.

## Added Features

- [x] Headed Electron verification fixtures are grouped under desktop test entrypoints (`apps/desktop/e2e/localTopics/desktopTests/index.ts`).
- [x] Desktop smoke wiring exercises staging workflows through the desktop package scripts (`apps/desktop/package.json`, `apps/desktop/scripts/run-e2e.mjs`).
- [x] The Electron harness scrubs inherited route and identity environment for isolated smoke runs (`apps/desktop/e2e/localTopics/desktopTests/index.ts`).

## Added UI

- [x] Not applicable: this topic tests visible Electron behavior but adds no product UI surface.

## Added Server And Runtime Behavior

- [x] Test harness startup isolates desktop state, ports, route identity, and automation channels (`apps/desktop/e2e/localTopics/desktopTests/index.ts`).

## Added Tests

- [x] Desktop smoke specs cover composer, chat layout, connections, workspace Git, and recovery lifecycle behavior (`apps/desktop/e2e/specs/composer.spec.ts`, `apps/desktop/e2e/specs/chat-layout.spec.ts`, `apps/desktop/e2e/specs/recovery-lifecycle.spec.ts`).
- [x] Headed staging instructions are maintained with the desktop smoke workflow (`docs/operations/headed-staging.md`).

## Component Entrypoints

Componentization status: `complete`.

- `apps/desktop/e2e/localTopics/desktopTests/index.ts` (test, test)

## Integration Points

- `apps/desktop/e2e`
- `apps/desktop/package.json`
- `docs/operations/headed-staging.md`

## Focused Implementation Snippets

`apps/desktop/e2e/localTopics/desktopTests/index.ts`

```ts
export const DESKTOP_E2E_TOPIC_SPECS = [
  "chat-layout.spec.ts",
  "composer.spec.ts",
  "connections.spec.ts",
  "dev-launch.spec.ts",
  "pairing-path.spec.ts",
  "recovery-lifecycle.spec.ts",
  "recovery-provider.spec.ts",
  "workspace-git.spec.ts",
] as const;
export const DESKTOP_E2E_TOPIC_SUPPORT = [
  "electronHarness.ts",
  "preflight.ts",
  "seedChatLayoutState.ts",
```

## Replay Notes

Replay after observability so headed tests can inspect runtime diagnostics when failures occur.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run test:desktop-e2e:smoke`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
