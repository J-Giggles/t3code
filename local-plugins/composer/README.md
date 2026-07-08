# Composer Mentions, Slash Menus, Chat Context, And Worktree Naming

## Purpose

Make the composer a richer command surface for mentions, slash actions, context attachments, and semantic worktree names.

## Current Commits

- `eeb495a826cf0cdf5a3833d0d6131c12e118b4ee` `feat(composer): add mentions, slash menus, chat context, and worktree naming`

## Squash / Replay History

This topic folds composer menu, pasted chat context, semantic worktree naming, and compact chat/sidebar fixes into one replay unit.

Replay support follow-ups currently listed in the nightly manifest:

- `93bfab12c31aaadf5a2a03bae99b96dc9b86de80` `fix(composer): keep chat controls above terminal drawer`

## Added Features

- [x] Composer `@` mentions and slash command matching are owned by composer modules (`apps/web/src/components/chat/composerSlashCommandSearch.ts`, `apps/web/src/composer-editor-mentions.ts`).
- [x] Chat and terminal context attachments are carried through composer state (`apps/web/src/composerHandleContext.ts`, `apps/web/src/components/chat/ComposerPendingTerminalContexts.tsx`).
- [x] Composer-created worktrees receive semantic branch and folder names (`apps/web/src/localTopics/composer/index.ts`, `packages/client-runtime/src/localTopics/composer/index.ts`).

## Added UI

- [x] Web composer menus and compact controls render the topic-owned interaction surfaces (`apps/web/src/components/chat/ComposerCommandMenu.tsx`, `apps/web/src/components/chat/CompactComposerControlsMenu.tsx`).
- [x] Mobile composer selectors and command popovers preserve composer behavior on native clients (`apps/mobile/src/localTopics/composer/index.ts`, `apps/mobile/src/features/threads/ComposerCommandPopover.tsx`).
- [x] Chat layout keeps seeded history rows, the context-window meter, the right panel, and the composer reachable while the terminal drawer is open (`apps/web/src/components/ChatView.tsx`, `apps/desktop/e2e/specs/chat-layout.spec.ts`).

## Added Server And Runtime Behavior

- [x] Worktree naming prompt output is consumed before a composer-created worktree is added (`packages/client-runtime/src/localTopics/composer/index.ts`, `packages/client-runtime/src/state/threadCommands.ts`).
- [x] Context attachment metadata reaches provider request construction through runtime state (`packages/client-runtime/src/state/runtime.ts`, `apps/web/src/composerHandleContext.ts`).

## Added Tests

- [x] Composer menu, context, and state behavior is covered by focused web tests (`apps/web/src/components/chat/composerSlashCommandSearch.test.ts`, `apps/web/src/components/chat/ComposerPendingTerminalContexts.test.tsx`).
- [x] Mobile composer persistence stays covered by native-facing state tests (`apps/mobile/src/state/use-composer-drafts.test.ts`).
- [x] Headed Electron smoke coverage seeds past chats and asserts composer growth, context-window visibility, right-panel access, and terminal-drawer geometry (`apps/desktop/e2e/specs/chat-layout.spec.ts`, `apps/desktop/e2e/support/seedChatLayoutState.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `apps/web/src/localTopics/composer/index.ts` (source, internal)
- `apps/mobile/src/localTopics/composer/index.ts` (source, internal)
- `packages/client-runtime/src/localTopics/composer/index.ts` (source, internal)

## Integration Points

- `apps/web/src/components/composer`
- `apps/web/src/components/chat`
- `apps/web/src/components/ChatView.tsx`
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
- `vp run --filter @t3tools/desktop e2e:smoke -- chat-layout.spec.ts`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
