# Composer Mentions, Slash Menus, Chat Context, And Worktree Naming

## Purpose

Make the composer a richer command surface for mentions, slash actions, context attachments, and semantic worktree names.

## Current Commits

- `f7cb0dba2d95dde576ba82fba5367f6e8b39cbb4` `feat(composer): add mentions, slash menus, chat context, and worktree naming`

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

Pending legacy extraction:

- `apps/web/src/localTopics/composer/index.ts`
- `apps/mobile/src/localTopics/composer/index.ts`
- `packages/client-runtime/src/localTopics/composer/index.ts`

## Integration Points

- `apps/web/src/components/composer`
- `apps/web/src/components/chat`
- `apps/mobile/src/features`
- `packages/client-runtime/src/state`

## Focused Implementation Snippets

`apps/web/src/components/composer`

```tsx
const menuItems = buildComposerMenuItems(context);
const mentionItems = buildMentionResults(input);
submitComposerMessage({ attachments, prompt });
```

`packages/client-runtime/src/state`

```ts
persistComposerDraft(threadId, draft);
restoreComposerSelections(threadId);
```

## Replay Notes

Replay after provider-settings so provider-aware menu items and resets see stable provider state.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run lint:mobile`

## Known Follow-Up Work

- Extract composer menu builders and worktree naming glue into topic-owned entrypoints.
