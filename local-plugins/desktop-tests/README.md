# Headed Desktop Verification Coverage

## Purpose

Add headed Electron verification infrastructure for staging workflows and UI-sensitive local topics.

## Current Commits

- `c97af3737267cfa974c9d4c05aa88f3f5122d16d` `test(desktop): add headed desktop verification coverage`

## Squash / Replay History

This is the desktop verification topic from the June 25 replay stack.

## Added Features

- Playwright fixtures and helpers for headed Electron verification.
- Smoke wiring for desktop staging workflows.

## Added UI

- No product UI; this topic tests visible Electron behavior.

## Added Server And Runtime Behavior

- Test harness launches isolated desktop state and coordinates app/preview automation.

## Added Tests

- Headed desktop smoke specs, fixtures, and CI/package script wiring.

## Component Entrypoints

Pending legacy extraction:

- `apps/desktop/e2e/localTopics/desktopTests/index.ts`

## Integration Points

- `apps/desktop/e2e`
- `apps/desktop/package.json`
- `docs/operations/headed-staging.md`

## Focused Implementation Snippets

`apps/desktop/e2e/support`

```ts
launchElectronHarness(options);
seedWorkspaceFixture(project);
expectVisibleShellState(page);
```

`apps/desktop/e2e/specs`

```ts
test("desktop smoke", async ({ app }) => {
  await app.expectReady();
});
```

## Replay Notes

Replay after observability so headed tests can inspect runtime diagnostics when failures occur.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run test:desktop-e2e:smoke`

## Known Follow-Up Work

- Extract E2E support fixtures into a topic-owned support entrypoint.
