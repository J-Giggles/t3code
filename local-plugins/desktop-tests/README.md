# Headed Desktop Verification Coverage

## Purpose

Add headed Electron verification infrastructure for staging workflows and UI-sensitive local topics.

## Current Commits

- `57ef11c7fad9d06afb43677d583bb46a4351c965` `test(desktop): add headed desktop verification coverage`

## Squash / Replay History

This is the desktop verification topic from the June 25 replay stack.

## Added Features

- Playwright fixtures and helpers for headed Electron verification.
- Smoke wiring for desktop staging workflows.
- The Electron harness scrubs outer launcher route/identity environment so dev worktree smoke tests cannot inherit a
  reserved `/main`, `/original`, or `/staging` route from another running app.

## Added UI

- No product UI; this topic tests visible Electron behavior.

## Added Server And Runtime Behavior

- Test harness launches isolated desktop state, ports, route identity, and app/preview automation.

## Added Tests

- Headed desktop smoke specs, fixtures, and CI/package script wiring.

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
```

## Replay Notes

Replay after observability so headed tests can inspect runtime diagnostics when failures occur.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run test:desktop-e2e:smoke`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
