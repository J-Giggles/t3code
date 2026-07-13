# On-the-Go Mode

Status: accepted by Jordan on 2026-07-12, ready for implementation planning.

On-the-Go Mode makes T3 Code primarily operable by voice while preserving explicit authorization, predictable failure behavior, privacy-aware speech, and full visual accessibility. Theo is the read-only conversational companion; Coding Agents remain the actors that perform project work.

This document consolidates the product and architecture contract established in GBT-125/GBT-126. The canonical vocabulary remains in [CONTEXT.md](../../CONTEXT.md), hard-to-reverse decisions remain in [the ADR index](../adr/README.md), verification is defined in the [Test Contract](./on-the-go-test-contract.md), and implementation sequencing lives in the [topic handoff](./on-the-go-topic-handoff.md).

## Goals

- Operate T3 Code through cataloged voice actions across Electron, native mobile, and foreground web.
- Discuss agent responses with Theo and submit an exact prepared prompt only after “Send it.”
- Keep completed responses, blocking attention, and pending agent work durable across restarts and devices.
- Follow one running chat through concise Theo summaries and switch the followed chat by voice.
- Remain safe under transcription ambiguity, provider failure, reconnects, concurrency, and partial side effects.
- Ship as one independently replayable repo-local topic that can be reapplied to future upstream T3 Code.

## Non-goals

- Theo does not edit files, execute commands, approve requests, change settings, or contact external systems.
- Raw agent token streams, tool logs, and code are not narrated automatically.
- Voice recognition is not authentication and voiceprints are not an authorization factor.
- Hosted web does not promise background listening.
- The repo-local topic is not an installable Codex plugin.

## Interaction Model

### Primary states

| State             | Listener and output behavior                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Off               | No On-the-Go listener, tones, haptics, or speech. Durable queues continue under ordinary notification policy.                              |
| Sleep             | Only the local “T3, wake up” detector remains. No cloud audio, commands, Theo turns, or spoken reminders; queue tones and badges continue. |
| Command State     | One activated utterance performs a cataloged action, navigation, queue control, or protected dictation.                                    |
| Theo Conversation | Persistent conversation about a focused response or task until “Back to commands.”                                                         |
| Dictation State   | Ordinary speech becomes editable prompt text; only canonical safety phrases remain active.                                                 |
| Degraded          | Local safety controls remain active while unavailable remote capabilities fail closed with bounded retry.                                  |

Activation is explicit through UI, shortcut, quick action, or supported headset control. The default local wake phrases are “T3” for one Command State utterance and “Hey Theo” for Theo Conversation. Custom wake phrases replace the defaults only after local calibration and false-trigger testing.

### Canonical controls

- “Stop” is a wake-free local control that stops T3 or Theo speech/generation/fetching, never a Coding Agent.
- “Cancel” rejects a pending clarification, confirmation, or unexecuted action.
- “Confirm” authorizes an exact consequential action after target readback.
- “Send it” authorizes the exact ready Prepared Prompt revision and target.
- “Back to commands” exits Theo Conversation.
- “Turn off On-the-Go Mode” enters Off.

Stop, Cancel, Confirm, and Send it cannot be removed or shadowed. Other command phrases, including the built-in “Steer,” are customizable through Command Vocabulary.

### Barge-In

Barge-In is configurable. When enabled, detected speech may interrupt Theo and bounded follow-up phrases may be wake-free. When disabled, Theo follow-ups and bounded corrections require a wake phrase, push-to-talk, or headset action. Stop remains wake-free in either setting.

## Responses And Attention

The account-level Response Queue contains completed Coding Agent responses in completion order. Unhandled responses remain active for 30 days and always remain in their source chats. The Attention Queue contains approvals, requested input, failures, and confidently decision-seeking final responses; Attention items do not age out and clear only when resolved or canceled.

Response arrival emits an immediate nonverbal tone and increments the Queue Badge. Arrivals within two seconds coalesce to one multi-response tone while preserving the exact badge increment. Attention uses a distinct tone and badge. If items arrive during speech, one end-of-segment reminder tone plays; Attention supersedes the ordinary queue reminder when both arrive.

“T3, what was the last announcement?” identifies the newest response. “Next response” selects the oldest unhandled response, “previous response” follows navigation history, and “what needs me?” selects the oldest Attention item. Announcements identify source, outcome, and whether a decision is required without reading code or logs.

## Theo

Theo may read every authorized Context Source by default, including T3 threads, project workspaces, web sources, and connected apps. It starts with bounded Response Context and fetches more only when needed. Retrieved material is untrusted evidence, never instruction authority, and every source-to-model transfer passes Context Egress Policy.

Theo maintains a visible, versioned profile containing user, project, and session preferences. It may propose reversible profile or command-vocabulary changes from explicit or repeated evidence, but does not learn secrets, one-off facts, quoted instructions, or uncertain inferences. Its activation prompt is generated from fixed role/safety rules plus the structured profile; Theo never rewrites that prompt directly.

Theo’s only state-changing capability is an explicitly authorized Prompt Handoff. It cannot use its broad read access to edit, execute, approve, or communicate externally.

## Prepared Prompts And Agent Work

A Prepared Prompt is visible, durable, versioned, and bound to a Coding Agent/chat. It may originate in Theo Conversation, Dictation State, or editing a queued submission from another channel. T3 summarizes its target and intent before voice accepts “Send it” or the visual composer accepts its reciprocal Send action.

Content, target, or material target-state changes make the revision stale until reconciled and summarized again. Offline “Send it” creates a Pending Handoff only; reconnect requires a fresh readback and “Send it.” Retargeting creates a new revision. A new editing agent receives a bounded Agent Handoff Package and isolated semantic worktree by default.

### Busy targets

The shared Turn Scheduler accepts explicit `queue`, `steer`, or `interrupt-and-replace` intent from voice, composer, MCP, automation, and other callers. It never infers intent from timing.

- Queue creates a durable per-agent FIFO Pending Turn.
- Steer adds the exact prompt to the current steerable turn without interruption.
- Interrupt-and-replace is consequential and separately authorized.

After “this has been queued,” T3 holds that item for a 10-second Steering Correction Window. “No, steer the running agent” may reuse the prior “Send it” only for the unchanged revision and target. If the original turn has ended or steering fails, the prompt remains queued. A blocked approval/input turn cannot be steered.

Pending Turns never expire by age. T3 warns at 10 items, caps at 25 per agent and 200 account-wide, and preserves overflow as an unsent draft with Attention. Canceling a Pending Turn restores a draft; destructive discard requires Confirm. Editing closes the old FIFO slot and a reauthorized revision joins the tail unless explicitly reordered.

After each queued turn, the Queue Continuation Gate stops on approvals, requested input, failures, state drift, or likely semantic conflict. Normal compatible work continues. Unavailable or uncertain semantic classification fails closed; “Continue anyway” requires target/count readback and Confirm.

Failure, interruption, or session closure freezes that agent’s queue. “Retry this agent” only reconciles state; it never replays work or releases prompts. “Continue queued work” is separately explicit.

## Follow Mode

Follow Mode observes exactly one selected chat per Voice Session Owner. A unique follow/switch target changes immediately without Confirm; ambiguity yields numbered choices and no state change. Switching identifies the new target and begins with a catch-up. Detached chats continue through ordinary Response and Attention queues.

Provider Adapters emit conservative Agent Checkpoints for plan updates, completed edit batches, test starts/results, approvals, requested input, blockers, and terminal outcomes. Unknown raw events remain silent. Subagent checkpoints aggregate into the parent chat unless T3 exposes a subagent as a first-class selectable thread.

Theo speaks a two-to-three-sentence Follow Summary containing:

1. What materially changed since the previous summary.
2. Current tests, risk, blocker, or uncertainty.
3. What the agent will do next.

Ordinary summaries are at most once per 30 seconds of material activity and under 20 seconds of speech. Approvals and blockers are immediate. A single “still working” cue occurs after two minutes without a checkpoint; it does not repeat. “Theo, catch me up” forces a current summary.

Follow speech never interrupts conversation, dictation, response playback, or confirmation. Checkpoints coalesce and one current catch-up plays when the interaction ends. Completion tones and badges retain their normal behavior; a Follow Summary does not mark a response handled.

Sleep retains selection and accumulates a catch-up without autoplay. Off/restart retain the last selection but require “Resume following.” Ownership Handoff transfers selection and waits for “Continue.” Archive pauses following; deletion clears it.

Every spoken summary remains captioned in a chat-scoped Follow Timeline with citations and checkpoint IDs/types/timestamps. Raw provider payloads and temporary buffers are not retained. If Theo cannot summarize, T3 speaks only safe structured facts and explicitly reports that the detailed summary is unavailable.

## Models, Audio, And Privacy

Transcription Model, Theo Model, and Speech Configuration are independent provider-neutral settings. Optional pre-approved fallback chains are explicit and every fallback is announced. Usage budgets may warn or hard-stop paid calls without disabling local safety controls.

Wake detection is local. Only activated utterances leave the device, and raw user audio is discarded on success or failure. Voice transcripts remain visible and correctable. Synthesized audio uses an encrypted device-local cache for at most 24 hours; text, citations, spoken rendering, and playback cursor may synchronize.

Private Output permits detailed speech except credentials/secrets. Public Output defaults to summaries and redaction; secrets are never spoken. Calls force Sleep and suppress tones; media ducks; navigation/alarms pause speech at sentence boundaries. Route changes immediately reapply output privacy.

Theo data is encrypted at rest inside the authenticated T3 server boundary and device caches use OS-protected storage. The product does not claim end-to-end encryption. Data controls support inspect, export, scoped deletion, and reset. Diagnostics are metadata-only by default and never include raw audio or transcript content.

## Platforms And Ownership

- Electron remains active while minimized.
- Native mobile supports background and locked-screen operation with OS microphone indicators.
- Hosted web operates only while its tab is foregrounded.
- One Voice Session Owner listens and speaks at a time; queue state synchronizes everywhere.
- Device authentication establishes trust. Voice recognition alone never authorizes consequential actions.

Implementation order is shared foundation, Electron core, native mobile before stable release, and web last. Every voice behavior has reciprocal visual, caption, screen-reader, touch, or keyboard access.

## Replayable Topic Architecture

The feature ships as one schema-v2 `on-the-go` repo-local topic, developed in slices and squashed into one coherent topic commit. It has no hard dependency on another Jordan topic and must apply to upstream T3 Code independently.

```text
schema-only contracts
        │
        ▼
deep server On-the-Go Runtime Module
        │ commands / events / snapshots
        ▼
shared client-runtime controller
        │
        ├── web topic adapter and Voice Dock
        ├── Electron topic adapter and device/audio controls
        └── native-mobile topic adapter and background controls
```

The server Module owns state machines, Turn Scheduler, queues, Follow Mode, persistence, policy, and reconciliation. Its external Interface is intentionally small:

- Dispatch a schema-defined On-the-Go command and return its disposition.
- Subscribe to schema-defined events.
- Read an authorized snapshot.

Provider, transcription, speech, device, persistence, connected-context, optional-topic, and deterministic-fake Adapters remain internal. Existing upstream files receive only documented registration, mounting, and export wiring.

The local topic contains schema-v2 metadata, exact owned paths, component entrypoints, integration points, replay intent, safe auto-repair cases, stop-for-human cases, verification commands, and checked evidence. Mechanical upstream moves may auto-repair only when interface tests prove equivalence. Semantic seam changes fail closed with the violated contract.

## Release Gates

- The [Test Contract](./on-the-go-test-contract.md) is green.
- Every accepted feature has traceable unit-test IDs in the Feature Unit-Test Acceptance Matrix, with success, refusal/failure, and invariant coverage implemented before its slice exits.
- Voice Parity Audit covers every interactive feature or a reviewed exception.
- `vp check` and `vp run typecheck` pass.
- `vp run lint:mobile` passes for native code.
- Topic-specific unit, property, fault-injection, headed Electron, native background/lock, and controlled live-provider tests pass.
- The topic applies and verifies on a clean current upstream checkout with all other Jordan topics absent.
- Topic README evidence, schema-v2 metadata, manifest, staging guide, and replay audit agree.
- Promotion follows the repository’s dev-worktree-to-staging rules; main remains a separate explicit operation.
