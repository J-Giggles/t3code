# Headed Desktop Verification Coverage

## Purpose

Add headed Electron verification infrastructure for staging workflows and UI-sensitive local topics.

## Current Commits

- `57ef11c7fad9d06afb43677d583bb46a4351c965` `test(desktop): add headed desktop verification coverage`
- `bf32ad5856a30a69e65aa4e84bc90ed4ffd5016c` `test(desktop): align development renderer recovery fixture`

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
- [x] Development renderer recovery uses the configured Vite URL for both failure and successful-load events, so retry cancellation is exercised instead of skipped as an off-origin navigation (`apps/desktop/src/window/DesktopWindow.test.ts`).
- [x] Headed staging instructions are maintained with the desktop smoke workflow (`docs/operations/headed-staging.md`).

## Component Entrypoints

Componentization status: `complete`.

- `apps/desktop/e2e/localTopics/desktopTests/index.ts` (test, test)

## Integration Points

- `apps/desktop/e2e`
- `apps/desktop/src/window/DesktopWindow.test.ts`
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
- `CODEX_CI=1 vp test run apps/desktop/src/window/DesktopWindow.test.ts`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
