# Worktree Context And Controlled Recovery

## Purpose

Preserve the active worktree identity across restarts, reconnects, sidebar labels, and provider recovery flows.

## Current Commits

- `51b0cf31cb17e6d7ce9e672a97ad98e4bd365584` `feat(runtime): preserve worktree context and controlled recovery`

## Squash / Replay History

This is the runtime and recovery topic from the June 25 replay stack.

## Added Features

- [x] Worktree identity propagates from launcher environment into server, web, and runtime state (`packages/client-runtime/src/localTopics/runtime/index.ts`, `scripts/dev-runner.ts`).
- [x] Controlled backend restart handling preserves visible recovery state (`apps/server/src/localTopics/runtime/index.ts`, `apps/server/src/serverRuntimeRestart.ts`).
- [x] Reconnect coalescing and provider startup recovery stay owned by runtime modules (`packages/client-runtime/src/reconnectBackoff.ts`, `apps/server/src/provider/Layers/ProviderSessionStartupRecovery.ts`).

## Added UI

- [x] Sidebar and browser labels reflect the active worktree context (`apps/web/src/localTopics/runtime/index.ts`, `apps/web/src/components/sidebar`).
- [x] Restart and recovery states surface to the user instead of failing silently (`apps/web/src/connection/runtime.ts`, `packages/client-runtime/src/connection/presentation.ts`).

## Added Server And Runtime Behavior

- [x] Runtime state records branch/worktree context and restart policy (`packages/client-runtime/src/state/runtime.ts`, `apps/server/src/serverRuntimeRestart.ts`).
- [x] Provider session recovery avoids stale identity from inherited parent processes (`apps/server/src/provider/Layers/ProviderSessionStartupRecovery.ts`, `scripts/dev-runner.ts`).

## Added Tests

- [x] Dev-runner identity, runtime recovery, reconnect, and provider startup behavior are covered by focused tests (`scripts/dev-runner.test.ts`, `packages/client-runtime/src/connection/supervisor.test.ts`, `apps/server/src/provider/Layers/ProviderSessionStartupRecovery.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `packages/client-runtime/src/localTopics/runtime/index.ts` (source, internal)
- `apps/server/src/localTopics/runtime/index.ts` (source, internal)
- `apps/web/src/localTopics/runtime/index.ts` (source, internal)

## Integration Points

- `scripts/dev-runner.ts`
- `apps/server/src/serverRuntimeRestart.ts`
- `apps/server/src/provider`
- `apps/web/src/connection`
- `packages/client-runtime/src`

## Focused Implementation Snippets

`packages/client-runtime/src/localTopics/runtime/index.ts`

```ts
export * from "../../connection/presentation.ts";
export * from "../../connection/supervisor.ts";
export * from "../../reconnectBackoff.ts";
export * from "../../state/runtime.ts";
export * from "../../wsTransport.ts";
```

`apps/server/src/localTopics/runtime/index.ts`

```ts
export * from "../../serverRuntimeRestart.ts";
export * from "../../provider/Layers/ProviderSessionStartupRecovery.ts";
export * from "../../provider/Services/ProviderSessionStartupRecovery.ts";
```

## Replay Notes

Replay after dev-launch because launcher-provided environment is the preferred identity source.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
