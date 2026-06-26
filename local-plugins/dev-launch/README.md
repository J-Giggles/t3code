# Durable Worktree Launch Profiles

## Purpose

Let T3 Code launch project apps from declared worktree profiles with predictable ports, setup commands, and local or hosted URLs.

## Current Commits

- `3489ca07ab766b41b700d2f46be40745346a3715` `feat(dev-launch): add durable worktree launch profiles`

## Squash / Replay History

This topic collects the durable launch profile implementation and Omarchy launcher support from the June 25 replay stack.

## Added Features

- `.t3code/dev-apps.json` launch profile discovery.
- Desktop and server launch managers for project app processes.
- Omarchy launcher generation and same-host Tailscale route reconciliation.
- Dev runner reserved-route preflights prevent non-owning branches/worktrees from claiming `/main`, `/original`, or
  `/staging`.

## Added UI

- Chat launch controls show setup, launch, status, route conflicts, errors, and open URL actions.

## Added Server And Runtime Behavior

- Launch profile resolution runs against the active project workspace.
- Child process environment and port selection are isolated per worktree.
- Route conflicts are reported as launch collisions with the existing and expected Tailscale proxy targets.

## Added Tests

- Launch profile parsing, dev-runner environment and reserved-route guards, Omarchy renderer, route-collision prompts,
  and launcher runtime tests.

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
