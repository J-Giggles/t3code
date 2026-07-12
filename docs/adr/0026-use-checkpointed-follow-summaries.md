# ADR 0026: Use checkpointed Follow Summaries

## Status

Accepted

## Context

On-the-Go users need to stay aware of a Coding Agent's ongoing work without watching its chat. Reading raw provider events, tool output, or token streams would be noisy, unstable across providers, difficult to interrupt, and likely to expose details that are unsuitable for the current audio route.

## Decision

Follow Mode observes a selected Coding Agent chat and asks Theo to produce concise Follow Summaries at meaningful checkpoints: plan changes, completed file-edit batches, test results, blockers, approvals, final completion, and explicit “Theo, catch me up” requests.

Provider Adapters translate raw events into a conservative schema-defined Agent Checkpoint catalog: plan updated, edit batch completed, tests started or completed, approval requested, input requested, blocker, and turn completed or failed. Each checkpoint carries source evidence and confidence. Unknown provider events do not trigger speech. Theo may perform a bounded Context Fetch when a valid checkpoint needs explanation, subject to the existing policies.

Subagent checkpoints aggregate into the followed parent chat. A Follow Summary names an individual subagent only when its result, blocker, or failure materially affects the parent plan. A subagent may be selected as the followed target only if T3 exposes it as a first-class selectable chat or thread; internal provider activity never creates a hidden audio focus.

Each Voice Session Owner actively follows exactly one chat. Selecting another chat atomically detaches the previous selection, announces the new Coding Agent and project/chat, and produces an immediate catch-up before checkpoint summaries begin. The detached chat continues through the ordinary Response and Attention queues, so switching audio focus never suppresses its outcomes.

Follow, switch, stop, and catch-up are read-only actions available in Command State and Theo Conversation and may have Command Vocabulary aliases, so they require no Voice Confirmation. “Follow this chat” resolves the visible or Focused chat. A unique explicit agent/project target switches immediately with spoken acknowledgement; an ambiguous target produces numbered choices and leaves the current selection unchanged. “Stop following” is immediate.

Sleep pauses Follow Summary speech while retaining the selection and accumulating a compact catch-up. Wake identifies the followed chat and available update count without autoplay. Off or restart preserves the last selection but requires the explicit command “Resume following.” Voice Ownership Handoff carries the selection to the new owner, which identifies the prior topic and waits for “Continue” before speaking, matching the general no-autoplay handoff rule.

An idle followed chat stays armed for its next turn and Theo reports it as waiting. Archiving pauses Follow Summary generation and speech while preserving the selection; any active turn may finish through normal Response and Attention behavior, but follow requires unarchive plus “Resume following.” Deleting the chat permanently clears its follow selection and retained catch-up state.

Ordinary progress summaries are rate-limited to at most one every 30 seconds while material activity continues. Blockers and approvals bypass that rate limit and are spoken immediately. The final completion always receives a summary. T3 never narrates raw tool output or token streams.

Each Follow Summary is a conversational two-to-three-sentence delta: what materially changed since the prior summary, current status including tests/risk/blocker/uncertainty, and what the Coding Agent will do next. It defaults to less than 20 seconds of speech and excludes code, raw logs, and long file lists unless explicitly requested.

If a followed turn stays active for two minutes without a material checkpoint, Theo emits one brief quiet-period cue and then remains silent until state changes or the user asks for a catch-up. A detected runtime stall or failure becomes an Attention Item instead of triggering repeated heartbeat speech.

Follow Summary speech never interrupts Theo Conversation, Dictation State, response playback, or a confirmation flow. Immediate tones keep their existing overlay behavior, while material checkpoints coalesce behind the active interaction. When it ends, Theo automatically speaks one current catch-up if Follow Mode remains active and discards superseded intermediate summaries.

Every spoken Follow Summary remains visible and captioned in a chat-scoped Follow Timeline with citations and the Agent Checkpoint range it covers. The durable record keeps only checkpoint identities, types, and timestamps, never raw provider payloads. Temporary and coalesced buffers are discarded after summarization. Archive preserves the timeline; chat deletion removes it from every device through the normal Deletion Tombstone flow.

Every Follow Summary uses the existing Speech Configuration, Public or Private Output policy, Barge-In behavior, citations, Context Egress Policy, and Attention semantics.

If the Voice Usage Budget, Theo Model availability, or Context Egress Policy prevents a generated summary, Follow Mode degrades to safe structured facts T3 already owns, such as test status, approval waiting, or turn completion. It explicitly states that the detailed Theo summary is unavailable. It never derives a fallback from raw logs and never switches providers outside the approved fallback chain.

Follow Mode never replaces completion alerts. A followed response emits its existing Response or Attention tone immediately, and the final Follow Summary waits until audio focus permits. Speaking a Follow Summary does not clear a Queue or Attention badge: only the existing full-playback, open, conversation, dismissal, resolution, or cancellation rules change handled state.

## Consequences

The user receives useful progress without continuous narration, and provider-specific event noise stays behind a stable summary interface. Summary generation may lag a checkpoint slightly, but the on-demand catch-up command provides direct control.

## Rejected Alternatives

- Narrate every provider event: too noisy, provider-specific, and privacy-sensitive.
- Speak only after final completion: does not provide ongoing awareness.
- Use a fixed timer regardless of activity: creates empty or repetitive summaries and hides meaningful event boundaries.
