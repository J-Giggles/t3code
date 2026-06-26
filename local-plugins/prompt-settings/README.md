# Configurable Prompt Settings

## Purpose

Allow prompt defaults and overrides to be configured through shared settings and provider wiring.

## Current Commits

- `a5aa5e450ddf02bc21108880da2a37f928fa13be` `feat(prompt-settings): add configurable prompt settings`

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

Pending legacy extraction:

- `apps/web/src/localTopics/promptSettings/index.ts`
- `apps/server/src/localTopics/promptSettings/index.ts`
- `packages/shared/src/localTopics/promptSettings/index.ts`

## Integration Points

- `packages/contracts/src/settings.ts`
- `apps/web/src/components/settings`
- `apps/server/src/provider`
- `packages/shared/src/prompts`

## Focused Implementation Snippets

`packages/shared/src/prompts`

```ts
resolvePromptSettings(serverSettings);
buildProviderSystemPrompt({ defaults, overrides });
```

`packages/contracts/src/settings.ts`

```ts
PromptSettings;
PromptOverride;
ServerSettingsPatch;
```

## Replay Notes

Replay after composer so prompt configuration can apply to the enriched composer context flow.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Extract prompt setting controls and provider prompt adapters behind topic modules.
