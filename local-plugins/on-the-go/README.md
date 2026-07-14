# On-the-Go Voice Companion

## Purpose

Add a voice-first Theo companion that can announce durable agent responses, discuss them, prepare an exact next prompt, follow running chats, and submit only after “Send it” across Electron, native mobile, and foreground web.

## Current Commits

- `d225f64c448cc5bfc6cd9cb0915703ca89ef179d` `feat(on-the-go): add voice-first Theo companion`
- `1578b0149a693b09dd672c9b44bd42f91d94b5ef` `fix(on-the-go): add reliable local voice transcription`
- `cf00e51ad3d4857cefe70c8fa61da6435af5c144` `fix(on-the-go): restore macOS microphone permission identity`
- `e9bdda63c75514aeb84e2dae1ea3634cd742624f` `refactor(on-the-go): isolate macOS launcher runtime`
- `7cae5386642e5ef6de9b62b8485b3d159a2ad714` `fix(on-the-go): normalize cached macOS frameworks`
- `0c222a3c22dfaf9b2bd760b8ba6ada0810f79554` `fix(on-the-go): harden local whisper input`
- `4c526ea85f02101bfb0d429831c3c8778b6840f2` `fix(on-the-go): keep typed Theo available`
- `79c26a7674ac26159ee1c5d4d04e2ba18aa0adfe` `fix(on-the-go): allow typed ownership continuation`

This is the staging-stack replay of clean source topic `5a529884f6c6d84c219f6245a3b7da68599d5a52`, which applies directly to upstream `c1ec1915fc16f3dc1ec5d47d9a97f6210a574526` with every other Jordan topic absent. The staging replay preserves its focused unit suites and headed Electron harness while wiring through the established routed-server and launcher topics.

The follow-up transcription topic replaces Electron's network-dependent browser recognizer with bounded PCM sent to an approved local Whisper model in the selected active T3 environment. It includes fail-closed runtime handling, a real PipeWire microphone gate, and a 30-phrase Mac acoustic audit.

The macOS permission follow-up keeps development launches inside a signed Mach-O app bundle owned by LaunchServices, carries the hardened-runtime audio-input entitlement, requests native microphone consent before granting Chromium media access, and cleans up the detached app tree during restart or shutdown.

The launcher-runtime refactor keeps that behavior behind the topic-owned macOS module and gives headed runs an explicit isolated profile and CDP port, so test launch state cannot spill into the normal login profile or keychain.

The cached-framework follow-up restores canonical version symlinks when an existing Electron install contains flattened framework aliases, keeping repeated Staging launches signable without replacing application data.

The Whisper input follow-up wraps captured PCM in a private temporary 16 kHz WAV, uses the supported `whisper-cli` file interface, deletes the audio after every attempt, and prevents early CLI exits from crashing the backend with an unhandled stdin `EPIPE`.

## Squash / Replay History

The clean upstream replay was rebuilt as one feature commit, then replayed onto the established staging topic stack. The staging replay resolves only integration seams for routed WebSockets, app automation, desktop launch isolation, mobile root wiring, and existing settings while preserving the same On-the-Go contracts and tests.

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
- [x] Electron captures bounded microphone PCM and sends it to the selected active T3 environment for local Whisper transcription; ordinary web keeps its browser-recognition fallback, and runtime recognition failures turn the mode off with a visible reason (`apps/web/src/localTopics/onTheGo/PcmSpeechRecognition.ts`, `apps/server/src/localTopics/onTheGo/PcmTranscription.ts`).
- [x] macOS shows `T3 Code (Dev)` in Privacy & Security > Microphone because the launcher remains a signed app bundle and waits for native consent before granting the renderer's audio-only request (`apps/desktop/scripts/electron-launcher.mjs`, `apps/desktop/src/localTopics/onTheGo/index.ts`).
- [x] Native mobile mounts a secure-identity Voice Dock using platform recognition/TTS plus real OS microphone permission, route, call/audio-focus, interruption, and low-power state; a noisy-place push-to-talk override, reciprocal typed controls, and an On-the-Go launcher quick action remain available (`apps/mobile/src/localTopics/onTheGo/OnTheGoNativeDock.tsx`, `apps/mobile/src/localTopics/onTheGo/NativeAudioPolicy.ts`, `apps/mobile/modules/t3-native-controls/expo-module.config.json`).

## Added Server And Runtime Behavior

- [x] The server exposes one authorized dispatch/snapshot/event seam with crash-safe intent and idempotency persistence; durable device bindings survive desktop session rotation through a stable authenticated principal while active sessions and other principals remain isolated (`apps/server/src/localTopics/onTheGo/ProductionService.ts`, `apps/server/src/localTopics/onTheGo/ProductionLayer.ts`).
- [x] Retrieved context is staged only for an authorized device and owner scope, then discarded; durable evidence stores a hash and metadata rather than raw excerpts (`apps/server/src/localTopics/onTheGo/ProductionService.ts`, `apps/server/src/localTopics/onTheGo/ProductionService.test.ts`).
- [x] Provider events map conservatively to known Follow checkpoints, unknown events stay silent, completion tones coalesce, and protected conversations receive only the latest waiting summary (`apps/server/src/localTopics/onTheGo/ProviderCheckpoint.ts`, `packages/client-runtime/src/localTopics/onTheGo/Controller.ts`).
- [x] Provider event ingestion is server-lifetime rather than WebSocket-lifetime; real completions alone advance delivery, approvals/failures freeze safely, and Cancel durably cancels the active Pending Turn plus any outstanding confirmation (`apps/server/src/localTopics/onTheGo/EventIngestion.ts`, `apps/server/src/localTopics/onTheGo/ProductionService.ts`, `packages/client-runtime/src/localTopics/onTheGo/Controller.ts`).
- [x] Shared sensitive-text redaction, per-candidate context-egress filtering, and bounded durable histories protect announcements, fetched context, speech, handoffs, fallback models, and long-running sessions (`packages/shared/src/sensitiveText.ts`, `apps/server/src/localTopics/onTheGo/TheoConversation.ts`, `apps/server/src/localTopics/onTheGo/ProductionLayer.test.ts`).
- [x] New-agent handoffs reuse the transactional thread/worktree bootstrap with bounded source evidence (`apps/server/src/ws.ts`).
- [x] Theo model use is audited, retries only explicitly approved fallbacks, announces fallback/near-budget use, and hard-stops remote calls without disabling local safety (`apps/server/src/localTopics/onTheGo/TheoConversation.ts`, `apps/server/src/localTopics/onTheGo/ProductionService.ts`).
- [x] Electron retains voice execution while minimized and permits audio capture only, while renderer throttling is disabled only for an enabled On-the-Go session; hosted web stops voice when hidden (`apps/desktop/src/localTopics/onTheGo/index.ts`, `apps/desktop/src/ipc/methods/window.ts`, `apps/web/src/localTopics/onTheGo/BrowserSpeechAdapter.ts`).
- [x] The topic-owned macOS launcher module signs the outer app and Electron helpers with explicit main/child entitlements, stores mutable launch environment outside the signed bundle, launches through LaunchServices, and terminates the real app tree before its `open -W` supervisor (`apps/desktop/scripts/localTopics/onTheGo/mac-development-launcher.mjs`, `apps/desktop/scripts/localTopics/onTheGo/sign-mac-launcher.mjs`, `apps/desktop/scripts/dev-electron.mjs`).
- [x] The authorized `onTheGo.transcribe` seam validates 16 kHz mono PCM bounds, resolves only an approved local Whisper model, writes a private temporary WAV for the supported CLI file interface, applies a hard subprocess timeout, and discards audio after each attempt without exposing a crash-prone stdin pipe (`packages/contracts/src/rpc.ts`, `apps/server/src/localTopics/onTheGo/PcmTranscription.ts`, `apps/server/src/ws.ts`).
- [x] The Voice Dock can reacquire its local typed-control session and enter Theo Conversation after microphone transcription becomes unavailable, so a bad input device cannot disable the exact typed command field (`packages/client-runtime/src/localTopics/onTheGo/Controller.ts`, `packages/client-runtime/src/localTopics/onTheGo/Controller.test.ts`).

## Added Tests

- [x] Stable `OTG-UT-001`–`OTG-UT-024` IDs cover each accepted feature’s normal path, refusal/failure path, and durable or safety invariant (`docs/architecture/on-the-go-test-contract.md`, `apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts`, `apps/server/src/localTopics/onTheGo/ProductionService.test.ts`).
- [x] Contracts, runtime, production service, server-lifetime ingestion, controller, context/SSRF bounds and redaction, command parity, model fallback, settings, Follow mapping, durable soak caps, semantic integration seams, desktop policy, native OS audio policy, launcher actions, Whisper WAV/process failure handling, and microphone-independent typed Theo recovery provide 110 focused deterministic tests across 27 unit/component files (`packages/contracts/src/localTopics/onTheGo/index.test.ts`, `packages/shared/src/sensitiveText.test.ts`, `apps/server/src/localTopics/onTheGo/IntegrationContract.test.ts`, `apps/server/src/localTopics/onTheGo/PcmTranscription.test.ts`, `packages/client-runtime/src/localTopics/onTheGo/Controller.test.ts`).
- [x] The standalone recognition-driven Electron POM launches the real desktop app and covers a real thread, activation, Theo state, wake-free Stop, the exact T3 announcement phrase, Follow start/stop, protected dictation, Prepared Prompt recovery after reload, queueing, steering correction, reciprocal controls, and renderer errors (`apps/desktop/e2e/specs/on-the-go.spec.ts`, `apps/desktop/e2e/localTopics/onTheGo/VoiceDockPage.ts`, `apps/desktop/e2e/support/electronHarness.ts`).
- [x] An opt-in real-audio Electron test creates a transient PipeWire microphone and proves spoken-fixture capture through the actual local Whisper RPC; pure detector, payload-bound, unavailable-model, and fail-closed tests remain deterministic in the normal suite (`apps/desktop/e2e/specs/on-the-go.spec.ts`, `apps/web/src/localTopics/onTheGo/PcmSpeechRecognition.test.ts`, `apps/server/src/localTopics/onTheGo/PcmTranscription.test.ts`, `docs/operations/on-the-go-audio-verification.md`).
- [x] macOS launcher tests require a valid deep signature, audio-input and development library-validation entitlements, Mach-O execution, helper entitlements, stable product identity, LaunchServices invocation, and child-first shutdown (`apps/desktop/scripts/electron-launcher.test.mjs`, `apps/desktop/scripts/dev-process-cleanup.test.mjs`, `apps/desktop/src/localTopics/onTheGo/index.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `packages/contracts/src/localTopics/onTheGo/index.ts` (public schemas)
- `packages/client-runtime/src/localTopics/onTheGo/index.ts` (shared controller and command parity)
- `apps/server/src/localTopics/onTheGo/index.ts` (server runtime)
- `apps/web/src/localTopics/onTheGo/index.ts` (web/Electron UI)
- `apps/desktop/src/localTopics/onTheGo/index.ts` (desktop capability policy)
- `apps/desktop/scripts/localTopics/onTheGo/mac-development-launcher.mjs` (signed macOS development launcher policy)
- `apps/mobile/src/localTopics/onTheGo/index.ts` (native capability and launcher policy)

## Integration Points

- `packages/contracts/src/index.ts`, `packages/contracts/src/rpc.ts`, and `packages/contracts/src/settings.ts`
- `packages/client-runtime/src/rpc/client.ts` and `packages/client-runtime/package.json`
- `apps/server/src/server.ts` and `apps/server/src/ws.ts`
- `apps/web/src/routes/__root.tsx` and `apps/web/src/components/settings/SettingsPanels.tsx`
- `apps/desktop/src/electron/ElectronWindow.ts` and `apps/desktop/src/window/DesktopWindow.ts`
- `apps/desktop/scripts/electron-launcher.mjs` and `apps/desktop/scripts/dev-electron.mjs`
- `apps/mobile/src/App.tsx`, `apps/mobile/src/localTopics/onTheGo/OnTheGoNativeDock.tsx`, and `apps/mobile/app.config.ts`
- `package.json`, `apps/desktop/package.json`, `pnpm-lock.yaml`, and `vite.config.ts` for the standalone headed harness

## Focused Implementation Snippets

`apps/server/src/localTopics/onTheGo/index.ts`

```ts
export * from "./ProductionService.ts";
export * from "./ProductionLayer.ts";
export { ingestOnTheGoEvent } from "./EventIngestion.ts";
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

Apply the feature commit as one topic after the provider, composer, project-agent, and observability topics and before generic desktop test/operations topics. Keep upstream files as thin wiring. Do not auto-map unknown provider events, weaken voice ownership, retain fetched excerpts, silently substitute models, or bypass `Send it` to resolve a replay conflict.

## Verification

- `pnpm exec vp check`
- `pnpm exec vp run typecheck`
- `pnpm exec vp run lint:mobile`
- `pnpm exec vp test run packages/contracts/src/localTopics/onTheGo packages/shared/src/sensitiveText.test.ts apps/desktop/src/localTopics/onTheGo apps/mobile/src/localTopics/onTheGo apps/server/src/localTopics/onTheGo apps/web/src/localTopics/onTheGo packages/client-runtime/src/localTopics/onTheGo`
- `pnpm exec vp test run apps/desktop/scripts/electron-launcher.test.mjs apps/desktop/scripts/dev-process-cleanup.test.mjs apps/desktop/src/window/DesktopWindow.test.ts`
- `pnpm run test:on-the-go:e2e -- --reporter=line`
- `T3CODE_ON_THE_GO_AUDIO_FIXTURE=/path/to/hey-theo.aiff T3CODE_ON_THE_GO_WHISPER_MODEL=/path/to/ggml-base.en.bin T3CODE_ON_THE_GO_WHISPER_CLI=/path/to/whisper-cli pnpm run test:on-the-go:e2e:headed -- --grep @audio --reporter=line`
- `pnpm --filter @t3tools/mobile run config:dev -- --type public`

## Known Operational Checks

Native locked-screen/background listening, Bluetooth/headset routing, Android secure hands-free intent behavior, and OS audio-focus interaction remain physical-device release checks. The deterministic native policy tests and Expo config validation must remain green on every replay.

Electron local transcription additionally requires the selected active T3 environment to expose an approved Whisper CLI/model. Missing models and microphone/RPC failures fail closed visibly rather than silently falling back to a network recognizer.

On macOS, enabling On-the-Go must register `T3 Code (Dev)` under System Settings > Privacy & Security > Microphone. If it is absent, verify the running executable is the worktree's `.electron-runtime/T3 Code (Dev).app/Contents/MacOS/Electron`, validate its deep code signature and `com.apple.security.device.audio-input` entitlement, then relaunch before testing the input meter.

## Known Follow-Up Work

- Complete the documented physical-device release checks before claiming locked-screen or headset behavior on a new iOS or Android release.
- Keep the stable `OTG-UT-001`–`OTG-UT-024` acceptance IDs and focused headed workflow synchronized whenever voice vocabulary, authentication lifecycle, or provider event mappings change.
