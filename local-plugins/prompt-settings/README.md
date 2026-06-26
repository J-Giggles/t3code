# Configurable Prompt Settings

## Purpose

Allow prompt defaults and overrides to be configured through shared settings and provider wiring.

## Current Commits

- `d155601a9ce30789399200c8b817ee84577bcfa0` `feat(prompt-settings): add configurable prompt settings`

## Squash / Replay History

This is the prompt settings topic from the June 25 replay stack.

## Added Features

- Prompt settings schema and defaults.
- Persisted prompt overrides.
- Provider prompt construction uses configured settings.

## Added UI

- Settings controls for prompt behavior and override values.

## Added Server And Runtime Behavior

- Server settings include prompt configuration.
- Provider adapters read shared prompt helpers instead of hardcoded prompt fragments.

## Added Tests

- Prompt settings schema, persistence, and provider prompt wiring tests.

## Component Entrypoints

Componentization status: `complete`.

- `packages/shared/src/localTopics/promptSettings/index.ts` (source, facade)
- `apps/server/src/localTopics/promptSettings/index.ts` (source, internal)
- `apps/web/src/localTopics/promptSettings/index.ts` (source, internal)

## Integration Points

- `packages/contracts/src/settings.ts`
- `apps/web/src/components/settings`
- `apps/server/src/provider`
- `packages/shared/src/prompts`

## Focused Implementation Snippets

`packages/shared/src/localTopics/promptSettings/index.ts`

```ts
export * from "../../prompts.ts";
export * from "../../serverSettings.ts";
```

`apps/server/src/localTopics/promptSettings/index.ts`

```ts
export * from "../../provider/CodexDeveloperInstructions.ts";
export * from "../../textGeneration/TextGenerationPrompts.ts";
```

## Replay Notes

Replay after composer so prompt configuration can apply to the enriched composer context flow.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
