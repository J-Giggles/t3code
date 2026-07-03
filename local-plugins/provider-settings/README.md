# Provider Usage, Reset, And T3 Access Controls

## Purpose

Add provider settings for usage limits, provider-native reset behavior, and T3 access controls.

## Current Commits

- `cbabcf08e13af412f9feb57afbcc583b63f87f06` `feat(provider-settings): add usage, reset, and T3 access controls`

## Squash / Replay History

This is the provider settings topic from the June 25 replay stack.

## Added Features

- [x] Provider usage and Codex limit state are exposed through provider settings modules (`apps/web/src/localTopics/providerSettings/index.ts`, `apps/server/src/localTopics/providerSettings/index.ts`).
- [x] Provider-native reset controls are wired through typed server operations (`apps/server/src/provider/Drivers/CodexNativeReset.ts`, `apps/server/src/provider/providerMaintenance.ts`).
- [x] T3 provider access settings and MCP catalog wiring are represented in contracts and settings surfaces (`packages/contracts/src/provider.ts`, `packages/contracts/src/settings.ts`).

## Added UI

- [x] Settings panels expose usage, reset actions, and T3 access toggles (`apps/web/src/routes/settings.providers.tsx`, `apps/web/src/localTopics/providerSettings/index.ts`).

## Added Server And Runtime Behavior

- [x] Provider maintenance operations are exposed through typed contracts (`apps/server/src/provider/providerMaintenance.ts`, `packages/contracts/src/provider.ts`).
- [x] Provider hang and interrupt handling stays stable around reset flows (`apps/server/src/provider/providerMaintenanceRunner.ts`, `apps/server/src/provider/providerConnection.ts`).

## Added Tests

- [x] Provider usage ordering, reset behavior, settings contracts, and provider maintenance are covered by focused tests (`apps/server/src/provider/providerMaintenance.test.ts`, `apps/server/src/provider/Drivers/CodexNativeReset.test.ts`, `packages/contracts/src/provider.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `apps/server/src/localTopics/providerSettings/index.ts` (source, internal)
- `apps/web/src/localTopics/providerSettings/index.ts` (source, internal)

## Integration Points

- `apps/server/src/provider`
- `apps/web/src/components/settings`
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

## Replay Notes

Replay after project-git and before composer because composer provider menus consume stabilized provider state.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
