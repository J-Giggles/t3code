# Desktop Shell MCP Automation Controls

## Purpose

Expose controlled desktop shell and preview automation through MCP tools for headed staging verification.

## Current Commits

- `c6d040d029a94b493d558e0dca87ee548cebd6ef` `feat(app-automation): add desktop shell MCP controls`

## Squash / Replay History

This is the app automation topic from the June 25 replay stack.

## Added Features

- `app_*` MCP controls for the Electron shell.
- Preview automation broker separation.
- Ownership rules for app-shell versus browser-preview automation.

## Added UI

- No primary user UI; this topic exposes operator and automation surfaces.

## Added Server And Runtime Behavior

- Desktop automation RPC and IPC contracts are registered with the app shell.
- MCP tool routing separates T3 Code app control from browser preview control.

## Added Tests

- App automation contract, broker, and headed staging control tests.

## Component Entrypoints

Pending legacy extraction:

- `apps/desktop/src/localTopics/appAutomation/index.ts`
- `apps/server/src/localTopics/appAutomation/index.ts`

## Integration Points

- `apps/desktop/src/appAutomation`
- `apps/desktop/src/preview`
- `apps/server/src/mcp`
- `docs/operations/headed-staging.md`

## Focused Implementation Snippets

`apps/server/src/mcp`

```ts
registerAppAutomationTools(server);
routeAppStatus(request);
routeAppSnapshot(request);
```

`apps/desktop/src/appAutomation`

```ts
app_status();
app_snapshot();
app_click(locator);
```

## Replay Notes

Replay before project-agent-files and observability so later tests can use controlled headed verification.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Extract MCP handler registration into `localTopics/appAutomation` modules.
