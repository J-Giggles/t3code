# Desktop Shell MCP Automation Controls

## Purpose

Expose controlled desktop shell and preview automation through MCP tools for headed staging verification.

## Current Commits

- `997062c1d2105bab3d1c923749ef8edb0fe9f6d9` `feat(app-automation): add desktop shell MCP controls`
- `bbf8b48a88c06ace91fc4847c4f91d8642cc0f2c` `feat(app-automation): share authenticated Chrome with agents`
- `14be0103fdd9a764d96a94ca53fa3e15b254fd8e` `fix(app-automation): harden shared Chrome profile`
- `54716c4e70cf79bc8768c857118770cc08826070` `test(app-automation): verify shared Chrome session`

## Squash / Replay History

This is the app automation topic from the June 25 replay stack plus the GBT-89 shared authenticated Chrome follow-up.

## Added Features

- [x] Electron shell control is exposed through app automation surfaces (`packages/contracts/src/appAutomation.ts`, `apps/desktop/src/localTopics/appAutomation/index.ts`).
- [x] Preview automation stays separated from app-shell automation (`packages/contracts/src/previewAutomation.ts`, `apps/server/src/mcp/toolkits/preview/tools.ts`).
- [x] Automation ownership rules route app control through desktop/server brokers (`apps/server/src/mcp/AppAutomationBroker.ts`, `apps/desktop/src/appAutomation/AppAutomationManager.ts`).
- [x] Authenticated website work prefers the real agent-only Chrome profile through the official Playwright Extension (`packages/shared/src/prompts.ts`, `scripts/lib/agent-chrome-browser.ts`).

## Added UI

- [x] Not applicable: this topic exposes operator automation surfaces rather than primary product UI.

## Added Server And Runtime Behavior

- [x] Desktop automation RPC and IPC contracts are registered with the app shell (`apps/desktop/src/ipc/methods/appAutomation.ts`, `packages/contracts/src/appAutomation.ts`).
- [x] MCP routing separates T3 Code app control from browser preview control (`apps/server/src/mcp/AppAutomationBroker.ts`, `apps/server/src/mcp/toolkits/preview/handlers.ts`).
- [x] The idempotent setup command pins extension-backed Playwright MCP and preserves an existing automatic-approval token without exposing it in output (`scripts/setup-agent-chrome-browser.ts`, `scripts/lib/agent-chrome-browser.ts`).
- [x] The machine-local launcher pins the existing `Default` Chrome profile and relies on Chrome's singleton handoff instead of introducing a second user-data directory (`scripts/lib/agent-chrome-browser.ts`, `docs/operations/agent-chrome-browser.md`).
- [x] Browser instructions select shared Chrome first, require a 1440×900 desktop viewport, and keep collaborative preview as the explicit fallback (`packages/shared/src/prompts.ts`, `docs/operations/agent-chrome-browser.md`).
- [x] The final fallback has one executable temporary-profile Chromium launcher that deletes its user-data directory on exit (`scripts/open-isolated-agent-browser.ts`, `scripts/lib/agent-chrome-isolated.ts`).

## Added Tests

- [x] App automation broker behavior is covered by focused MCP tests (`apps/server/src/mcp/AppAutomationBroker.test.ts`).
- [x] Preview automation routing remains covered separately from app-shell control (`apps/server/src/mcp/toolkits/preview/tools.test.ts`, `apps/desktop/src/ipc/methods/preview.test.ts`).
- [x] Chrome MCP command construction, secret handling, configuration matching, CLI modes, and injected Codex instructions are covered by focused tests (`scripts/lib/agent-chrome-browser.test.ts`, `apps/server/src/provider/Layers/CodexSessionRuntime.test.ts`).
- [x] The `SharedChromePageObject` live headed verifier requires tab, viewport, navigation, snapshot, shared-cookie, no-failure, and no-fallback assertions, then emits a secret-free flow evidence matrix (`scripts/verify-agent-chrome-browser.ts`, `scripts/lib/agent-chrome-browser-verifier.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `apps/desktop/src/localTopics/appAutomation/index.ts` (source, internal)
- `apps/server/src/localTopics/appAutomation/index.ts` (source, internal)
- `scripts/lib/agent-chrome-browser.ts` (source, internal)
- `scripts/lib/agent-chrome-isolated.ts` (source, internal)

## Integration Points

- `apps/desktop/src/appAutomation`
- `apps/desktop/src/preview`
- `apps/server/src/mcp`
- `docs/operations/headed-staging.md`
- `docs/operations/agent-chrome-browser.md`
- `packages/shared/src/prompts.ts`
- `scripts/setup-agent-chrome-browser.ts`
- `scripts/open-isolated-agent-browser.ts`
- `scripts/verify-agent-chrome-browser.ts`

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
- `vp test run scripts/lib/agent-chrome-browser.test.ts apps/server/src/provider/Layers/CodexSessionRuntime.test.ts`
- `pnpm run agent-browser:verify`

## Known Follow-Up Work

- Keep the pinned Playwright MCP version synchronized with verified extension behavior on `giggabit-server`; do not change to an unpinned `latest` install (`scripts/lib/agent-chrome-browser.ts`).
