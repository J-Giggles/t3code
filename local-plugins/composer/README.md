# Composer Mentions, Slash Menus, Chat Context, And Worktree Naming

## Purpose

Make the composer a richer command surface for mentions, slash actions, context attachments, and semantic worktree names.

## Current Commits

- `eeb495a826cf0cdf5a3833d0d6131c12e118b4ee` `feat(composer): add mentions, slash menus, chat context, and worktree naming`

## Squash / Replay History

This topic folds composer menu, pasted chat context, semantic worktree naming, and compact chat/sidebar fixes into one replay unit.

## Added Features

- `@` mentions and slash menu actions.
- Chat and terminal context attachments.
- Semantic branch and worktree naming for composer-created worktrees.

## Added UI

- Composer menus, compact chat controls, changed-file collapse behavior, and mobile composer selectors.

## Added Server And Runtime Behavior

- Worktree naming prompt output is consumed before a composer-created worktree is added.
- Context attachment metadata is carried through provider request construction.

## Added Tests

- Composer menu, pasted context, worktree naming, and mobile composer state tests.

## Component Entrypoints

Componentization status: `complete`.

- `apps/web/src/localTopics/composer/index.ts` (source, internal)
- `apps/mobile/src/localTopics/composer/index.ts` (source, internal)
- `packages/client-runtime/src/localTopics/composer/index.ts` (source, internal)

## Integration Points

- `apps/web/src/components/composer`
- `apps/web/src/components/chat`
- `apps/mobile/src/features`
- `packages/client-runtime/src/state`

## Focused Implementation Snippets

`apps/web/src/localTopics/composer/index.ts`

```ts
export * from "../../components/chat/ChatComposer.tsx";
export * from "../../components/chat/ComposerCommandMenu.tsx";
export * from "../../components/chat/ComposerPrimaryActions.tsx";
export * from "../../components/chat/composerProviderState.tsx";
```

`apps/mobile/src/localTopics/composer/index.ts`

```ts
export * from "../../components/ComposerAttachmentStrip.tsx";
export * from "../../components/ComposerEditor.tsx";
export * from "../../features/threads/ComposerCommandPopover.tsx";
export * from "../../features/threads/ThreadComposer.tsx";
export * from "../../state/use-thread-composer-state.ts";
```

## Replay Notes

Replay after provider-settings so provider-aware menu items and resets see stable provider state.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run lint:mobile`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
