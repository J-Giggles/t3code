# Durable Worktree Launch Profiles

## Purpose

Let T3 Code launch project apps from declared worktree profiles with predictable ports, setup commands, and local or hosted URLs.

## Current Commits

- `3337bbc2d6dfabe4cc763a9865680136cbd770d1` `feat(dev-launch): add durable worktree launch profiles`

## Squash / Replay History

This topic collects the durable launch profile implementation and Omarchy launcher support from the June 25 replay stack.

## Added Features

- `.t3code/dev-apps.json` launch profile discovery.
- Desktop and server launch managers for project app processes.
- Omarchy launcher generation and same-host Tailscale route reconciliation.

## Added UI

- Chat launch controls show setup, launch, status, errors, and open URL actions.

## Added Server And Runtime Behavior

- Launch profile resolution runs against the active project workspace.
- Child process environment and port selection are isolated per worktree.

## Added Tests

- Launch profile parsing, dev-runner environment, Omarchy renderer, and launcher runtime tests.

## Component Entrypoints

Pending legacy extraction:

- `apps/web/src/localTopics/devLaunch/index.ts`
- `apps/server/src/localTopics/devLaunch/index.ts`
- `packages/shared/src/localTopics/devLaunch/index.ts`

## Integration Points

- `packages/contracts/src/devLaunch.ts`
- `packages/shared/src/devAppLaunchRuntime.ts`
- `apps/server/src/devLaunch/ServerDevAppLaunchManager.ts`
- `apps/desktop/src/backend/DesktopDevAppLaunchManager.ts`
- `apps/web/src/components/chat/ThreadDevLaunchControl.tsx`

## Focused Implementation Snippets

`packages/shared/src/devLaunch.ts`

```ts
ProjectDevLaunchManifest;
ProjectDevLaunchProfile;
parseProjectDevLaunchManifest(raw);
```

`scripts/dev-runner.ts`

```ts
loadDevRunnerBootstrapEnv({ repoRoot, baseEnv });
createDevRunnerEnv({ mode, cwd, baseEnv });
```

## Replay Notes

Replay after remote-access so hosted app URLs inherit the public route rules. Keep reconcile helper changes with this topic when folding follow-ups.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Extract launcher UI and runtime glue into `localTopics/devLaunch` modules when those files are next modified.
