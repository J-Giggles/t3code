# Staging Identity Preservation In Sidebar

## Purpose

Keep the visible staging identity stable in sidebar and runtime labels even when parent launch environment includes generic values.

## Current Commits

- `4147e3b4ad2f1afb6d567c433ef1bbdc156d951c` `fix(runtime): preserve staging identity in sidebar`

## Squash / Replay History

This is a June 26 runtime follow-up. Fold it into the runtime topic during the next full replay.

## Added Features

- Staging identity precedence for visible worktree labels.

## Added UI

- Sidebar labels continue to show staging instead of inherited parent identity.

## Added Server And Runtime Behavior

- Dev-runner identity resolution prefers checkout-local identity over inherited app-launch values.

## Added Tests

- Worktree identity and dev-runner environment tests.

## Component Entrypoints

Pending legacy extraction:

- `apps/web/src/localTopics/runtimeStagingIdentity/index.ts`
- `packages/shared/src/localTopics/runtimeStagingIdentity/index.ts`

## Integration Points

- `apps/web/src/components/sidebar`
- `packages/shared/src/worktreeIdentity.ts`
- `scripts/dev-runner.ts`

## Focused Implementation Snippets

`scripts/dev-runner.ts`

```ts
const checkoutEnv = loadDotEnvLocal(repoRoot);
const inheritedEnv = baseEnv;
return preferCheckoutIdentity(checkoutEnv, inheritedEnv);
```

`apps/web/src/components/sidebar`

```tsx
const label = resolveWorktreeLabel(runtimeIdentity);
return <SidebarWorkspaceLabel label={label} />;
```

## Replay Notes

Replay after runtime if kept separate; otherwise fold into runtime identity handling.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Move staging-label precedence into the runtime topic entrypoint.
