# Desktop Shell MCP Automation Controls

## Purpose

Expose controlled desktop shell and preview automation through MCP tools for headed staging verification.

## Current Commits

- `997062c1d2105bab3d1c923749ef8edb0fe9f6d9` `feat(app-automation): add desktop shell MCP controls`

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

Componentization status: `complete`.

- `apps/desktop/src/localTopics/appAutomation/index.ts` (source, internal)
- `apps/server/src/localTopics/appAutomation/index.ts` (source, internal)

## Integration Points

- `apps/desktop/src/appAutomation`
- `apps/desktop/src/preview`
- `apps/server/src/mcp`
- `docs/operations/headed-staging.md`

## Focused Implementation Snippets

`apps/desktop/src/localTopics/appAutomation/index.ts`

```ts
export * from "../../appAutomation/AppAutomationManager.ts";
export * from "../../ipc/methods/appAutomation.ts";
export * from "../../ipc/methods/preview.ts";
export * from "../../preview/Manager.ts";
```

`apps/server/src/localTopics/appAutomation/index.ts`

```ts
export * from "../../mcp/AppAutomationBroker.ts";
export * from "../../mcp/PreviewAutomationBroker.ts";
export * from "../../mcp/toolkits/preview/handlers.ts";
export * from "../../mcp/toolkits/preview/tools.ts";
```

## Replay Notes

Replay before project-agent-files and observability so later tests can use controlled headed verification.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
