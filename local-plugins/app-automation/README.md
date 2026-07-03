# Desktop Shell MCP Automation Controls

## Purpose

Expose controlled desktop shell and preview automation through MCP tools for headed staging verification.

## Current Commits

- `997062c1d2105bab3d1c923749ef8edb0fe9f6d9` `feat(app-automation): add desktop shell MCP controls`

## Squash / Replay History

This is the app automation topic from the June 25 replay stack.

## Added Features

- [x] Electron shell control is exposed through app automation surfaces (`packages/contracts/src/appAutomation.ts`, `apps/desktop/src/localTopics/appAutomation/index.ts`).
- [x] Preview automation stays separated from app-shell automation (`packages/contracts/src/previewAutomation.ts`, `apps/server/src/mcp/toolkits/preview/tools.ts`).
- [x] Automation ownership rules route app control through desktop/server brokers (`apps/server/src/mcp/AppAutomationBroker.ts`, `apps/desktop/src/appAutomation/AppAutomationManager.ts`).

## Added UI

- [x] Not applicable: this topic exposes operator automation surfaces rather than primary product UI.

## Added Server And Runtime Behavior

- [x] Desktop automation RPC and IPC contracts are registered with the app shell (`apps/desktop/src/ipc/methods/appAutomation.ts`, `packages/contracts/src/appAutomation.ts`).
- [x] MCP routing separates T3 Code app control from browser preview control (`apps/server/src/mcp/AppAutomationBroker.ts`, `apps/server/src/mcp/toolkits/preview/handlers.ts`).

## Added Tests

- [x] App automation broker behavior is covered by focused MCP tests (`apps/server/src/mcp/AppAutomationBroker.test.ts`).
- [x] Preview automation routing remains covered separately from app-shell control (`apps/server/src/mcp/toolkits/preview/tools.test.ts`, `apps/desktop/src/ipc/methods/preview.test.ts`).

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
