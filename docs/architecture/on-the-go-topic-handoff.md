# On-the-Go Topic Implementation Handoff

## Objective

Implement [On-the-Go Mode](./on-the-go-mode.md) as one independently replayable schema-v2 local topic on top of upstream T3 Code. The final topic commit must include the feature, tests, docs, replay metadata, and verification evidence; it must not depend on another Jordan topic.

## Required Working Method

1. Record every implementation run in a dedicated Agent Run worktree and durable local handoff.
2. Work only in a new `dev-` worktree and feature branch; never implement in root main, original, nightly, or reserved staging.
3. Build in reviewable slices with green focused tests.
4. Assign every accepted feature to its `OTG-UT-*` IDs from the Test Contract and implement those deterministic unit tests in the same slice as the feature.
5. Before final topic squash, compare the accumulated branch to its upstream base and confirm no unrelated changes.
6. Create/update `local-plugins/on-the-go/plugin.json`, README, topic manifest, staging review guide, and all affected reference/operations docs in the same topic.
7. Squash the verified slices into one coherent `feat(on-the-go): add voice-first coding companion` topic commit.
8. Replay that commit onto a clean upstream-only worktree and run the full [Test Contract](./on-the-go-test-contract.md).
9. Promote the clean verified commit to reserved staging under repository policy. Main promotion remains a separate explicit request.

## Target Module Shape

Exact paths may adapt to upstream structure, but the ownership and seams must remain:

```text
packages/contracts/src/localTopics/onTheGo/
packages/client-runtime/src/localTopics/onTheGo/
apps/server/src/localTopics/onTheGo/
apps/web/src/localTopics/onTheGo/
apps/mobile/src/localTopics/onTheGo/
apps/desktop/src/localTopics/onTheGo/
local-plugins/on-the-go/
```

The contracts package remains schema-only. The deep server Module owns product rules. Client and platform Modules consume commands/events/snapshots and provide presentation or device Adapters; they do not reimplement scheduling, confirmation, queue, follow, or retention policy.

### External server interface

Keep the external Interface no larger than the behavior requires:

- `dispatch(command)` returns a typed disposition.
- `events(scope)` exposes ordered typed events.
- `snapshot(scope)` returns authorized durable/read-model state.

The concrete Slice 1 schemas, read authorization, dispositions, adapter ports, and evidence are documented in [On-the-Go Runtime Contracts](../reference/on-the-go-runtime.md).

Transport registration, persistence, providers, transcription, Theo, speech, audio focus, device trust, and optional topic integrations are internal seams. Production and deterministic fake Adapters satisfy the same ports.

## Implementation Slices

### 1. Contracts And Deterministic Harness

- Commands, events, snapshots, errors, identities, settings, and retention schemas.
- Fake clock, voice input, audio output/focus, model, provider checkpoint, persistence, and connectivity Adapters.
- State/property harness using only the external Interface.

Exit: `OTG-UT-001` through `OTG-UT-006` and core state, authorization, idempotency, and ownership properties pass without UI or live providers.

### 2. Durable Server Foundation

- On-the-Go state machine, persistence, settings split, Voice Action Catalog, audit, deletion, and ownership.
- Response and Attention queues, alert disposition, Prompt Handoff, Prepared Prompt revisions.
- Turn Scheduler, Pending Turns, steering, continuation gate, recovery, and lifecycle events.

Exit: `OTG-UT-007` through `OTG-UT-016`, `OTG-UT-019`, `OTG-UT-020`, and `OTG-UT-022` cover normal, refusal/failure, retry, unknown-outcome, and restart behavior.

### 3. Electron Core Vertical Slice

- Local activation/wake Adapter, transcription, Theo, speech, audio focus, and Voice Dock.
- Command State, protected dictation, one response announcement, Theo conversation, Send it, and Stop.
- Headed Electron Page Objects and end-to-end flow.

Exit: the owning unit IDs remain green and the Core Voice Journey works visibly in isolated headed staging.

### 4. Follow Mode

- Agent Checkpoint provider Adapters and fake contract suite.
- Selection/switching, batching/rate limit, catch-up, quiet cue, fallback, Follow Timeline, and speech contention.
- Completion/Attention coexistence and subagent aggregation.

Exit: `OTG-UT-017` and `OTG-UT-018` plus deterministic and headed Follow flows pass across supported provider fixtures.

### 5. Native Mobile

- Background/lock activation, OS mic indicator, headset/PTT, audio route/focus, device trust, ownership handoff, and low-power behavior.
- Native Voice Dock/lock-screen reciprocal controls and mobile E2E.

Exit: the mobile cases of `OTG-UT-002`, `OTG-UT-020`, and `OTG-UT-021` plus required background, lock, call, headset, route, and ownership tests pass; `vp run lint:mobile` is green.

### 6. Foreground Web And Settings Completion

- Foreground-only web Adapter, clear availability state, model/speech/profile/vocabulary/routine/budget/privacy settings.
- Optional adapters for other Jordan topics without hard dependencies.
- Full Reciprocal Accessibility and Voice Parity Audit.

Exit: the web/settings cases of `OTG-UT-005`, `OTG-UT-006`, `OTG-UT-019`, `OTG-UT-021`, and `OTG-UT-022` plus accessibility and optional-integration contracts pass.

### 7. Topic Packaging And Upstream Replay

- Schema-v2 plugin metadata with exact owned paths and complete componentization.
- README Replay Checklist Items with path/command evidence.
- Manifest ordering, replay contract, staging guide, API/reference/operations docs, and audit artifact.
- Clean-upstream replay with no other Jordan topics.

Exit: `OTG-UT-023`, every other `OTG-UT-*` ID, and the full release gates in the design and Test Contract are green; the single commit is ready for staging.

## Replay Contract Guidance

Preserve:

- Read-only Theo and mandatory Send it.
- Stable command/event/snapshot Interface and provider-neutral Agent Checkpoints.
- Single owner/follow selection, durable queues, fail-closed reconciliation, privacy/egress, and reciprocal accessibility.
- Independent operation without other Jordan topics.

Safe automatic repair:

- Mechanical file/component moves with equivalent upstream capability.
- Transport or mounting signature changes that keep the external Interface and contract tests unchanged.
- Provider raw-event renames where conservative checkpoint evidence remains identical.

Stop for human:

- Upstream changes provider event meaning, chat/turn lifecycle, approval semantics, settings ownership, app background policy, or security/privacy boundaries.
- A required Integration Seam disappears or would require policy in upstream callers.
- The topic can no longer apply independently or the stable Interface must grow to expose implementation details.

## Definition Of Done

- All accepted behavior in the design is implemented or explicitly deferred by a reviewed issue; stable release cannot defer safety, privacy, Send it, queue correctness, ownership, or reciprocal accessibility.
- The Test Contract is green with evidence.
- Every accepted feature maps to a passing `OTG-UT-*` ID with success, refusal/failure, and invariant evidence in the owning slice.
- The topic is one clean coherent commit with matching metadata/docs/tests.
- Clean upstream replay succeeds independently.
- Reserved staging contains the verified commit and headed review evidence.
