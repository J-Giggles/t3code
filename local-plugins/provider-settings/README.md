# Provider Usage, Reset, And T3 Access Controls

## Purpose

Add provider settings for usage limits, provider-native reset behavior, and T3 access controls.

## Current Commits

- `cbabcf08e13af412f9feb57afbcc583b63f87f06` `feat(provider-settings): add usage, reset, and T3 access controls`

## Squash / Replay History

This is the provider settings topic from the June 25 replay stack.

Replay support follow-ups currently listed in the nightly manifest:

- `a159898af2e75a9c87a82f3480db8e56b4e3b0dd` `fix(provider-settings): restore composer usage popover`
- `d97993ccbb4ec1753d1d340c5fb53561cfcdd485` `fix(provider-settings): update Claude permission request fixtures`

## Added Features

- [x] Provider usage and Codex limit state are exposed through provider settings modules (`apps/web/src/localTopics/providerSettings/index.ts`, `apps/server/src/localTopics/providerSettings/index.ts`).
- [x] Provider-native reset controls are wired through typed server operations (`apps/server/src/provider/Drivers/CodexNativeReset.ts`, `apps/server/src/provider/providerMaintenance.ts`).
- [x] T3 provider access settings and MCP catalog wiring are represented in contracts and settings surfaces (`packages/contracts/src/provider.ts`, `packages/contracts/src/settings.ts`).

## Added UI

- [x] Settings panels expose usage, reset actions, and T3 access toggles (`apps/web/src/routes/settings.providers.tsx`, `apps/web/src/localTopics/providerSettings/index.ts`).
- [x] The chat composer footer exposes the selected provider usage icon and popover through thin composer wiring (`apps/web/src/components/chat/ChatComposer.tsx`, `apps/web/src/components/chat/ProviderUsagePopover.tsx`).

## Added Server And Runtime Behavior

- [x] Provider maintenance operations are exposed through typed contracts (`apps/server/src/provider/providerMaintenance.ts`, `packages/contracts/src/provider.ts`).
- [x] Provider hang and interrupt handling stays stable around reset flows (`apps/server/src/provider/providerMaintenanceRunner.ts`, `apps/server/src/provider/providerConnection.ts`).

## Added Tests

- [x] Provider usage ordering, reset behavior, settings contracts, and provider maintenance are covered by focused tests (`apps/server/src/provider/providerMaintenance.test.ts`, `apps/server/src/provider/Drivers/CodexNativeReset.test.ts`, `packages/contracts/src/provider.test.ts`).
- [x] Headed Electron chat-layout smoke requires the provider usage footer button and popover alongside the context-window meter (`apps/desktop/e2e/specs/chat-layout.spec.ts`, `vp run --filter @t3tools/desktop e2e:smoke -- chat-layout.spec.ts`).
- [x] Claude permission fixtures carry SDK request IDs after upstream dependency reconciliation (`apps/server/src/provider/Layers/ClaudeAdapter.test.ts`, `vp test run apps/server/src/provider/Layers/ClaudeAdapter.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `apps/server/src/localTopics/providerSettings/index.ts` (source, internal)
- `apps/web/src/localTopics/providerSettings/index.ts` (source, internal)

## Integration Points

- `apps/server/src/provider`
- `apps/web/src/components/settings`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `packages/contracts/src/provider.ts`
- `packages/contracts/src/settings.ts`

## Focused Implementation Snippets

`apps/server/src/localTopics/providerSettings/index.ts`

```ts
export * from "../../provider/Drivers/CodexNativeReset.ts";
export * from "../../provider/providerMaintenance.ts";
export * from "../../provider/providerMaintenanceCommandCoordinator.ts";
export * from "../../provider/providerMaintenanceRunner.ts";
```

`apps/web/src/localTopics/providerSettings/index.ts`

```ts
export * from "../../components/chat/ProviderUsagePopover.tsx";
export * from "../../components/settings/ProviderInstanceCard.tsx";
export * from "../../components/settings/ProviderSettingsForm.tsx";
export * from "../../components/settings/providerStatus.ts";
```

`apps/web/src/components/chat/ChatComposer.tsx`

```tsx
<ProviderUsagePopover
  environmentId={props.environmentId}
  provider={props.selectedProviderStatus}
  selectedInstanceId={props.selectedInstanceId}
/>
```

## Replay Notes

Replay after project-git and before composer because composer provider menus consume stabilized provider state. Keep the composer footer usage wiring with this topic so the popover component is not replayed without a visible integration point.

## Verification

- `vp check`
- `vp run typecheck`
- `vp test run apps/server/src/provider/Layers/ClaudeAdapter.test.ts`
- `vp run --filter @t3tools/desktop e2e:smoke -- chat-layout.spec.ts`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
