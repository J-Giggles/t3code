# On-the-Go Runtime Contracts

Status: Slice 1 contract and deterministic-harness reference. Production transport, persistence, provider, and client wiring are not yet implemented.

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

The runtime owns adapters for authorization, capabilities, clock, device trust, persistence/idempotency, wake detection, raw audio, transcription, audio output/focus, command and Theo models, provider checkpoints, context fetch, connectivity, and Turn Scheduler delivery. Production implementations remain internal; deterministic fakes use the same ports.

## Slice 1 Evidence

- `OTG-UT-001` through `OTG-UT-006`: `apps/server/src/localTopics/onTheGo/Runtime.test.ts`
- Schema/settings/retention decoding: `packages/contracts/src/localTopics/onTheGo/index.test.ts`
- Deterministic adapter contract: `apps/server/src/localTopics/onTheGo/Adapters.test.ts`

Headed Electron and Page Object coverage begins with the Electron vertical slice defined in `docs/architecture/on-the-go-topic-handoff.md`; this schema/runtime slice has no user-facing surface to drive.
