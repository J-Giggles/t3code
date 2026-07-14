# On-the-Go Runtime Contracts

Status: Slices 1–2 contract, deterministic-harness, and durable-foundation reference. Production transport, provider, and client wiring are not yet implemented.

The schema-only public contracts are exported from `@t3tools/contracts` and owned by `packages/contracts/src/localTopics/onTheGo/index.ts`. Runtime policy and its internal adapter ports are owned by `apps/server/src/localTopics/onTheGo/`.

## Stable Runtime Interface

The runtime exposes three operations:

- `dispatch(command)` returns an idempotent typed disposition.
- `events(scope)` returns ordered typed events only after the read scope is authorized.
- `snapshot(scope)` returns an isolated durable-state copy only after the read scope is authorized.

Callers cannot mutate runtime state through returned snapshots or event arrays. A repeated `commandId` returns its persisted disposition without repeating an event or side effect.

## Commands And Dispositions

Slice 1 defines schema-validated commands for mode transitions, ownership acquisition/handoff/continuation, wake detection, Barge-In settings, speech interruption, dictation capture, vocabulary aliases, action resolution, and exact confirmation.

Every command carries `OnTheGoCommandId`. Successful commands return `accepted`; rejected commands return a cataloged reason; consequential actions first return `confirmation-required` with the exact action, target, confirmation identity, and expiry.

Off rejects voice actions and confirmations. Active voice work requires one trusted owner whose handoff/restart continuation gate has been cleared. Unavailable modes, unknown wake phrases, non-catalog model actions, changed confirmation targets, expired confirmations, generic yes, and ambiguous confirmation speech fail closed.

## Settings And Retention

`OnTheGoSettings` keeps transcription, Theo reasoning, and speech selections in separate capability-typed fields. It also records wake phrases, Barge-In, output privacy, and the confirmation window.

`OnTheGoRetentionPolicy` makes the accepted privacy limits machine-readable:

- Raw audio: discard after every transcription attempt.
- Active responses: 30 days.
- Attention: no age expiry.
- Device speech cache: at most 24 hours.
- Lifecycle tombstones: 90 days.

## Internal Adapter Ports

The runtime owns adapters for authorization, capabilities, clock, device trust, persistence/idempotency, wake detection, raw audio, transcription, audio output/focus, command and Theo models, provider checkpoints, context fetch, connectivity, and Turn Scheduler delivery. Production implementations remain internal; deterministic fakes use the same ports. The production service is server-scoped, persists crash-safe intent and idempotency state under the authenticated server base directory, and releases subscriptions and schedulers on shutdown. Provider event ingestion is owned by a server-lifetime layer rather than an individual WebSocket, so queue, Attention, and Follow state continue to advance while no renderer is connected.

## Slice 1 Evidence

- `OTG-UT-001` through `OTG-UT-006`: `apps/server/src/localTopics/onTheGo/Runtime.test.ts`
- Schema/settings/retention decoding: `packages/contracts/src/localTopics/onTheGo/index.test.ts`
- Deterministic adapter contract: `apps/server/src/localTopics/onTheGo/Adapters.test.ts`

Headed Electron and Page Object coverage begins with the Electron vertical slice defined in `docs/architecture/on-the-go-topic-handoff.md`; this schema/runtime slice has no user-facing surface to drive.

## Durable Foundation

The snapshot's `foundation` read model owns durable Response and Attention queues, bounded announcements,
versioned Theo preferences, Prepared Prompt revisions, scheduler submissions, queue recovery, minimal context
evidence, isolated new-agent handoffs, model fallback audit, speech-cache expiry, and deletion tombstones.

All mutations remain schema-defined commands through `dispatch`. Device identity is mandatory, prompt delivery is
bound to an exact ready revision, voice delivery requires `Send it`, scheduler intent is explicit, steering is
bound to the expected active turn, and unknown/offline outcomes never auto-send. Retrieved context remains evidence
and cannot alter Theo's fixed read-only or handoff rules.

Slice 2 deterministic evidence:

- `apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts` (`OTG-UT-007`–`OTG-UT-016`, `OTG-UT-019`,
  `OTG-UT-020`, and `OTG-UT-022`)
- `apps/server/src/localTopics/onTheGo/FoundationRuntime.ts`
- `packages/contracts/src/localTopics/onTheGo/foundation.ts`

## Production Clients, Context, And Platform Policy

`packages/client-runtime/src/localTopics/onTheGo/Controller.ts` is the shared voice controller. Electron and foreground web use `apps/web/src/localTopics/onTheGo/BrowserSpeechAdapter.ts`; Electron disables renderer background throttling only while On-the-Go is enabled and grants audio capture only. Native mobile uses `expo-speech-recognition`, `expo-speech`, and background `expo-audio` configuration with OS microphone and foreground-service indicators. Hosted web stops listening when hidden.

Settings are server-authoritative under `ServerSettings.onTheGo`. STT, Theo, and TTS are capability-separated selections. Theo uses the configured reasoning selection; unsupported platform speech selections fail closed with a visible reason rather than silently invoking an unapproved provider.

Theo normally receives bounded focused-thread context. Retrieval cues can add at most three relevant T3 threads and three relevant allowlisted project documents/source files after path containment, symlink, size, secret, and code-fence checks. An explicit public HTTPS URL is fetched only after protocol, port, hostname, DNS, redirect, content-type, timeout, and size checks reject private/tailnet/loopback egress; optional connected-app topics register bounded read-only providers. Retrieved excerpts are untrusted evidence, are staged only for the authorized voice owner, and are removed after the runtime records hash-only evidence.

`apps/server/src/localTopics/onTheGo/TheoConversation.ts` resolves the selected reasoning model plus deduplicated user-approved fallbacks. Every attempt consumes the authenticated Voice Session budget and records policy-approved model use. Fallback and near-limit notices are included in Theo's response; a hard limit returns a local explanation while Stop and other local safety controls remain available.

Follow adapters map only known plan, edit, test, approval, blocker, and terminal activity. Unknown provider events remain silent. Timeline summaries retain checkpoint evidence without marking Response Queue items handled.

Context sources declare which reasoning providers may receive their excerpts. Candidate-specific egress filtering runs again for every primary or approved fallback model, so a fallback cannot inherit evidence that its provider is not authorized to receive. Shared sensitive-text filtering removes bearer tokens, credentials, private keys, connection strings, and common secret assignments before context, announcements, speech, or handoff packaging.

Native mobile reads real OS microphone permission, audio route, call/audio-focus state, interruption notifications, and low-power state through the `t3-native-controls` Expo module. The pure native policy remains deterministic and fail-closed when the OS reports an unknown route or unavailable permission. Browser and native speech adapters select only the configured model or an ordered, explicitly approved compatible fallback.

Follow summaries use the stable `What changed`, `Risk`, and `Next` structure. Server restart and archive pause Follow until an explicit resume; deletion clears the followed target. Prompt cancellation durably cancels an active Pending Turn and rejects any outstanding consequential confirmation before local state is cleared.

Runtime event logs, response/attention queues, timelines, model audit, context evidence, disposition history, handoffs, and profiles have deterministic caps with soak coverage. `apps/server/src/localTopics/onTheGo/IntegrationContract.test.ts` additionally fails closed when the topic's semantic RPC, lifecycle, event-ingestion, or renderer seams drift.

## Verification

- `OTG-UT-001`–`OTG-UT-023`: the feature-level matrix in `docs/architecture/on-the-go-test-contract.md`
- Focused unit and component suite: 107 tests across 25 contracts, shared privacy, server, controller, web, desktop, and native mobile files
- Recognition-driven headed Electron POM: `apps/desktop/e2e/specs/on-the-go.spec.ts`
- Mobile plugin/config resolution: `pnpm --filter @t3tools/mobile run config:dev -- --type public`
- Repository gates: `pnpm exec vp check`, `pnpm exec vp run typecheck`, and `pnpm exec vp run lint:mobile`
