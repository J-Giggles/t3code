# ADR 0025: Make busy-target delivery explicit

## Status

Accepted

## Context

A Prompt Handoff can target a Coding Agent whose turn is already running. Providers differ in how they accept another prompt during that turn, and a generic send operation can conceal whether the prompt was queued for the next turn or injected as same-turn guidance. Timing-based inference would make voice behavior unpredictable and could silently change as provider adapters evolve.

Users also need to correct a just-queued handoff naturally by saying “No, steer the running agent.” Steering must not lose the durable queued prompt if the provider rejects or cannot perform it.

## Decision

Represent busy-target delivery as an explicit provider-neutral intent with two non-interrupting outcomes:

- `queue` creates a durable Pending Turn that starts after the active turn completes.
- `steer` asks a steer-capable provider to add the Prepared Prompt to the active turn.

“Steer” may select the steering intent before Prompt Handoff. Immediately after T3 acknowledges that a handoff was queued, “No, steer the running agent” changes the delivery intent for that same prompt revision and target.

The immediate queued-to-steer correction requires neither another Voice Confirmation nor another “Send it”: the prior Prompt Handoff already authorized the exact prompt revision and target, and the correction explicitly changes only its delivery intent. Any content or target change invalidates that authorization and requires a fresh Prompt Handoff.

A new command containing steering guidance does not execute immediately. T3 turns the guidance into a Prepared Prompt bound to the running agent, provides its readiness summary, and requires “Send it.” The correction-window case is the only steering path that may reuse an earlier Prompt Handoff.

After speaking the queued acknowledgement, T3 holds that Pending Turn from dispatch for a 10-second Steering Correction Window. The correction is bound to the active-turn identity captured when the handoff was queued. If that turn finishes before steering is accepted, T3 reports that the prompt is still queued and dispatches it only after the correction window closes. It never redirects the correction to a newer active turn.

When Barge-In is enabled, “No, steer the running agent” is wake-free during this bounded window. When Barge-In is disabled, the same correction requires the T3 Wake Phrase or headset/push-to-talk activation. The queue hold remains 10 seconds in either case so disabling ambient interruption does not remove the correction opportunity.

Pending Turns are ordered FIFO independently for each Coding Agent, and only the head of an agent's queue may dispatch when it becomes idle. The immediate “No, steer the running agent” shorthand refers only to the most recently acknowledged Pending Turn. Selecting an older item requires an explicit position or prompt description. Reordering is allowed only after T3 reads back the resulting order; steering or reordering one item does not disturb the relative order of the others.

“Cancel pending turn” is reversible: T3 removes the item from dispatch and restores its exact content as a visible Prepared Prompt draft, so it requires no Voice Confirmation. Permanent deletion is a separate “Discard prompt” Consequential Voice Action with exact target readback and Voice Confirmation. Canceling dispatch never silently destroys the authorized prompt content.

Canceling or editing an item closes its FIFO slot immediately and allows later items to advance. A changed revision that later receives “Send it” joins the queue tail by default. The user may explicitly request a different position, but T3 must read back the resulting order before applying it. Draft editing never silently reserves a slot that could block the agent.

Pending Turns do not expire by age. T3 warns when one agent reaches 10 items and enforces hard caps of 25 per agent and 200 account-wide. Settings may lower these limits, but voice commands cannot bypass them. When a cap prevents handoff, T3 preserves the prompt as an unsent draft and creates one Attention Item for queue management; it never discards or silently defers the overflow prompt.

After each successfully completed queued turn, a Queue Continuation Gate decides whether the next Pending Turn may dispatch. Deterministic signals run first: approvals, requested input, failures, changed access or worktree state, invalid target state, and other known blockers freeze the remaining queue. Normal compatible results continue without user intervention. Theo is consulted only when a possible semantic conflict between the result and next prompt cannot be resolved deterministically. A gate freeze creates one Attention Item and preserves FIFO order until explicit recovery.

If Theo is unavailable, Context Egress Policy prevents classification, or the classification remains uncertain, the gate fails closed. T3 explains what could not be verified and keeps the Attention Item unresolved. The user may inspect later, edit or retarget the prompt, or invoke “Continue anyway.” That override reads back the Coding Agent and pending count and requires Voice Confirmation before releasing the queue.

An abnormal target outcome—failure, interruption, or session closure—freezes the target's entire Pending Turn Queue and creates one Attention Item with its pending count. T3 never treats that outcome as idle readiness and never auto-dispatches into a restarted or uncertain session. The recovery choices are recover the same agent, retarget, edit, or cancel.

“Retry this agent” performs Agent Recovery only: it reconnects or resumes the same agent, reconciles provider and T3 state, and summarizes any partial outcome. It never replays the failed turn and never releases Pending Turns, because the failed turn may already have caused partial side effects. After successful reconciliation, T3 asks whether to continue the stated number of queued prompts. Only an explicit “Continue queued work” releases the unchanged authorized FIFO queue, reusing its existing Prompt Handoffs; content or target changes require fresh ones. Any later abnormal outcome freezes the remaining queue again.

A turn blocked on an approval or requested user input is not eligible for Agent Steering even when the provider could technically accept more text. T3 surfaces the Attention Item and requires its dedicated resolution path: Voice Approval for approvals or an explicit answer for requested input. The Prepared Prompt remains pending and cannot be interpreted as either resolution.

T3 removes the Pending Turn only after the provider acknowledges steering. Unsupported, non-steerable, stale-target, or failed steering leaves the Pending Turn intact and produces a clear spoken result. Steering never falls back to interruption and T3 never infers steering merely because a target is busy.

Every steering attempt ends with a concise spoken Steering Acknowledgement and the same state in the Voice Dock. Success identifies the agent and project/chat. Failure names the reason and the preserved Pending Turn's position. Steering does not create a new notification badge or special tone; response and attention arrivals retain their existing alert semantics.

Pending Turns are operational state, not unread notifications. The Voice Dock shows a neutral Queued Work count for the focused Coding Agent, and “T3, what work is queued?” exposes a global per-agent summary. There is no third notification badge. A frozen queue is represented by its single Attention Item and is not counted again as another alert.

“Steer” is the built-in Command Vocabulary phrase for Agent Steering, not a Canonical Safety Phrase. Users may replace it or add non-conflicting aliases. Voice Help, readiness summaries, and relevant readbacks must use the active mapping rather than assuming the default phrase.

Provider adapters must expose steering capability and outcome through the shared contract even if their underlying protocol models steering as another send operation.

A server-side Turn Scheduler owns this state for both voice and visual-composer submissions. Every prompt sent to a busy target declares `queue`, `steer`, or `interrupt-and-replace`; the scheduler defaults an ordinary busy-target submission to `queue` and never infers intent from arrival timing. The composer presents the three supported choices when relevant, and its explicit Send action is the visual equivalent of spoken “Send it.”

Every accepted queued submission becomes the same durable, source-attributed Pending Turn regardless of whether it originated from voice, the visual composer, MCP, or automation. Theo may inspect, summarize, and compare these items under normal context and egress permissions. Editing or retargeting supersedes the original queued record, creates a new Prepared Prompt revision, and requires a new Prompt Handoff; source identity never changes the safety rules.

MCP, automation, and other programmatic prompt paths use the same scheduler. New APIs require an explicit delivery intent. During a bounded compatibility period, legacy callers that omit intent default to `queue` and receive both the actual disposition and a deprecation warning. No compatibility path may translate a busy send into steering based on timing.

Programmatic authority is split into `turn:queue`, `turn:steer`, and the higher-risk `turn:interrupt` capabilities. Every scheduler mutation requires an idempotency key and the expected active-turn identity; a stale identity or repeated key reconciles without applying a different side effect. Interrupt-and-replace requires both interrupt and prompt-submission authority and is never implied by ordinary send access.

The scheduler exposes durable lifecycle events and status lookup for `queued`, `steered`, `dispatched`, `canceled`, `superseded`, and `failed` dispositions. A programmatic caller can therefore observe later human action on its submission. Replaying an original idempotency key returns the recorded disposition and never recreates terminal work. A human-edited or retargeted prompt receives a new submission identity linked to the predecessor through `supersedes`.

Prompt content follows the lifecycle of its source chat or Prepared Prompt and is deleted with that parent. For 90 days after a terminal disposition, the scheduler retains only the submission identity, disposition, content hash, lineage, and idempotency tombstone needed to prevent replay. It never retains deleted prompt text solely for lifecycle audit.

Archiving a chat reads back its pending count and whether a turn is running, requires Voice Confirmation, and freezes the queue while preserving its content. It lets the already running turn finish unless the user explicitly selects the distinct consequential action “Interrupt and archive.” A completed turn still enters Response or Attention with an archived-chat label. Unarchiving does not release the pending queue; “Continue queued work” remains explicit. Deleting such a chat reads back the count, requires Voice Confirmation, cancels every Pending Turn, deletes prompt content with the chat, and retains only the 90-day metadata tombstones described above.

When the deleted chat also owns a running turn, deletion is a reconciled two-phase operation. After Voice Confirmation, T3 freezes and cancels pending work, interrupts the exact active-turn identity, and waits until provider and T3 state prove that turn terminal. Only then may chat and prompt content be deleted. An unknown or failed interruption pauses deletion and creates an Attention Item; T3 never removes the chat while its agent may still be writing.

## Consequences

Busy-target behavior is predictable across providers and can be tested independently of timing. Users can deliberately queue work or guide an active turn, including correcting the choice after a queued acknowledgement, without risking prompt loss.

The provider contract and orchestration state machine need new delivery-intent and steering-result concepts. Adapters that cannot prove steering support must report it unavailable, even if their underlying provider sometimes treats concurrent sends as guidance.

Ordinary queued follow-ups may wait up to 10 additional seconds when the target turn completes immediately after the queued acknowledgement. That bounded delay makes the spoken correction deterministic and prevents the same prompt from starting a new turn while its correction is still being recognized.

## Rejected Alternatives

- Always queue prompts sent to busy agents: safe, but prevents useful mid-turn course correction already supported by several providers.
- Always steer prompts sent to busy agents: surprising and makes ordinary follow-up work alter an active turn.
- Infer queue versus steer from provider timing or current adapter behavior: not a stable product contract and cannot provide reliable acknowledgements or retries.
- Remove the Pending Turn before attempting steering: risks losing an already authorized prompt when steering fails.
