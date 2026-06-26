# Provider Usage, Reset, And T3 Access Controls

## Purpose

Add provider settings for usage limits, provider-native reset behavior, and T3 access controls.

## Current Commits

- `83477a4fa73a729abf65a6ca29adba05aa62d376` `feat(provider-settings): add usage, reset, and T3 access controls`

## Squash / Replay History

This is the provider settings topic from the June 25 replay stack.

## Added Features

- Provider usage and Codex limit display.
- Provider-native reset controls.
- T3 provider access settings and MCP catalog wiring.

## Added UI

- Settings panels for usage, reset actions, and T3 access toggles.

## Added Server And Runtime Behavior

- Provider maintenance operations are exposed through typed contracts.
- Provider hang and interrupt handling is stabilized around reset flows.

## Added Tests

- Provider usage ordering, reset behavior, settings contract, and provider maintenance tests.

## Component Entrypoints

Pending legacy extraction:

- `apps/web/src/localTopics/providerSettings/index.ts`
- `apps/server/src/localTopics/providerSettings/index.ts`

## Integration Points

- `apps/server/src/provider`
- `apps/web/src/components/settings`
- `packages/contracts/src/provider.ts`
- `packages/contracts/src/settings.ts`

## Focused Implementation Snippets

`apps/server/src/provider/providerMaintenance.ts`

```ts
getProviderUsage(providerId);
resetProviderSession(providerId);
interruptProviderTurn(sessionId);
```

`apps/web/src/components/settings`

```tsx
<ProviderUsagePanel />
<ProviderResetControl />
```

## Replay Notes

Replay after project-git and before composer because composer provider menus consume stabilized provider state.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Extract provider settings panels and provider maintenance routing into topic-owned modules.
