# On-the-Go Mode Test Contract

Status: approved design contract. Implementation is incomplete until every applicable row has evidence.

## Test Harness

The topic must provide deterministic fake Adapters for wake/activation, transcription, Theo generation, speech synthesis, audio focus, device trust, provider checkpoints, context fetch, persistence, clock, connectivity, and Turn Scheduler delivery. Tests exercise the same On-the-Go Runtime Interface used in production.

Use virtual clocks and virtual microphone/audio fixtures for endpointing, correction windows, rate limits, retries, retention, and ownership races. Controlled live-provider tests are smoke coverage only and never replace deterministic behavior tests.

## Required Suites

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
