# On-the-Go Voice Companion

## Purpose

Add a voice-first Theo companion that can announce durable agent responses, discuss them, prepare an exact next prompt, follow running chats, and submit only after “Send it” across Electron, native mobile, and foreground web.

## Current Commits

- `65be9cfb02f27ddb43ab399178270401423ae44c` `feat(on-the-go): add voice-first Theo companion`

## Squash / Replay History

The accepted design documents, deterministic slices, production desktop/Follow slice, settings, native mobile, and handoff slice were squashed into the single replay commit above. Backup refs retain the pre-squash development checkpoints.

## Added Features

- [x] One-device Voice Session ownership, local wake phrases, configurable Barge-In, protected dictation, and wake-free Stop use schema-defined commands (`packages/contracts/src/localTopics/onTheGo/index.ts`, `apps/server/src/localTopics/onTheGo/Runtime.ts`).
- [x] Response, Attention, Prepared Prompt, Pending Turn, Follow, Theo Profile, handoff, model audit, and deletion state persist durably (`apps/server/src/localTopics/onTheGo/FoundationRuntime.ts`, `apps/server/src/localTopics/onTheGo/ProductionLayer.ts`).
- [x] Theo discusses bounded authorized evidence, learns reversible non-secret preferences, and always requires an exact `Send it` before handoff (`packages/client-runtime/src/localTopics/onTheGo/Controller.ts`, `apps/server/src/ws.ts`).
- [x] “No, steer the running agent” safely corrects an unchanged queued revision inside the ten-second window (`packages/client-runtime/src/localTopics/onTheGo/Controller.ts`, `apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts`).
- [x] “Send this to a new agent with the context needed on this project” builds a bounded package and isolated semantic worktree after `Send it` (`packages/client-runtime/src/localTopics/onTheGo/Controller.ts`, `apps/server/src/ws.ts`).

## Added UI

- [x] The accessible web/Electron Voice Dock exposes captions, transcripts, badges, Theo Profile, Follow Timeline, and reciprocal controls (`apps/web/src/localTopics/onTheGo/VoiceDock.tsx`).
- [x] General Settings persists On-the-Go enablement, Barge-In, public/private output, wake phrases, and independent STT/Theo/TTS selections (`apps/web/src/localTopics/onTheGo/OnTheGoSettingsPanel.tsx`, `packages/contracts/src/settings.ts`).
- [x] Native mobile mounts a secure-identity Voice Dock using real platform speech recognition/TTS and background microphone configuration (`apps/mobile/src/localTopics/onTheGo/OnTheGoNativeDock.tsx`, `apps/mobile/app.config.ts`).

## Added Server And Runtime Behavior

- [x] The server exposes one authorized dispatch/snapshot/event seam with crash-safe intent and idempotency persistence (`apps/server/src/localTopics/onTheGo/ProductionService.ts`, `apps/server/src/ws.ts`).
- [x] Provider events map conservatively to known Follow checkpoints; unknown events stay silent and quiet ticks are scheduled (`apps/server/src/localTopics/onTheGo/ProviderCheckpoint.ts`, `apps/server/src/localTopics/onTheGo/ProductionService.ts`).
- [x] New-agent handoffs reuse the existing transactional thread/worktree bootstrap with bounded source evidence (`apps/server/src/ws.ts`).
- [x] Electron retains voice execution while minimized and permits audio capture only (`apps/desktop/src/window/DesktopWindow.ts`, `apps/desktop/src/localTopics/onTheGo/index.ts`).

## Added Tests

- [x] Stable `OTG-UT-001`–`OTG-UT-023` IDs cover normal paths, refusal/failure paths, and durable/safety invariants (`docs/architecture/on-the-go-test-contract.md`, `apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts`).
- [x] Contracts, runtime, production service, controller, speech adapters, settings, Follow mapping, desktop policy, and native policy have focused tests (`packages/contracts/src/localTopics/onTheGo/index.test.ts`, `packages/client-runtime/src/localTopics/onTheGo/Controller.test.ts`, `apps/mobile/src/localTopics/onTheGo/NativeVoicePolicy.test.ts`).
- [x] The recognition-driven headed Electron POM covers activation, Theo, Stop, empty announcements, reciprocal controls, and renderer errors (`apps/desktop/e2e/specs/on-the-go.spec.ts`, `apps/desktop/e2e/localTopics/onTheGo/VoiceDockPage.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `packages/contracts/src/localTopics/onTheGo/index.ts` (public schemas)
- `packages/client-runtime/src/localTopics/onTheGo/index.ts` (shared controller)
- `apps/server/src/localTopics/onTheGo/index.ts` (server runtime)
- `apps/web/src/localTopics/onTheGo/index.ts` (web/Electron UI)
- `apps/desktop/src/localTopics/onTheGo/index.ts` (desktop capability policy)
- `apps/mobile/src/localTopics/onTheGo/index.ts` (native capability policy)

## Integration Points

- `packages/contracts/src/index.ts`, `packages/contracts/src/rpc.ts`, and `packages/contracts/src/settings.ts`
- `packages/client-runtime/src/wsRpcClient.ts` and `packages/client-runtime/package.json`
- `apps/server/src/ws.ts`
- `apps/web/src/routes/__root.tsx` and `apps/web/src/components/settings/SettingsPanels.tsx`
- `apps/desktop/src/window/DesktopWindow.ts`
- `apps/mobile/src/App.tsx` and `apps/mobile/app.config.ts`

## Focused Implementation Snippets

`packages/client-runtime/src/localTopics/onTheGo/index.ts`

```ts
export * from "./Controller.ts";
```

`apps/server/src/localTopics/onTheGo/index.ts`

```ts
export * from "./CommandRegistry.ts";
export * from "./FoundationRuntime.ts";
export * from "./Ports.ts";
export * from "./Runtime.ts";
```

`apps/web/src/localTopics/onTheGo/index.ts`

```ts
export * from "./BrowserSpeechAdapter.ts";
export * from "./VoiceDock.tsx";
export * from "./OnTheGoRoot.tsx";
export * from "./OnTheGoSettingsPanel.tsx";
```

## Replay Notes

Replay after the provider, composer, project-agent, and observability topics and before generic desktop test/operations topics. Keep existing upstream files as thin wiring. Do not auto-map unknown provider events, weaken voice ownership, or bypass `Send it` to resolve a replay conflict.

## Verification

- `vp check`
- `vp run typecheck`
- `vp run lint:mobile`
- `pnpm run topic-plugins:check`
- `pnpm exec vp test run packages/contracts/src/localTopics/onTheGo/index.test.ts packages/client-runtime/src/localTopics/onTheGo/Controller.test.ts apps/server/src/localTopics/onTheGo/Runtime.test.ts apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts apps/server/src/localTopics/onTheGo/ProductionService.test.ts apps/web/src/localTopics/onTheGo/BrowserSpeechAdapter.test.ts apps/mobile/src/localTopics/onTheGo/NativeVoicePolicy.test.ts`
- `pnpm --dir apps/desktop e2e:headed -- e2e/specs/on-the-go.spec.ts --timeout=300000`

## Known Follow-Up Work

- No pending replay entrypoints remain. Live-provider voice-model availability and native device-matrix releases remain operational compatibility checks, not missing topic wiring.
