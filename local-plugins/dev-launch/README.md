# Durable Worktree Launch Profiles

## Purpose

Let T3 Code launch project apps from declared worktree profiles with predictable ports, setup commands, and local or hosted URLs.

## Current Commits

- `3489ca07ab766b41b700d2f46be40745346a3715` `feat(dev-launch): add durable worktree launch profiles`

## Squash / Replay History

This topic collects the durable launch profile implementation and Omarchy launcher support from the June 25 replay stack.

## Added Features

- [x] Worktree launch profiles are discovered from repo metadata (`.t3code/dev-apps.json`, `packages/shared/src/localTopics/devLaunch/index.ts`).
- [x] Desktop and server launch managers own project app processes (`apps/desktop/src/backend/DesktopDevAppLaunchManager.ts`, `apps/server/src/devLaunch/ServerDevAppLaunchManager.ts`).
- [x] Omarchy launcher generation and same-host Tailscale route reconciliation are scripted (`scripts/lib/omarchy-dev-launchers.ts`, `scripts/localTopics/devLaunch/index.ts`).
- [x] Dev runner reserved-route preflights block non-owning branches from `/main`, `/original`, and `/staging` (`scripts/dev-runner.ts`, `packages/shared/src/localTopics/devLaunch/index.ts`).

## Added UI

- [x] Chat launch controls show setup, launch, status, route conflicts, errors, and open URL actions (`apps/web/src/components/chat/ThreadDevLaunchControl.tsx`).

## Added Server And Runtime Behavior

- [x] Launch profile resolution runs against the active project workspace (`apps/server/src/project/Layers/ProjectDevLaunchResolver.ts`).
- [x] Child process environment and port selection are isolated per worktree (`packages/shared/src/devAppLaunchRuntime.ts`, `scripts/dev-runner.ts`).
- [x] Route conflicts report existing and expected Tailscale proxy targets (`packages/shared/src/localTopics/devLaunch/index.ts`, `apps/web/src/components/chat/ThreadDevLaunchControl.tsx`).

## Added Tests

- [x] Launch parsing, dev-runner guards, Omarchy rendering, and launch UI behavior are covered by focused tests (`packages/shared/src/devLaunch.test.ts`, `scripts/dev-runner.test.ts`, `scripts/lib/omarchy-dev-launchers.test.ts`, `apps/web/src/components/chat/ThreadDevLaunchControl.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `packages/shared/src/localTopics/devLaunch/index.ts` (source, facade)
- `apps/server/src/localTopics/devLaunch/index.ts` (source, internal)
- `apps/desktop/src/localTopics/devLaunch/index.ts` (source, internal)
- `apps/web/src/localTopics/devLaunch/index.ts` (source, internal)
- `scripts/localTopics/devLaunch/index.ts` (source, internal)

## Integration Points

- `packages/contracts/src/devLaunch.ts`
- `packages/shared/src/devAppLaunchRuntime.ts`
- `apps/server/src/devLaunch/ServerDevAppLaunchManager.ts`
- `apps/desktop/src/backend/DesktopDevAppLaunchManager.ts`
- `apps/web/src/components/chat/ThreadDevLaunchControl.tsx`

## Focused Implementation Snippets

`packages/shared/src/localTopics/devLaunch/index.ts`

```ts
import {
  type DesktopDevLaunchCollision,
  type DesktopDevLaunchRecord,
  type DesktopDevLaunchSetupInput,
  type PromptOverrides,
  type ProjectDevLaunchManifest,
  type ProjectDevLaunchProfile,
  ProjectDevLaunchManifest as ProjectDevLaunchManifestSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PROMPT_IDS, renderPromptTemplate } from "../../prompts.ts";
export function buildDevLaunchCollisionPrompt(input: {
  collision: DesktopDevLaunchCollision;
  projectName: string;
```

`apps/server/src/localTopics/devLaunch/index.ts`

```ts
export * from "../../devLaunch/ServerDevAppLaunchManager.ts";
export * from "../../project/Layers/ProjectDevLaunchResolver.ts";
export * from "../../project/Services/ProjectDevLaunchResolver.ts";
```

## Replay Notes

Replay after remote-access so hosted app URLs inherit the public route rules. Keep dev-runner reserved-route launch
failures, route-collision prompt handling, and reconcile helper changes with this topic when folding follow-ups.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
