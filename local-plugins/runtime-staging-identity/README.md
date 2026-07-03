# Staging Identity Preservation In Sidebar

## Purpose

Keep the visible staging identity stable in sidebar and runtime labels even when parent launch environment includes generic values.

## Current Commits

- `ce8abb78d51c8161daf4ec6abd8f22b411757e8c` `fix(runtime): preserve staging identity in sidebar`

## Squash / Replay History

This is a June 26 runtime follow-up. Fold it into the runtime topic during the next full replay.

## Added Features

- [x] Staging identity takes precedence for visible worktree labels (`apps/web/src/localTopics/runtime/stagingIdentity.ts`, `scripts/dev-runner.ts`).

## Added UI

- [x] Sidebar labels continue to show staging instead of inherited parent identity (`apps/web/src/localTopics/runtime/stagingIdentity.ts`, `apps/web/src/components/sidebar`).

## Added Server And Runtime Behavior

- [x] Dev-runner identity resolution prefers checkout-local identity over inherited app-launch values (`scripts/localTopics/runtime/stagingIdentity.ts`, `scripts/dev-runner.ts`).

## Added Tests

- [x] Worktree identity and dev-runner environment behavior are covered by focused tests (`scripts/dev-runner.test.ts`, `scripts/dev-runner.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `apps/web/src/localTopics/runtime/stagingIdentity.ts` (source, internal)
- `scripts/localTopics/runtime/stagingIdentity.ts` (source, internal)

## Integration Points

- `apps/web/src/components/sidebar`
- `scripts/dev-runner.ts`
- `scripts/dev-runner.ts`

## Focused Implementation Snippets

`apps/web/src/localTopics/runtime/stagingIdentity.ts`

```ts
export const STAGING_WORKTREE_ROLE = "staging";
export const STAGING_PUBLIC_PATH_PREFIX = "/staging";
```

`scripts/localTopics/runtime/stagingIdentity.ts`

```ts
export { createWorktreeIdentityEnvPatch, inferT3WorktreeRole } from "../../dev-runner.ts";
```

## Replay Notes

Replay after runtime if kept separate; otherwise fold into runtime identity handling.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
