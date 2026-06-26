# Worktree Context And Controlled Recovery

## Purpose

Preserve the active worktree identity across restarts, reconnects, sidebar labels, and provider recovery flows.

## Current Commits

- `51b0cf31cb17e6d7ce9e672a97ad98e4bd365584` `feat(runtime): preserve worktree context and controlled recovery`

## Squash / Replay History

This is the runtime and recovery topic from the June 25 replay stack.

## Added Features

- Worktree identity propagation from launcher environment into server, web, and runtime state.
- Controlled backend restart handling and visible recovery states.
- Reconnect coalescing and provider startup recovery behavior.

## Added UI

- Sidebar and browser labels reflect the active worktree context.
- Restart and recovery states are surfaced to the user instead of failing silently.

## Added Server And Runtime Behavior

- Runtime state records branch/worktree context and restart policy.
- Provider session recovery avoids stale identity from inherited parent processes.

## Added Tests

- Dev-runner identity tests, runtime recovery tests, and reconnect behavior coverage.

## Component Entrypoints

Componentization status: `complete`.

- `packages/client-runtime/src/localTopics/runtime/index.ts` (source, internal)
- `apps/server/src/localTopics/runtime/index.ts` (source, internal)
- `apps/web/src/localTopics/runtime/index.ts` (source, internal)

## Integration Points

- `scripts/dev-runner.ts`
- `apps/server/src/devSupervisor.ts`
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
