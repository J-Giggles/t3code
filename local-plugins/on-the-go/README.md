# On-the-Go Voice Companion

## Purpose

Add a voice-first Theo companion that can announce durable agent responses, discuss them, prepare an exact next prompt, follow running chats, and submit only after “Send it” across Electron, native mobile, and foreground web.

## Current Commit

- `27a8180aee833c83c4ae8284bc9826c6fda76070` `feat(on-the-go): add voice-first Theo companion`

This commit applies directly to upstream `c1ec1915fc16f3dc1ec5d47d9a97f6210a574526` with every other Jordan topic absent. It includes its own focused unit suites and headed Electron harness.

## Added Features

- [x] One-device Voice Session ownership, local wake phrases, configurable Barge-In, push-to-talk fallback, protected dictation, wake-free Stop, and custom command aliases use schema-defined commands (`packages/contracts/src/localTopics/onTheGo/index.ts`, `apps/server/src/localTopics/onTheGo/Runtime.ts`, `packages/client-runtime/src/localTopics/onTheGo/VoiceParity.test.ts`).
- [x] Response, Attention, Prepared Prompt, Pending Turn, Follow, Theo Profile, handoff, model audit, and deletion state persist durably (`apps/server/src/localTopics/onTheGo/FoundationRuntime.ts`, `apps/server/src/localTopics/onTheGo/ProductionLayer.ts`).
- [x] Theo starts with the focused response and can retrieve bounded, redacted, untrusted evidence from relevant T3 threads, project docs/source, public HTTPS pages protected by DNS/SSRF checks, and registered connected-app adapters (`apps/server/src/localTopics/onTheGo/TheoContext.ts`, `apps/server/src/localTopics/onTheGo/TheoWorkspaceContext.ts`, `apps/server/src/localTopics/onTheGo/TheoExternalContext.ts`).
- [x] Theo learns reversible non-secret preferences and always requires an exact `Send it` before sending, steering, or handing off (`packages/client-runtime/src/localTopics/onTheGo/Controller.ts`, `apps/server/src/ws.ts`).
- [x] “No, steer the running agent” safely corrects an unchanged queued revision inside the ten-second window (`packages/client-runtime/src/localTopics/onTheGo/Controller.ts`, `apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts`).
- [x] “Send this to a new agent with the context needed on this project” builds a bounded package and isolated semantic worktree after `Send it` (`packages/client-runtime/src/localTopics/onTheGo/Controller.ts`, `apps/server/src/ws.ts`).

## Added UI

- [x] The accessible web/Electron Voice Dock exposes captions, transcripts, notification badges, Theo Profile, Follow Timeline, visible vocabulary, typed reciprocal controls, and the exact durable Prepared Prompt revision/target before Send it (`apps/web/src/localTopics/onTheGo/VoiceDock.tsx`, `packages/client-runtime/src/localTopics/onTheGo/Controller.ts`).
- [x] General Settings persists On-the-Go enablement, Barge-In, public/private output, wake phrases, independent supported STT/Theo/TTS selections, ordered approved Theo fallbacks, and remote-call warning/hard limits; unsupported saved speech selections fail closed with a visible reason (`apps/web/src/localTopics/onTheGo/OnTheGoSettingsPanel.tsx`, `apps/web/src/localTopics/onTheGo/BrowserSpeechAdapter.ts`).
- [x] Native mobile mounts a secure-identity Voice Dock using real platform recognition/TTS, a noisy-place push-to-talk override, reciprocal typed controls, and an On-the-Go launcher quick action (`apps/mobile/src/localTopics/onTheGo/OnTheGoNativeDock.tsx`, `apps/mobile/src/localTopics/onTheGo/NativeQuickAction.ts`, `apps/mobile/app.config.ts`).

## Added Server And Runtime Behavior

- [x] The server exposes one authorized dispatch/snapshot/event seam with crash-safe intent and idempotency persistence; durable device-to-auth-session bindings prevent disconnected voice identities from being reclaimed (`apps/server/src/localTopics/onTheGo/ProductionService.ts`, `apps/server/src/localTopics/onTheGo/ProductionLayer.ts`).
- [x] Retrieved context is staged only for an authorized device and owner scope, then discarded; durable evidence stores a hash and metadata rather than raw excerpts (`apps/server/src/localTopics/onTheGo/ProductionService.ts`, `apps/server/src/localTopics/onTheGo/ProductionService.test.ts`).
- [x] Provider events map conservatively to known Follow checkpoints, unknown events stay silent, completion tones coalesce, and protected conversations receive only the latest waiting summary (`apps/server/src/localTopics/onTheGo/ProviderCheckpoint.ts`, `packages/client-runtime/src/localTopics/onTheGo/Controller.ts`).
- [x] New-agent handoffs reuse the transactional thread/worktree bootstrap with bounded source evidence (`apps/server/src/ws.ts`).
- [x] Theo model use is audited, retries only explicitly approved fallbacks, announces fallback/near-budget use, and hard-stops remote calls without disabling local safety (`apps/server/src/localTopics/onTheGo/TheoConversation.ts`, `apps/server/src/localTopics/onTheGo/ProductionService.ts`).
- [x] Electron retains voice execution while minimized and permits audio capture only, while renderer throttling is disabled only for an enabled On-the-Go session; hosted web stops voice when hidden (`apps/desktop/src/localTopics/onTheGo/index.ts`, `apps/desktop/src/ipc/methods/window.ts`, `apps/web/src/localTopics/onTheGo/BrowserSpeechAdapter.ts`).

## Added Tests

- [x] Stable `OTG-UT-001`–`OTG-UT-023` IDs cover each accepted feature’s normal path, refusal/failure path, and durable or safety invariant (`docs/architecture/on-the-go-test-contract.md`, `apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts`).
- [x] Contracts, runtime, production service, controller, context/SSRF bounds and redaction, command parity, speech adapters, settings, Follow mapping, desktop policy, native policy, and launcher actions provide 106 focused deterministic tests across 20 unit/component files (`packages/contracts/src/localTopics/onTheGo/index.test.ts`, `apps/server/src/localTopics/onTheGo/TheoConversation.test.ts`, `apps/server/src/localTopics/onTheGo/TheoExternalContext.test.ts`, `packages/client-runtime/src/localTopics/onTheGo/SpeechPrivacy.test.ts`).
- [x] The standalone recognition-driven Electron POM launches the real desktop app and covers a real thread, activation, Theo state, wake-free Stop, the exact T3 announcement phrase, Follow start/stop, protected dictation, Prepared Prompt recovery after reload, queueing, steering correction, reciprocal controls, and renderer errors (`apps/desktop/e2e/specs/on-the-go.spec.ts`, `apps/desktop/e2e/localTopics/onTheGo/VoiceDockPage.ts`, `apps/desktop/e2e/support/electronHarness.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `packages/contracts/src/localTopics/onTheGo/index.ts` (public schemas)
- `packages/client-runtime/src/localTopics/onTheGo/index.ts` (shared controller and command parity)
- `apps/server/src/localTopics/onTheGo/index.ts` (server runtime)
- `apps/web/src/localTopics/onTheGo/index.ts` (web/Electron UI)
- `apps/desktop/src/localTopics/onTheGo/index.ts` (desktop capability policy)
- `apps/mobile/src/localTopics/onTheGo/index.ts` (native capability and launcher policy)

## Integration Points

- `packages/contracts/src/index.ts`, `packages/contracts/src/rpc.ts`, and `packages/contracts/src/settings.ts`
- `packages/client-runtime/src/rpc/client.ts` and `packages/client-runtime/package.json`
- `apps/server/src/server.ts` and `apps/server/src/ws.ts`
- `apps/web/src/routes/__root.tsx` and `apps/web/src/components/settings/SettingsPanels.tsx`
- `apps/desktop/src/electron/ElectronWindow.ts` and `apps/desktop/src/window/DesktopWindow.ts`
- `apps/mobile/src/App.tsx`, `apps/mobile/src/features/shortcuts/appShortcuts.ts`, and `apps/mobile/app.config.ts`
- `package.json`, `apps/desktop/package.json`, `pnpm-lock.yaml`, and `vite.config.ts` for the standalone headed harness

## Replay Notes

Apply the feature commit as one topic after the provider, composer, project-agent, and observability topics and before generic desktop test/operations topics. Keep upstream files as thin wiring. Do not auto-map unknown provider events, weaken voice ownership, retain fetched excerpts, silently substitute models, or bypass `Send it` to resolve a replay conflict.

## Verification

- `pnpm exec vp check`
- `pnpm exec vp run typecheck`
- `pnpm exec vp run lint:mobile`
- `pnpm exec vp test packages/contracts/src/localTopics/onTheGo apps/desktop/src/localTopics/onTheGo apps/mobile/src/localTopics/onTheGo apps/mobile/src/features/shortcuts/appShortcuts.test.ts apps/server/src/localTopics/onTheGo apps/web/src/localTopics/onTheGo packages/client-runtime/src/localTopics/onTheGo`
- `pnpm run test:on-the-go:e2e -- --reporter=line`
- `pnpm --filter @t3tools/mobile run config:dev -- --type public`

## Known Operational Checks

Native locked-screen/background listening, Bluetooth/headset routing, Android secure hands-free intent behavior, and OS audio-focus interaction remain physical-device release checks. The deterministic native policy tests and Expo config validation must remain green on every replay.
