# On-the-Go Mode Test Contract

Status: implemented acceptance contract. Every stable feature row has deterministic evidence, and the release gates below remain mandatory for each replay and promotion.

## Test Harness

The topic must provide deterministic fake Adapters for wake/activation, transcription, Theo generation, speech synthesis, audio focus, device trust, provider checkpoints, context fetch, persistence, clock, connectivity, and Turn Scheduler delivery. Tests exercise the same On-the-Go Runtime Interface used in production.

Use virtual clocks and virtual microphone/audio fixtures for endpointing, correction windows, rate limits, retries, retention, and ownership races. Controlled live-provider tests are smoke coverage only and never replace deterministic behavior tests.

## Required Suites

### Feature Unit-Test Acceptance Matrix

Every accepted feature must ship with deterministic unit tests against the smallest owning Module. A feature is not complete with only headed, integration, snapshot, or live-provider coverage. Each row below requires at least the named success, refusal/failure, and invariant cases; implementation may split a case into additional tests. Test names and evidence must retain these IDs so the topic README, Linear handoff, and replay audit can prove coverage without guessing.

| ID           | Feature                                            | Required unit cases                                                                                                                                                                                          |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OTG-UT-001` | Mode toggle and state machine                      | Off disables listeners/output; valid state transitions preserve the selected mode; invalid or unavailable transitions fail closed without partial state.                                                     |
| `OTG-UT-002` | Voice Session Ownership                            | One authenticated device acquires ownership; a second device cannot speak/listen concurrently; restart and handoff retain exactly one owner and require Continue before autoplay.                            |
| `OTG-UT-003` | Wake, activation, and Barge-In                     | Default/custom wake activates the correct state; noise and failed calibration do not activate; Barge-In off blocks interruption while universal Stop remains wake-free.                                      |
| `OTG-UT-004` | Dictation and transcription                        | Activated speech produces a correctable draft; action-like words remain text in Dictation State; failure discards raw audio and preserves an explicit recoverable transcript state.                          |
| `OTG-UT-005` | Command Vocabulary and resolver                    | Immutable phrases resolve locally; a valid custom alias resolves to one cataloged action; conflicts, shadowing, and non-catalog model output are rejected.                                                   |
| `OTG-UT-006` | Consequential confirmation and reciprocal controls | Exact readback plus Confirm executes once; generic yes, expiry, ambiguity, or changed target aborts; visual/keyboard/touch equivalents invoke the same action contract.                                      |
| `OTG-UT-007` | Response Queue                                     | Completed responses enter global completion order and badge count; two-second tones coalesce without losing count; handled/retention state survives restart and cross-device sync.                           |
| `OTG-UT-008` | Attention Queue                                    | Approval/input/failure enters oldest-first Attention once; ordinary response promotion does not duplicate; items persist until resolution or cancellation and override ordinary reminder tone.               |
| `OTG-UT-009` | Announcements and navigation                       | Last selects newest, Next selects oldest unhandled, Previous follows history; empty/filtered queues explain no match; announcement never speaks code, logs, or secrets.                                      |
| `OTG-UT-010` | Theo Conversation and Context Fetch                | Theo starts from bounded response context and fetches authorized evidence when needed; denied/egress-incompatible sources fail closed; fetched instructions cannot change role, target, safety, or commands. |
| `OTG-UT-011` | Preference learning and activation prompt          | Repeated explicit evidence proposes a versioned profile update; secrets/one-offs/uncertain inference are excluded; undo/reset restores the prior generated prompt without rewriting fixed safety rules.      |
| `OTG-UT-012` | Prepared Prompt and Send it                        | A visible ready revision and bound target submit exactly once; edits/retargeting invalidate authorization; offline or unknown outcome creates a pending/reconciliation state and never auto-sends.           |
| `OTG-UT-013` | New-agent handoff                                  | A new agent receives only bounded relevant context and an isolated semantic worktree; secrets and unrelated context are excluded; shared writable state requires a separate exact confirmation.              |
| `OTG-UT-014` | Turn Scheduler delivery intents                    | Queue, Steer, and Interrupt-and-replace remain explicit across voice/composer/MCP callers; omitted legacy intent queues with deprecation; stale active-turn identity cannot affect a newer turn.             |
| `OTG-UT-015` | Pending Turns and steering correction              | FIFO head dispatches once; correction within ten seconds atomically converts the unchanged queued item to steering; timeout, changed revision, blocked turn, or steer failure preserves the queue safely.    |
| `OTG-UT-016` | Continuation Gate and recovery                     | Compatible work continues; approvals, failures, drift, conflict, or classifier uncertainty stop; retry only reconciles and explicit Continue releases work without replaying prior side effects.             |
| `OTG-UT-017` | Follow selection and checkpoints                   | One chat is followed; unique switch is atomic while ambiguity changes nothing; known checkpoints retain evidence and unknown raw provider events remain silent.                                              |
| `OTG-UT-018` | Follow summaries and Timeline                      | Material checkpoints coalesce within the rate limit; approval/blocker/final bypass correctly; protected speech yields one latest catch-up and Timeline citations persist without marking responses handled.  |
| `OTG-UT-019` | Model selection, fallback, and budgets             | STT/Theo/TTS select independently by capability; only announced pre-approved fallbacks run; exhausted fallback or hard budget stops remote work while local Stop/safety remains available.                   |
| `OTG-UT-020` | Audio focus, privacy, and cache                    | Private/public routes render the permitted detail; calls/media/navigation apply correct pause/duck policy; secrets never render and encrypted device audio expires by 24 hours.                              |
| `OTG-UT-021` | Platform capability policy                         | Electron/mobile allow their declared background states; web loses voice availability when backgrounded; unsupported platform actions explain the boundary without leaving a listener active.                 |
| `OTG-UT-022` | Data controls and diagnostics                      | Inspect/export/delete/reset affect only the requested scope; export preview is redacted; diagnostics omit raw audio/transcript content and deletion removes temporary buffers/cascades correctly.            |
| `OTG-UT-023` | Replayable topic contract                          | Topic entrypoints register once and expose the stable interface; optional Jordan topics may be absent; semantic seam drift fails closed while proven mechanical moves retain equivalent behavior.            |

Coverage rules:

- Every product feature or later accepted decision must be added to this matrix before the plan can be accepted.
- Every implementation slice lists the `OTG-UT-*` IDs it owns and cannot exit while any owned ID lacks passing evidence.
- Each unit-test ID must cover a normal path, a denial/failure path, and the durable or safety invariant relevant to that feature.
- Cross-feature property, fault-injection, integration, headed, native, accessibility, performance, replay, and live smoke suites remain required in addition to this matrix.

Implementation evidence is intentionally grouped by the smallest owning module while retaining the stable IDs in test names and assertions:

- `OTG-UT-001`–`OTG-UT-006`: `apps/server/src/localTopics/onTheGo/Runtime.test.ts`, `apps/server/src/localTopics/onTheGo/Adapters.test.ts`, and `packages/client-runtime/src/localTopics/onTheGo/VoiceParity.test.ts`.
- `OTG-UT-007`–`OTG-UT-016`, `OTG-UT-019`, `OTG-UT-020`, and `OTG-UT-022`: `apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts`, `apps/server/src/localTopics/onTheGo/ProductionService.test.ts`, `apps/server/src/localTopics/onTheGo/ProductionLayer.test.ts`, and `packages/client-runtime/src/localTopics/onTheGo/Controller.test.ts`.
- `OTG-UT-010`, `OTG-UT-011`, and `OTG-UT-019`: `apps/server/src/localTopics/onTheGo/TheoContext.test.ts`, `apps/server/src/localTopics/onTheGo/TheoExternalContext.test.ts`, `apps/server/src/localTopics/onTheGo/TheoConversation.test.ts`, and `packages/shared/src/sensitiveText.test.ts`.
- `OTG-UT-017` and `OTG-UT-018`: `apps/server/src/localTopics/onTheGo/ProviderCheckpoint.test.ts`, `apps/server/src/localTopics/onTheGo/EventIngestion.test.ts`, `apps/server/src/localTopics/onTheGo/FoundationRuntime.test.ts`, and `packages/client-runtime/src/localTopics/onTheGo/Controller.test.ts`.
- `OTG-UT-019`–`OTG-UT-021`: `packages/client-runtime/src/localTopics/onTheGo/VoiceModelPolicy.test.ts`, `apps/web/src/localTopics/onTheGo/BrowserSpeechAdapter.test.ts`, `apps/desktop/src/localTopics/onTheGo/index.test.ts`, `apps/mobile/src/localTopics/onTheGo/NativeVoicePolicy.test.ts`, `apps/mobile/src/localTopics/onTheGo/NativeAudioPolicy.test.ts`, and `apps/mobile/src/localTopics/onTheGo/NativeQuickAction.test.ts`.
- `OTG-UT-023`: `apps/server/src/localTopics/onTheGo/IntegrationContract.test.ts` pins semantic RPC, lifecycle, event-ingestion, and renderer integration seams while allowing behavior-preserving mechanical movement.

The focused deterministic command currently proves 107 tests across 25 files:

```bash
pnpm exec vp test run packages/contracts/src/localTopics/onTheGo packages/shared/src/sensitiveText.test.ts apps/desktop/src/localTopics/onTheGo apps/mobile/src/localTopics/onTheGo apps/mobile/src/features/shortcuts/appShortcuts.test.ts apps/server/src/localTopics/onTheGo apps/web/src/localTopics/onTheGo packages/client-runtime/src/localTopics/onTheGo
```

### State And Property Tests

- Every command/state pair either has one cataloged disposition or fails closed.
- At most one Voice Session Owner and one followed chat per owner exist.
- Consequential actions cannot execute without exact target readback and Confirm.
- Prompt submission cannot execute without the exact ready revision’s Send authorization or reciprocal visual action.
- Idempotent replay never produces a second side effect.
- Stale active-turn identities never steer or interrupt a newer turn.
- Queue, Attention, Pending Turn, prepared-prompt, and deletion invariants survive restart and reconnect.

### Activation, Listening, And Dictation

- Off, Sleep, Command, Theo Conversation, Dictation, and Degraded transitions.
- Local wake detection and raw-audio discard on success/failure.
- Custom wake calibration, false triggers, missed wakes, and physical recovery.
- Barge-In on/off, ambient-noise rejection, push-to-talk/headset alternatives, and universal Stop.
- Adaptive endpointing, keep-listening, release-to-end, multilingual/code-switched utterances.
- Dictation isolation from Voice Actions, formatting/edit controls, transcript correction, direct versus Theo-refined send.

### Commands, Safety, And Accessibility

- Voice Action Catalog coverage, availability, risk, alias conflicts, routines, and help.
- Immutable Stop/Cancel/Confirm/Send it phrases and customizable Steer/follow aliases.
- 15-second confirmation window, Repeat reset once, accessibility extension, silence/ambiguity abort.
- Voice approvals: deny, once, session where supported, generic “yes” clarification.
- Visual/caption/haptic/screen-reader/touch/keyboard equivalents for every state, tone, utterance, and confirmation.
- Automated Voice Parity Audit and reviewed exception format.

### Responses And Attention

- Global completion ordering, 30-day active response retention, and cross-device handled sync.
- Response versus Attention promotion without duplication.
- Arrival tone, two-second coalescing, badge increments, end-of-segment reminders, and mixed-priority suppression.
- Last/newest, next/oldest-unhandled, previous/history, filters, position/count, and oldest Attention navigation.
- Badge clearing and Attention resolution rules.
- DND/silent behavior and opt-in critical Attention delivery.

### Theo, Context, And Privacy

- Bounded Response Context, authorized fetch, exclusions, citations, and progress cues.
- Untrusted-context prompt injection cannot alter role, commands, target, profile, or safety.
- Context Egress Policy blocks incompatible source/provider combinations without silent switching.
- Minimal Context Evidence retention and buffer deletion.
- Structured profile learning, evidence/confidence, notices, undo, precedence, reset, and secret exclusion.
- Public versus Private Output, route changes, redaction, and never-speaking credentials/secrets.
- Metadata-only diagnostics and previewed redacted export.

### Models And Audio

- Independent Transcription/Theo/Speech model selection and safe switch boundaries.
- Electron PCM utterance detection, 16 kHz payload bounds, active-environment local Whisper selection, unavailable-model refusal, runtime failure shutdown, and real PipeWire virtual-microphone activation.
- Capability catalog filtering, modality limits, approved fallback chains, and fail-closed exhaustion.
- Usage warning/hard limits without disabling local safety controls.
- Sentence-chunked Theo speech, Stop/Barge-In, call/media/navigation/alarm focus behavior.
- Device-local encrypted speech cache expiry at or before 24 hours and cross-device re-synthesis.

### Prompt Handoff And Agent Creation

- Prepared Prompt durability, revision diff/undo, readiness invalidation, and exact target binding.
- Offline Draft/Pending Handoff never auto-sends and requires fresh Send it after reconnect.
- Existing-agent retarget and new-agent handoff package contents/exclusions.
- New editing-agent worktree isolation, explicit shared-write confirmation, preset precedence, and access escalation.
- Successful acknowledgement identifies target and returns to Command State.

### Turn Scheduler, Queueing, And Steering

- Voice, composer, MCP, automation, and legacy callers share one scheduler and queue ordering.
- Explicit queue/steer/interrupt intent; legacy omission yields Queue plus deprecation.
- Per-agent FIFO, head-only dispatch, stable reorder, cancel/edit slot advancement, and tail insertion.
- 10-second Steering Correction Window with Barge-In on/off, original-turn binding, and completion race.
- Accepted steering removes the pending item atomically; rejection preserves exact content and position.
- Blocked approvals/input cannot be steered; new steering guidance always requires Send it.
- Steering acknowledgements have spoken/visual parity and no additional badge/tone.
- Queue warnings/caps, non-expiry, overflow draft preservation, and coalesced Attention.
- Queue Continuation Gate deterministic blockers, semantic uncertainty, fail-closed behavior, and Confirmed override.
- Abnormal outcome freeze, Agent Recovery without replay, explicit Continue queued work, and refreeze.
- Programmatic capability matrix, expected active-turn ID, idempotency, lifecycle events, status lookup, supersedes lineage, and 90-day metadata tombstone.
- Archive/freeze/unarchive, active archive completion, two-phase deletion, uncertain interrupt pause, and no orphaned writes.

### Follow Mode

- Provider Adapter contract suites for every Agent Checkpoint kind, source evidence/confidence, and unknown-event silence.
- One active followed chat, idle arming, unique/ambiguous target resolution, atomic switch, stop, and detached-chat queue continuity.
- Subagent parent aggregation and first-class-thread selection only.
- Checkpoint batching, maximum one ordinary summary per 30 seconds, immediate blocker/approval, and mandatory final summary.
- Summary content contract and default under-20-second rendering.
- One two-minute quiet cue, no recurring filler, reset on change, and detected-stall Attention.
- On-demand catch-up and bounded Context Fetch.
- Speech contention: protected interactions, tone overlay, latest-only coalescing, and post-interaction catch-up.
- Completion tone/badge preservation and no handled-state mutation from a summary.
- Sleep accumulation/wake count, Off/restart explicit resume, ownership handoff/Continue, archive pause, and delete clear.
- Budget/provider/egress degradation using only allowlisted structured facts and no raw-log inference.
- Follow Timeline captions/citations/checkpoint ranges, raw-buffer deletion, archive preservation, and deletion cascade.

### Platform E2E

- Headed Electron: activation, minimized operation, Voice Dock, command, Theo, queue, steering, follow, audio focus, Stop, and shutdown.
- Native mobile: background and locked-screen listening, OS mic indicator, headset/PTT, ownership, call interruption, route changes, and low-power behavior.
- Hosted web: foreground-only activation and explicit loss of availability when backgrounded.
- Cross-device ownership: old owner silenced, state/cursor/follow transfer, no autoplay, and Continue gating.

### Fault Injection And Performance

- Network loss before/after provider acceptance, unknown outcomes, retries, and reconciliation.
- STT/Theo/TTS failure, fallback exhaustion, persistence failure, reconnect storms, duplicate/out-of-order events, and device handoff races.
- p95 targets under controlled load: Stop under 150 ms; wake acknowledgement under 300 ms; utterance-to-visible transcript under 1 s; utterance-to-command acknowledgement under 1.5 s; Theo first audio under 2 s; server event-to-tone under 500 ms.
- Soak tests for queue growth, long Follow sessions, speech coalescing, and restart recovery.

### Replay And Topic Audit

- Apply the single topic commit to a clean current upstream checkout with every other Jordan topic absent.
- Verify schema-v2 metadata, owned paths, component entrypoints, integration points, replay contract, README evidence, manifest, and staging guide.
- Mechanical seam-move fixture auto-repairs only when interface behavior remains equivalent.
- Semantic provider/chat/settings/app-shell seam change fails closed with exact violated contract.
- `vp check`, `vp run typecheck`, applicable `vp run lint:mobile`, focused suites, headed Electron, and native E2E pass before staging.

## Controlled Live Smoke

For each supported production model provider, verify a short transcription, Theo reply, speech sentence, Coding Agent response, steer-capable turn where supported, and Follow Summary. Use non-sensitive fixture projects and record provider/model/retention configuration. A live smoke failure blocks claiming that adapter supported, but deterministic suites remain the primary correctness proof.
