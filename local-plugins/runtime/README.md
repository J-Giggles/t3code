# Worktree Context And Controlled Recovery

## Purpose

Preserve the active worktree identity across restarts, reconnects, sidebar labels, and provider recovery flows.

## Current Commits

- `acaad0b2d957167520ae4044d149480ffa06e105` `feat(runtime): preserve worktree context and controlled recovery`

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

Pending legacy extraction:

- `apps/web/src/localTopics/runtime/index.ts`
- `apps/server/src/localTopics/runtime/index.ts`
- `packages/client-runtime/src/localTopics/runtime/index.ts`

## Integration Points

- `scripts/dev-runner.ts`
- `apps/server/src/devSupervisor.ts`
- `apps/server/src/provider`
- `apps/web/src/connection`
- `packages/client-runtime/src`

## Focused Implementation Snippets

`scripts/dev-runner.ts`

```ts
inferT3WorktreeRole(cwd);
createWorktreeIdentityEnvPatch({ cwd, baseEnv });
loadDevRunnerBootstrapEnv({ repoRoot, baseEnv });
```

`apps/web/src/connection`

```ts
connectionSnapshot.worktree;
runtimeRecoveryState.restartPolicy;
```

## Replay Notes

Replay after dev-launch because launcher-provided environment is the preferred identity source.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Move runtime identity derivation and recovery projection into package-local topic entrypoints.
