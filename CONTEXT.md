# T3 Code

This context defines project-specific language for T3 Code's product and the maintenance of its local topic stack.

## Local Topic Replay

**Replay Checklist Item**:
A checked Markdown task item in a local topic README that names a behavior, verification point, or explicit non-applicability that must be re-confirmed after an upstream replay.
_Avoid_: checkbox, checklist bullet, feature bullet

**Topic Replay Audit**:
A run-specific audit artifact that records what was inspected, replayed, repaired, verified, and signed off before a rebuilt local topic stack is promoted.
_Avoid_: replay notes, checklist copy, promotion log

**Conflict Brief**:
A human-readable explanation of a replay conflict that starts from the feature or topic intent, names the upstream and local intents that collide, presents resolution options, and gives a recommended path before any repair is applied.
_Avoid_: conflict packet, merge notes, hunk summary

**Linear Nightly Run**:
A child issue under the T3 Code nightly operations issue that records one actionable upstream replay from discovery through proof and promotion. It contains the official-change overview, topic task list, repair evidence, recommendation, and final promotion state.
_Avoid_: notification, chat message, nightly alert

**Topic Stack Checklist**:
The Linear task list and run-artifact inventory for a nightly replay. It marks each topic as replayed, auto-repaired, skipped, conflicted, pending, or not run and links the feature and test evidence needed to understand it.
_Avoid_: topic list, feature dump, replay summary

**Control-Plane Sync**:
The generated post-replay commit that copies current workflow metadata, topic contracts, runbooks, and project skills from the control checkout into Nightly after all manifest topic commits apply.
_Avoid_: topic commit, source replay, manual metadata patch

**Replay Contract**:
The machine-readable `replayContract` section in a local topic `plugin.json`. It tells the nightly agent the topic intent, invariants to preserve, safe auto-repair cases, stop-for-human cases, risk, autonomy level, and proof commands.
_Avoid_: README prose, feature notes, prompt hint

**Autonomous Replay Repair**:
A guarded nightly-agent repair attempt that edits only the Nightly Lane to resolve a non-fundamental topic replay conflict, continues the current cherry-pick when safe, and then reruns the replay from scratch so `git rerere` or Exact Repair Memory proves the decision.
_Avoid_: auto-merge, blind resolve, direct promotion

**Fundamental Feature Conflict**:
A replay conflict where the local topic goal no longer clearly works on top of upstream without a product, architecture, security, or operator-workflow decision from Jordan.
_Avoid_: merge conflict, file conflict, TypeScript error

**Exact Repair Memory**:
A machine-local replay recipe for a previously approved autonomous conflict resolution that `git rerere` cannot represent. It is keyed by the replay commit and the complete unmerged-index fingerprint, snapshots only declared repair paths, and is reusable only when the Git stage blobs match exactly. If rerere resolves part of the same conflict on the clean replay, an exact residual subset may restore only its remaining conflicted paths.
_Avoid_: broad conflict preference, unconditional ours/theirs rule, rerere cache

**Durable Lane**:
A long-lived local branch and worktree role in the T3 Code fork. The durable lanes are `original`, `nightly`, `staging`, and `main`; temporary topic, replay, and investigation branches are not durable lanes.
_Avoid_: permanent branch, protected worktree, environment

**Original Lane**:
The resettable mirror of the upstream ping.gg T3 Code repository. It tracks `upstream/main` and does not contain Jordan-local topic commits.
_Avoid_: upstream branch, clean copy

**Nightly Lane**:
The rebuilt candidate produced by replaying Jordan-local topic commits on top of the Original Lane. It is the place to inspect fresh upstream compatibility before promoting anything to Staging.
_Avoid_: nightly-local, dev/nightly-topic-stack branch

**Nightly Promotion Candidate**:
A Nightly Lane commit whose Linear Nightly Run is in review and whose replay report, upstream base, control-plane sync, topic checks, and required public or headed proof all agree. Eligibility does not itself authorize promotion.
_Avoid_: latest nightly, automatic release, approved build

**Staging Lane**:
The verified integration lane for Jordan-local updates. It receives tested topic commits from dev worktrees or the Nightly Lane and is the final proving ground before Main.
_Avoid_: test branch, QA copy

**Main Lane**:
The day-to-day T3 Code lane used by the operator. It is updated from Staging only after explicit confirmation, backups, green checks, and a controlled restart of the running main app.
_Avoid_: production, root checkout

## On-the-Go Voice Experience

### Topic Architecture

**On-the-Go Mode**:
A user-enabled T3 Code interaction mode containing Command State and Theo Conversation so the app can be operated primarily by voice.
_Avoid_: voice mode, hands-free mode

**On-the-Go Topic**:
The schema-v2 repo-local topic plugin that packages On-the-Go Mode as one replayable commit with `local-plugins/on-the-go/` metadata, replay contract, owned paths, documentation, and topic-owned tests. It applies independently to upstream T3 Code and has no hard dependency on other Jordan topics; optional integrations are discovered through Adapters and degrade visibly when absent. It is not an installable Codex plugin.
_Avoid_: Codex plugin, feature flag, patch bundle

**On-the-Go Runtime Module**:
The deep server Module owning voice state machines, Turn Scheduler, queues, Follow Mode, persistence, and policy behind a small stable Interface of schema-defined commands, events, and snapshots. Client and platform callers do not reproduce its rules.
_Avoid_: voice service, state store, UI controller

**On-the-Go Integration Seam**:
The small set of thin upstream registration and mounting points that connect the On-the-Go Topic to server orchestration, client runtime, settings, and app shells. The seam targets stable upstream capabilities rather than other Jordan topic files. Provider, transcription, speech, device, persistence, optional local-topic integrations, and deterministic-fake Adapters remain behind topic-owned internal seams.
_Avoid_: upstream fork, cross-cutting wiring, plugin hook

**On-the-Go Replay Contract**:
The topic metadata defining preserved intent, owned paths, integration seams, safe automatic repairs, human-stop conditions, and verification for replay onto a newer upstream T3 Code. Mechanical moves or equivalent Interface changes may auto-repair only when contract tests prove behavior; semantic changes to provider events, chat lifecycle, settings, or app mounting fail closed with the exact broken seam.
_Avoid_: merge strategy, conflict resolver, best-effort replay

### Commands, Safety, And Accessibility

**Command State**:
The default On-the-Go Mode state for concise app commands, navigation, dictation, response-queue control, and approvals without conversational intermediation. Each T3 Wake Phrase activates one Command State utterance.
_Avoid_: command mode, Theo commands

**Dictation State**:
The protected state entered by “T3, dictate a prompt,” where ordinary speech becomes editable draft text rather than Voice Actions. Only Canonical Safety Phrases remain active; “Finish dictation” returns the draft for review and Prompt Handoff remains required.
_Avoid_: Command State, transcription mode

**Command Resolver**:
The hybrid interpreter that detects reserved safety controls locally, resolves exact Command Vocabulary and Voice Routine phrases deterministically, and uses the selected Theo Model only to map free-form speech to cataloged Voice Actions and parameters. Model output remains subject to availability, confidence, trust, and confirmation gates.
_Avoid_: command model, free-form agent

**Voice Action Catalog**:
The shared catalog of stable T3 Code product actions available to Command State, including each action's parameters, spoken aliases, availability, and risk classification. Voice and visual controls invoke the same actions; uncataloged actions are reported as unsupported rather than guessed through UI manipulation.
_Avoid_: voice command list, model-driven clicking

**Voice Action Identity**:
The durable idempotency identity assigned to a state-changing Voice Action so reconnect and retry handling can reconcile its exact outcome without executing it twice. Unknown outcomes block repetition until resolved or explicitly recovered.
_Avoid_: request ID, command history

**Voice Action Audit**:
The immutable record of a resolved voice action's original transcript, semantic action, target, confirmation, and outcome. Project/chat audits follow their parent lifecycle; account/device audits retain for 90 days, with export and scoped deletion available.
_Avoid_: Voice Transcript, indefinite log

**Command Vocabulary**:
The visible mapping of user-preferred spoken words and phrases to Voice Actions and parameters. Custom vocabulary changes recognition and phrasing but never an action's availability, risk classification, or confirmation requirement. “Steer” is the replaceable built-in phrase for Agent Steering rather than a Canonical Safety Phrase; Voice Help and readbacks always use the active mapped phrase.
_Avoid_: raw voice macro, prompt alias

**Canonical Safety Phrase**:
A universal locally recognized recovery or authorization phrase, including “Stop,” “Cancel,” “Confirm,” and “Send it,” that cannot be removed, reassigned, or shadowed. Users may add non-conflicting aliases.
_Avoid_: custom command, wake phrase

**Voice Routine**:
A user-defined multi-step sequence of cataloged Voice Actions invoked by a spoken phrase. It stops on failure, inherits the highest risk classification in the sequence, and requires one read-back and Voice Confirmation when any step is consequential.
_Avoid_: Command Vocabulary, shell macro

**Command Suggestion**:
A non-executable alias or Voice Routine proposal Theo derives from repeated behavior. It enters the Command Vocabulary only after the user explicitly accepts it, and remains visible, versioned, editable, and removable.
_Avoid_: learned command, automatic routine

**Voice Parity Gate**:
The release requirement that every new interactive capability invoke a tested Voice Action or carry an explicit reviewed exception explaining why voice operation is impossible or unsafe. Voice behavior itself must remain operable through equivalent visual, touch/keyboard, and assistive-technology paths.
_Avoid_: accessibility checklist, best-effort voice support

**Reciprocal Accessibility**:
The requirement that every voice state, tone, spoken message, action, and confirmation have appropriate captioned, visual/haptic, screen-reader, and touch/keyboard representations without relying on one sensory channel alone.
_Avoid_: voice-only mode, captions setting

**Voice Parity Audit**:
The inventory that maps every existing interactive T3 Code capability to a tested Voice Action or reviewed exception. On-the-Go Mode cannot graduate from experimental or claim full voice control until the audit is complete.
_Avoid_: command list, launch checklist

**Voice Help**:
Catalog-driven contextual guidance invoked by “T3, what can I say?” or “T3, how do I…,” filtered by current UI, project/chat, queues, and pending state. Voice Dock exposes the complete searchable actions, custom vocabulary, routines, availability, risk, and confirmation requirements.
_Avoid_: static command documentation, tutorial

**Core Voice Journey**:
The minimum complete experimental flow covering activation, queues and announcements, Theo Conversation, Prompt Handoff, approvals, project/chat navigation, model selection, settings, and safe shutdown.
_Avoid_: MVP command set, partial voice demo

**Voice Readiness Check**:
The gated first-run onboarding that verifies permissions, Voice Preset/fallbacks, provider retention and egress disclosure, audio privacy, wake/Barge-In calibration, device trust, local safety controls, and a harmless sample command. On-the-Go Mode cannot activate until local safety controls pass.
_Avoid_: setup wizard, microphone test

**Degraded State**:
An active On-the-Go state used when local safety controls remain healthy but server, network, provider, or other non-safety capabilities are unavailable. T3 announces the limitations, preserves available local controls/models, fails unavailable features closed, and retries with bounded backoff; recovery gives one cue and refreshes queues without replaying intent. Local safety failure blocks activation instead.
_Avoid_: offline mode, partial failure

### Theo And Follow

**Theo Conversation**:
An explicitly entered On-the-Go Mode state where the user and Theo discuss the Focused Response and prepare the next prompt. Every submission requires a Prompt Handoff; successful submission produces a target-specific acknowledgement and returns to Command State while preserving the durable conversation.
_Avoid_: Theo mode, voice chat

**Follow Mode**:
An explicitly enabled On-the-Go behavior in which Theo observes exactly one selected Coding Agent chat per Voice Session Owner and speaks Follow Summaries of its ongoing work until the user switches or stops following. Follow, switch, and stop are read-only focus actions available from Command State and Theo Conversation with customizable aliases, so they need no Voice Confirmation. “Follow this chat” uses the visible or Focused chat; a unique explicit agent/project target switches immediately with spoken acknowledgement, while ambiguity produces numbered choices and no state change. Switching atomically detaches the previous chat, identifies the new Coding Agent and project/chat, and gives an immediate catch-up before live summaries begin. The previous chat continues producing normal Response and Attention items. An idle followed chat remains armed and is identified as waiting for its next turn. Archiving pauses summaries while preserving selection; its active turn may finish through ordinary tones/queues, but follow resumes only after unarchive plus “Resume following.” Deletion permanently clears the selection. Sleep retains the selection and accumulates a compact catch-up, then announces the update count without autoplay on wake. Off or restart retains the last selection but requires “Resume following.” Voice Ownership Handoff transfers the selection, identifies it on the new owner, and waits for “Continue.” “Theo, catch me up” requests an immediate summary without changing the follow selection.
_Avoid_: response playback, agent streaming, notification subscription

**Follow Summary**:
Theo's concise spoken account of material progress in the followed chat, generated at plan changes, completed file-edit batches, test results, blockers, approvals, final completion, or on demand. Each conversational two-to-three-sentence summary states what materially changed since the last summary, current status including tests/risk/blocker/uncertainty, and what the agent will do next. It defaults to under 20 seconds and omits code, raw logs, and long file lists unless requested. Ordinary summaries are rate-limited to at most one every 30 seconds while activity continues; blockers and approvals are immediate, and raw tool output or token streams are never narrated. After two active minutes without a material checkpoint, Theo gives one “Still working; no new checkpoint yet” cue and remains silent until state changes or the user requests a catch-up; a detected stall or failure becomes Attention rather than repeated filler. Follow speech never interrupts Theo Conversation, Dictation State, response playback, or a confirmation flow: immediate tones retain their rules, checkpoints coalesce, and one current catch-up speaks automatically when the active interaction ends if Follow Mode remains active. Superseded intermediate summaries are discarded. A final response still emits its immediate Response or Attention tone before the summary can speak, and the summary never clears either badge; existing handling and resolution rules remain authoritative. If budget, provider availability, or Context Egress Policy prevents generation, T3 speaks only safe structured facts it already holds, explicitly says the detailed Theo summary is unavailable, and never infers from raw logs or silently switches provider.
_Avoid_: Response Announcement, raw stream narration, progress log

**Follow Timeline**:
The chat-scoped accessible history of spoken Follow Summaries, their captions, citations, and covered Agent Checkpoint ranges. It retains only checkpoint identities, types, and timestamps rather than raw provider payloads; temporary and coalesced buffers are discarded after summarization. Archive preserves the timeline, while chat deletion removes it from every device through the normal Deletion Tombstone flow.
_Avoid_: provider event log, Theo Conversation, audio history

**Agent Checkpoint**:
A provider-neutral, source-evidenced progress event emitted conservatively by a Coding Agent Adapter for plan updated, edit batch completed, tests started/completed, approval requested, input requested, blocker, or turn completed/failed. Subagent checkpoints aggregate into their parent chat and identify a subagent only when its result, blocker, or failure materially affects the plan; a subagent is independently followable only when T3 exposes it as a selectable chat/thread. Unknown raw provider events do not create checkpoints or speech; Theo may fetch bounded chat context when an accepted checkpoint needs explanation.
_Avoid_: provider event, tool event, streaming delta

**Theo**:
The voice-first coding companion who helps the user understand queued Coding Agent responses, retrieve supporting context from all authorized Context Sources, and prepare the next prompt. Theo is governed by the Read-Only Companion Boundary.
_Avoid_: voice assistant, Coding Agent

**Theo Profile**:
The visible, versioned set of structured preferences Theo learns from conversations and uses across sessions. It layers a global User Profile, a Project Profile, and Session Overrides; every automatic update is disclosed, reversible, editable, and clearable.
_Avoid_: global memory, raw activation prompt

**Theo Data Controls**:
The settings for inspecting, exporting, deleting, and resetting Theo profiles, conversations, prompts, vocabulary, routines, queues, citations, and diagnostics at item, project, account, or device scope. Resetting Theo is consequential and never implicitly deletes original Coding Agent chats.
_Avoid_: account reset, chat deletion

**Deletion Tombstone**:
The synchronized deletion record that removes scoped Theo data and caches from every device on reconnect and stops active use immediately. Provider deletion is requested and reported when supported; otherwise provider retention remains explicitly disclosed.
_Avoid_: soft delete, provider erasure guarantee

**Theo Data Boundary**:
The authenticated T3 Code server trust boundary where synchronized Theo data is encrypted at rest, scoped by user/project, and decrypted only for authorized orchestration and selected-model calls. Device caches use OS-protected storage, and no separate Theo datastore or end-to-end encryption claim is made.
_Avoid_: end-to-end encryption, provider storage

**User Profile**:
The Theo Profile layer for communication style, pronunciation, verbosity, and general working preferences that apply across T3 Code.
_Avoid_: account settings, global memory

**Project Profile**:
The Theo Profile layer for terminology, conventions, risk tolerance, and workflow preferences that apply only to one project.
_Avoid_: project context, repository instructions

**Session Overrides**:
Temporary preferences for the current Theo Conversation that outrank Project and User Profile values but are not retained unless explicitly remembered.
_Avoid_: learned preferences, conversation memory

**Learned Preference**:
A stable user preference inferred from explicit or repeated conversational evidence and stored in the Theo Profile with its evidence, confidence, and last-updated time. Secrets, one-off project facts, quoted instructions, and uncertain inferences are not Learned Preferences.
_Avoid_: conversation memory, project context

**Preference Precedence**:
The rule that explicit user instructions outrank inferred preferences, Session Overrides outrank Project Profile values, Project Profile values outrank User Profile values, and newer repeated evidence may replace older inference. Theo asks when scope is unclear or conflicting non-explicit evidence remains unresolved.
_Avoid_: latest preference wins, silent conflict resolution

**Theo Activation Prompt**:
The session instruction assembled from Theo's fixed role and safety boundaries plus the current Theo Profile. Theo does not rewrite this prompt directly.
_Avoid_: system prompt, editable memory

**Theo Persona**:
The explicit user- or project-configured layer controlling Theo's tone, directness, verbosity, teaching style, humor, interruption style, and additional instructions. It outranks Learned Preferences but cannot override fixed role, safety, confirmation, or Prompt Handoff boundaries.
_Avoid_: Theo Profile, activation prompt

**Companion Stance**:
Theo's fixed default sequence: explain the result plainly, surface decisions, risks, uncertainty, and disagreement, then propose one concrete next step or Prepared Prompt. Personalization may alter style but cannot make Theo invent work, hide uncertainty, or act without Prompt Handoff.
_Avoid_: persona, response template

**Read-Only Companion Boundary**:
The rule that Theo may search, read, compare, and summarize authorized Context Sources but may not edit, execute, configure, approve, or communicate externally. Theo's only state-changing capability is a Prompt Handoff.
_Avoid_: supervised mode, limited access

### Responses And Context

**Coding Agent**:
A provider-backed agent working in a T3 Code chat, distinct from Theo.
_Avoid_: Theo, voice assistant

**Response Queue**:
The durable, account-level, completion-ordered collection of Queued Responses from every active T3 Code project and chat, independent of whether On-the-Go Mode is enabled. Queue and handled state survive restarts and synchronize across devices; unhandled responses leave the active queue after 30 days but remain in chat history.
_Avoid_: message queue, current-chat responses

**Queued Response**:
A completed Coding Agent response in the Response Queue, carrying the project, chat, and Coding Agent identity needed to announce its source.
_Avoid_: notification, unread message

**Focused Response**:
The Queued Response most recently identified by a Response Announcement and pinned as the subject of a Theo Conversation. Later arrivals do not replace it unless the user selects another response.
_Avoid_: latest response, active notification

**Comparison Set**:
The explicitly selected additional Queued Responses Theo considers alongside the primary Focused Response to identify disagreements, duplication, dependencies, and the best target for follow-up. New arrivals never join automatically.
_Avoid_: multiple focus, response history

**Response Context**:
The bounded information Theo receives automatically for a Focused Response: the response and originating prompt, relevant prior turns, current plan and change summaries, pending decisions, and project/worktree identity.
_Avoid_: full project context, entire repository

**Context Fetch**:
A retrieval by Theo of additional supporting context from T3 Code threads or other authorized sources when the Response Context is insufficient.
_Avoid_: tool execution, coding-agent action

**Spoken Progress Cue**:
The single concise status Theo gives after a noticeable Context Fetch or reasoning delay, while the Voice Dock identifies the active source. Theo does not repeat filler, and the user may stop the work.
_Avoid_: thinking aloud, repeated status announcement

**Spoken Attribution**:
Theo's concise verbal identification of a material source, paired with complete clickable citations in the Voice Dock. The command “T3, sources” reads source titles and supports opening or comparing them.
_Avoid_: spoken URL, uncited summary

**Context Source**:
An authorized source Theo may search and read for supporting context, including T3 Code threads, project workspaces, the web, and connected apps or services. All available Context Sources are enabled for Theo by default.
_Avoid_: access mode, Full Access

**Context Source Exclusion**:
A persistent setting or Session Override preventing Theo from using a Context Source. Theo identifies material limitations caused by exclusions and never re-enables a source implicitly.
_Avoid_: disconnected source, egress restriction

**Context Egress Policy**:
The source-specific rule defining which local or cloud Theo providers may receive minimal relevant excerpts from a Context Source. Incompatible sources are skipped with explanation and never cause silent data transfer or provider switching.
_Avoid_: connector permission, provider fallback

**Context Evidence**:
The minimal source excerpt actually used in a Theo answer, stored with its citation metadata and source version only when source policy permits. Temporary fetch buffers are discarded after the turn, and prohibited excerpts retain reference metadata only.
_Avoid_: context cache, copied document

**Untrusted Context**:
Content retrieved from a Context Source and treated as evidence rather than authority over Theo. It cannot change Theo's role, profile, persona, safety rules, command mappings, or Prepared Prompt target; embedded instructions and conflicts with trusted project instructions are surfaced with their source boundaries.
_Avoid_: system instruction, trusted prompt

### Prompt Delivery And Agent Scheduling

**Prompt Handoff**:
The user's explicit authorization for T3's Turn Scheduler to submit exactly the current ready Prepared Prompt revision to its bound Coding Agent and chat. Voice always uses the spoken Canonical Safety Phrase “Send it”; the visual composer uses its explicit Send action as the reciprocal control.
_Avoid_: approval, auto-submit, implicit confirmation

**Pending Turn**:
A durable, source-attributed scheduler submission accepted for a Coding Agent that already has a running turn, whether it originated from voice, the visual composer, MCP, or automation. It waits for that turn to finish without injecting into or interrupting it and may be inspected or compared by Theo under normal context permissions. Canceling, retargeting, or revising supersedes the queued record; revision creates a new Prepared Prompt revision and requires “Send it” again. “Cancel pending turn” removes it from dispatch but restores its content as a visible Prepared Prompt draft without requiring Voice Confirmation; only the separate destructive “Discard prompt” command deletes that draft after exact readback and Voice Confirmation.
_Avoid_: steer, background send, provider queue

**Pending Turn Queue**:
The durable FIFO sequence of Pending Turns for one Coding Agent. Only its head may dispatch when the agent becomes idle; the most recently acknowledged item is the sole referent of the immediate “No, steer the running agent” shorthand. Older items may be selected or reordered by an explicit position or prompt description after T3 reads back the resulting order. Canceling or editing an item closes its queue slot immediately so later items advance; a newly authorized revision joins the tail unless the user explicitly selects another position and accepts the resulting order readback. Pending Turns never expire by age. T3 warns at 10 items for one agent and caps at 25 per agent and 200 account-wide; limits may be lowered in settings but not bypassed by voice, and an excess prompt remains an unsent draft with an Attention Item. Failure, interruption, or session closure freezes the whole per-agent queue and creates one Attention Item; nothing auto-dispatches into a restarted or uncertain session. After Agent Recovery reconciles and summarizes the actual state, the separate explicit command “Continue queued work” releases the unchanged authorized FIFO queue without another “Send it.” Retargeting or editing still requires a fresh Prompt Handoff.
_Avoid_: Response Queue, global prompt queue, provider queue

**Turn Scheduler**:
The shared server-side authority through which voice, visual-composer, MCP, automation, and other programmatic prompt submissions reach a Coding Agent. New callers declare Queue, Steer, or Interrupt-and-replace rather than relying on timing; Queue is the safe default, and the visual Send action is the reciprocal equivalent of spoken “Send it.” Legacy callers temporarily default to Queue and receive an explicit disposition plus a deprecation warning until they declare intent. Programmatic callers receive separate `turn:queue`, `turn:steer`, and higher-risk `turn:interrupt` capabilities; every request carries an idempotency key and expected active-turn identity, stale requests fail closed, and Interrupt-and-replace requires both interrupt and submit authority.
_Avoid_: provider send, voice queue, composer outbox

**Turn Submission Lifecycle**:
The durable source-visible history of a scheduler submission through queued, steered, dispatched, canceled, superseded, and failed dispositions. Callers may query by submission identity or consume lifecycle events; an idempotent replay returns the recorded disposition and never recreates terminal work. A human-edited or retargeted prompt receives a new identity linked to its predecessor by `supersedes`. Prompt text follows its chat or Prepared Prompt lifecycle and is deleted with that parent; after terminal state, only submission identity, disposition, content hash, lineage, and an idempotency tombstone remain for 90 days, never deleted prompt text.
_Avoid_: provider event, response history, mutable request status

**Queue Continuation Gate**:
The safety check between completed turns in a Pending Turn Queue. Deterministic approval, requested-input, failure, access, worktree, target-state, and other known blockers freeze the remaining queue; normal compatible results continue automatically. Only uncertain semantic conflicts between the result and next prompt are classified by Theo. If Theo is unavailable or remains uncertain, the gate fails closed, explains what could not be verified, creates one Attention Item, and preserves FIFO order. “Continue anyway” is a Consequential Voice Action that reads back the agent and pending count and requires Voice Confirmation.
_Avoid_: queue approval, response classifier, automatic prompt chain

**Agent Recovery**:
The fail-closed reconnection or resumption of a Coding Agent after failure, interruption, or session closure. “Retry this agent” reconciles provider and T3 state and summarizes any partial outcome; it never replays the failed turn or releases Pending Turns. Only a later explicit “Continue queued work” unfreezes the reconciled queue.
_Avoid_: retry turn, restart and replay, queue resume

**Agent Steering**:
The provider-capability-gated delivery of an explicitly targeted Prepared Prompt to a Coding Agent's current running turn without interrupting it. New guidance such as “Steer the running agent to focus on the failing tests” creates a targeted Prepared Prompt, receives a readiness summary, and requires “Send it.” The user may also immediately correct a Pending Turn acknowledgement with “No, steer the running agent”; this correction needs no additional Voice Confirmation because the unchanged prompt revision and target already received “Send it.” A turn blocked on an approval or requested user input is never a steering target: T3 routes that need through the Attention Queue and keeps the Prepared Prompt pending. T3 atomically removes the Pending Turn only after steering is accepted, and otherwise keeps it queued and explains the limitation. Any content or target change requires a new Prompt Handoff.
_Avoid_: Agent Interruption, queued turn, implicit mid-turn send

**Steering Correction Window**:
The 10-second interval after T3 acknowledges a Pending Turn during which that turn is held from dispatch so “No, steer the running agent” can safely target the active-turn identity observed at queue time. With Barge-In enabled, the correction is wake-free; with Barge-In disabled, it requires the T3 Wake Phrase or headset/push-to-talk activation, preventing ambient speech from triggering it. If the original turn finishes first, T3 says the prompt remains queued and dispatches it only after the window closes; it never reinterprets the correction as steering a newly started turn.
_Avoid_: confirmation timeout, queue delay, active-turn grace period

**Steering Acknowledgement**:
The short spoken and Voice Dock result emitted after every Agent Steering attempt. Success identifies the Coding Agent and project/chat; failure states why steering was unavailable and gives the preserved Pending Turn's queue position. It creates no notification badge or special tone.
_Avoid_: Response Announcement, Attention Item, delivery receipt

**Prepared Prompt**:
The visible, durable, versioned prompt produced through Theo Conversation or Dictation State, bound to an explicit Coding Agent/chat and summarized as ready. It survives leaving Theo, Off, and restarts; content, target, or target-state changes create or mark a revision stale and invalidate readiness until reconciled and summarized again. Only explicit discard removes it.
_Avoid_: draft transcript, pending command

**Stale Prepared Prompt**:
A retained Prepared Prompt whose target chat, model/access configuration, or relevant context changed after readiness. It cannot be submitted until Theo reconciles the change and produces a new readiness summary.
_Avoid_: invalid draft, failed handoff

**Archived Voice Context**:
Queue and Theo material whose originating chat or project is archived and remains readable but cannot receive a Prepared Prompt until explicitly unarchived or retargeted. Archiving a chat with Pending Turns reads back their count and whether a turn is running, requires Voice Confirmation, freezes pending work, and lets the current turn finish unless the user explicitly chooses “Interrupt and archive.” Its eventual response enters Response or Attention with an archived-chat label. Unarchiving never resumes pending work until “Continue queued work.” Deletion reads back the pending count and any active turn, requires Voice Confirmation, freezes and cancels pending work, interrupts the exact active turn, and reconciles a proven terminal state before deleting chat and prompt content. If interruption remains uncertain, deletion pauses with an Attention Item rather than orphaning a running agent. Completed deletion retains only the 90-day Turn Submission Lifecycle tombstones while cascading a Deletion Tombstone through associated voice state.
_Avoid_: Stale Prepared Prompt, deleted context

**Prepared Prompt Revision**:
A durable version created by a conversational content or target edit to a Prepared Prompt. Each revision has a visual diff and spoken change summary, supports undo, and invalidates readiness until Theo summarizes it.
_Avoid_: transcript edit, prompt history

**Prompt Retargeting**:
The explicit reassignment of a Prepared Prompt from its default Focused Response origin to another existing Coding Agent/chat or to a new Coding Agent on the project. Retargeting rebuilds relevant context, creates a new prompt revision, and requires a new readiness summary before Prompt Handoff.
_Avoid_: forwarding, implicit agent selection

**Agent Handoff Package**:
The bounded context supplied when Prompt Retargeting creates a new Coding Agent: the Prepared Prompt; project/worktree/branch/provider/model/runtime identity; relevant response and conversation excerpts; plan, diff, checks, blockers, and decisions; applicable instructions/preferences; and references to full source threads. It excludes secrets, unrelated chats, raw logs, and Theo reasoning.
_Avoid_: full thread copy, context dump

**Agent Worktree Isolation**:
The rule that a newly created Coding Agent capable of editing receives a semantically named isolated worktree by default. Writable worktree sharing requires an explicit request and Voice Confirmation; read-only research agents may share.
_Avoid_: new chat, shared project

**New Agent Preset**:
The project-level default provider, model, runtime/access mode, interaction mode, and workspace policy used when Theo creates a new Coding Agent. Explicit request values outrank the preset, followed by originating-agent settings and then global defaults; access escalation requires Voice Confirmation.
_Avoid_: Voice Preset, provider default

**Offline Draft**:
A transcribed prompt or command draft retained locally while the Voice Session Owner cannot reach T3 Code. It may be edited or discarded but cannot perform a remote action while disconnected.
_Avoid_: queued prompt, offline command

**Pending Handoff**:
An Offline Draft for which the user said “Send it” while disconnected. Reconnection never submits it automatically; T3 reads back the target and requires a new Prompt Handoff.
_Avoid_: outbox message, deferred send

### Models, Speech, And Diagnostics

**Transcription Model**:
The independently selected model that converts the user's activated speech into text for Command State or Theo Conversation.
_Avoid_: dictation model, speech model

**Theo Model**:
The independently selected reasoning model that conducts Theo Conversation and prepares Response Announcements and follow-up prompts.
_Avoid_: Coding Agent model, voice model

**Speech Configuration**:
The independently selected speech-synthesis model plus configurable System, Theo, and Agent Playback Voice Roles, with optional per-agent assignment and shared defaults.
_Avoid_: Theo Model, text-to-speech toggle

**Voice Role**:
A speech identity within Speech Configuration: System Voice for announcements/confirmations/errors, Theo Voice for companion dialogue, or Agent Playback Voice for Spoken Rendering. Roles may share a voice while remaining semantically distinct.
_Avoid_: voice model, persona

**Speech Audio Cache**:
The encrypted device-local temporary cache of synthesized speech, expiring within 24 hours or sooner under storage pressure. Text, Spoken Rendering, citations, and sentence-level playback position persist and synchronize, but audio does not.
_Avoid_: voice recording, synchronized audio

**Voice Preset**:
A recommended bundle of Transcription Model, Theo Model, and Speech Configuration choices that simplifies initial On-the-Go Mode setup without preventing independent customization.
_Avoid_: access mode, fixed voice stack

**Voice Fallback Chain**:
The optional, pre-approved ordered alternatives for a Transcription Model, Theo Model, or Speech Configuration. T3 announces every fallback and never sends data to a provider outside the chain.
_Avoid_: silent failover, automatic provider selection

**Voice Usage Budget**:
The optional per-session or daily warning and hard limits for transcription duration, Theo Model usage, speech synthesis, and associated cost. A hard limit stops paid model calls without silent fallback while local controls and queue state remain available.
_Avoid_: provider rate limit, context window

**Voice Diagnostics**:
Privacy-safe structured records of voice state transitions, action identifiers, confidence bands, latency, provider/model selection, fallback events, queue lifecycle, interruptions, and errors. They never contain raw audio or transcript content by default; a diagnostic export may include only explicitly previewed redacted excerpts.
_Avoid_: voice recording, conversation telemetry

**Fail-Closed Voice Input**:
The rule that T3 performs no command and sends audio nowhere else when transcription fails and no approved fallback remains.
_Avoid_: best-effort command, silent provider fallback

**Voice Capability Catalog**:
The provider-neutral catalog from which On-the-Go Mode model choices are selected. Configured cloud and local providers declare transcription, reasoning, and speech-synthesis capabilities so each setting shows only compatible models.
_Avoid_: vendor list, OpenAI voice models

**Context Modality**:
A form of source material, such as text or vision, that a Theo Model declares it can inspect. Theo uses permitted supported modalities with citations and otherwise states limitations, relying only on available derived text without guessing.
_Avoid_: model capability, attachment type

**Model Switch Boundary**:
The safe point at which a live voice configuration change takes effect: the next Activated Utterance for transcription, the next sentence for speech, and the next Theo turn for reasoning. Theo Model changes preserve context but invalidate Prepared Prompt readiness until re-summarized, and every switch reapplies Context Egress Policy.
_Avoid_: session restart, immediate model swap

**Conversation Language**:
The language detected for the current Activated Utterance and used by Theo for its reply unless the Theo Profile fixes a response language. Command Vocabulary may provide language-specific aliases that resolve to the same Voice Actions, allowing code-switching within a session.
_Avoid_: app locale, transcription language

### Utterances And Spoken Output

**Activated Utterance**:
The speech captured after a T3 Wake Phrase or Theo Wake Phrase and sent to the selected Transcription Model. Its raw audio is discarded after transcription succeeds or fails.
_Avoid_: recording, microphone history

**Voice Endpointing**:
The adaptive device-local rule for deciding that an Activated Utterance is complete, using shorter Command State and longer Theo/dictation silence thresholds. “Keep listening” holds the turn open, push-to-talk ends on release, and bounded cadence learning remains visible/configurable.
_Avoid_: transcription timeout, silence detection

**Voice Transcript**:
The visible text produced from an Activated Utterance and retained in the relevant command or Theo Conversation history for audit and correction.
_Avoid_: audio recording, hidden transcription

**Transcript Correction**:
A user-provided replacement for a pending transcript or a labeled readable correction beside an already executed action's immutable original transcript, resolved Voice Action, confirmation, and outcome. Corrections never rewrite what T3 actually acted on.
_Avoid_: edited audit log, retranscription

**Voice Clarification**:
The focused read-back and question T3 uses when a Voice Transcript or its intended action is uncertain. T3 performs no action until the user confirms or corrects it.
_Avoid_: Voice Confirmation, best guess

**Spoken Rendering**:
The speech-aware rendition of a Coding Agent response that preserves conclusions, decisions, warnings, and next steps while summarizing code, logs, tables, paths, and other visually structured material. Verbatim speech remains available on request.
_Avoid_: raw Markdown playback, Response Announcement

**Streaming Theo Turn**:
A Theo reply spoken in stable sentence-sized chunks before the complete model response is available, with its transcript built concurrently. It remains cancellable, while Coding Agent responses are queued only after their turns complete.
_Avoid_: partial Coding Agent response, buffered speech

**Private Output**:
Speech routed through headphones, an earpiece, or another explicitly trusted audio route, where full Spoken Rendering is permitted except for credentials and secrets.
_Avoid_: private data, trusted session

**Public Output**:
Speech routed through a device loudspeaker, where T3 defaults to summaries, redacts sensitive values, and avoids verbatim private connected-app content. The user may explicitly allow fuller playback for the current session, but credentials and secrets are never spoken.
_Avoid_: speaker mode, unrestricted playback

**Audio Focus Policy**:
The rules governing On-the-Go speech alongside other device audio: calls force Sleep and suppress tones; media ducks; navigation, alarms, and safety alerts pause T3 at a sentence boundary; and route changes immediately reapply Private or Public Output handling.
_Avoid_: volume setting, audio route

**Power Saving Policy**:
The device-local behavior that uses the lowest-power wake detector, disables background prefetch, and warns at 15% battery while not charging without silently changing state. Optional thresholds may enter Sleep or Off, and OS suspension requires explicit later reactivation.
_Avoid_: battery saver, automatic Sleep

### Devices, Ownership, And Mode Lifecycle

**Native On-the-Go Session**:
An On-the-Go Mode session that remains active while the Electron app is minimized or the native mobile app is backgrounded or screen-locked, with platform-required microphone indicators.
_Avoid_: always-on assistant, background web session

**Web On-the-Go Session**:
An On-the-Go Mode session in the hosted web app that remains active only while its browser tab is foregrounded.
_Avoid_: background voice session, native session

**Voice Session Owner**:
The single device currently authorized to listen, detect wake phrases, play queue tones, and produce On-the-Go speech. Queue and badge state may synchronize to other devices, but activating another owner explicitly silences the previous one.
_Avoid_: active tab, primary device

**Voice Ownership Handoff**:
The explicit transfer of Voice Session Owner to another device, carrying the Focused Response, Theo transcript, prepared prompt, queue state, and playback position. The new owner identifies the prior topic and waits for “Continue” instead of resuming speech automatically.
_Avoid_: audio transfer, device sync

**Trusted Voice Session**:
An On-the-Go session authorized through the Voice Session Owner's normal device authentication and permitted to remain trusted through device lock while ownership stays stable. By default it downgrades to read-only after one hour without an accepted utterance or trusted headset action; ownership or headset changes, sign-out, and restart also downgrade it, and voice recognition alone cannot authorize Consequential Voice Actions.
_Avoid_: voiceprint, unlocked microphone

**Mode Activation Control**:
An explicit in-app toggle, desktop shortcut, mobile system action, or supported headset action that enables On-the-Go Mode while no listener is running. Once enabled, the spoken command “T3, turn off On-the-Go Mode” disables it completely.
_Avoid_: voice enable command, hidden listener

**Voice Dock**:
The compact persistent surface shown across T3 Code while On-the-Go Mode is enabled, exposing voice state, live transcript, Focused Response, Queue and Attention badges, the focused Coding Agent's neutral Queued Work count, and essential controls. “T3, what work is queued?” speaks the global per-agent Pending Turn summary. Pending work has no notification badge; only a frozen queue contributes to Attention, avoiding double-counting. Native lock-screen variants expose only non-sensitive status and controls until the device is unlocked.
_Avoid_: voice modal, microphone button

**Account Voice Settings**:
The synchronized On-the-Go preferences and state shared across the user's devices, including model choices/fallbacks, Theo Profile/Persona, Command Vocabulary, Voice Routines, language, budgets, default Barge-In, and durable queues.
_Avoid_: device settings, active voice session

**Device Voice Settings**:
The local On-the-Go state and preferences that do not synchronize, including On/Off/Sleep, calibrated wake models, microphone sensitivity, audio route, headset bindings, local model availability, and temporary Public Output overrides.
_Avoid_: account settings, Voice Session Owner

**Sleep State**:
A temporary On-the-Go Mode state entered with “T3, go to sleep” that stops commands, transcription, Theo, and spoken reminders while retaining only a local “T3, wake up” detector. Queue tones and the Queue Badge continue, and no sleeping audio leaves the device.
_Avoid_: off, mute, background mode

**Off State**:
The state in which On-the-Go Mode has no listener, voice tones, voice haptics, or spoken output. Durable queues continue updating under ordinary T3 Code notification policy, and returning requires Mode Activation Control.
_Avoid_: Sleep State, disabled feature

### Interruption And Consequential Actions

**Barge-In**:
An optional behavior in which detected user speech interrupts Theo's current speech and begins the next turn without another Theo Wake Phrase, and exact bounded follow-up phrases such as a Steering Correction may be spoken without another wake phrase. When disabled, every Theo follow-up and bounded correction requires its wake phrase or an equivalent headset or push-to-talk gesture, preventing ambient speech from interrupting or redirecting work.
_Avoid_: wake word, stop command

**Stop Control**:
The wake-word-free local command “Stop” that immediately halts current speech, Theo generation, or Context Fetch while preserving the current state and Focused Response. It remains available while T3 is speaking even when Barge-In is disabled.
_Avoid_: Cancel, Back to commands, Off

**Agent Interruption**:
A Consequential Voice Action explicitly targeting a running Coding Agent and chat to stop its current turn. It is distinct from Stop Control and requires exact target read-back plus Voice Confirmation because partial work may remain.
_Avoid_: Stop, cancel speech

**Cancel Control**:
The command “Cancel” that rejects a pending Voice Clarification, Voice Confirmation, or not-yet-executed action without exiting the current state.
_Avoid_: Stop, deny approval

**Consequential Voice Action**:
A Command State action whose mistaken execution could delete or discard work, terminate processes, change access, grant an approval, merge or promote code, or write to an external system.
_Avoid_: voice command, destructive command

**Voice Confirmation**:
The separate spoken “Confirm” required within 15 seconds after T3 reads back the exact Consequential Voice Action and its target. One “Repeat” rereads and restarts the timer; ambiguity, silence, timeout, or “Cancel” aborts, and accessibility settings may extend the window to 60 seconds. Prompt Handoff uses “Send it” instead.
_Avoid_: Prompt Handoff, implicit confirmation

### Response And Attention Alerts

**Response Arrival Tone**:
The immediate nonverbal sound emitted when a Queued Response arrives, including while other speech is active. Arrivals within two seconds coalesce into one multi-response tone while every response increments the Queue Badge; source identification and response playback remain silent until requested.
_Avoid_: response announcement, response playback

**Queue Reminder Tone**:
The single nonverbal sound emitted when current Theo or response speech finishes after one or more new Queued Responses arrived during that spoken segment. It does not repeat merely because older responses remain unhandled.
_Avoid_: repeated arrival tone, spoken reminder

**Response Announcement**:
An on-demand spoken identification of a Queued Response that names its Coding Agent and project/chat, gives a one-sentence outcome summary, and states whether the user's decision is required. It is separate from speaking the response itself and omits detailed logs and code.
_Avoid_: arrival announcement, response playback

**Announcement Prefetch**:
The policy-aware background generation of a Response Announcement after queueing while On-the-Go Mode is Active or sleeping. Off, Low Power, Degraded State, exhausted budget, or egress restrictions use lazy generation instead; generated announcements are cached with their Queued Responses.
_Avoid_: automatic playback, response prefetch

**Last Announcement Command**:
The Command State request “T3, what was the last announcement?” which speaks the Response Announcement for the most recently arrived Queued Response.
_Avoid_: next announcement, read next response

**Queue Navigation**:
The canonical ordering in which “last announcement” selects the newest arrival, “next response” selects the oldest unhandled response, “previous response” follows navigation history, filters preserve global order, and “what needs me” selects the oldest unresolved Attention Item. T3 states the selected position and remaining count.
_Avoid_: queue sorting, chat navigation

**Queue Badge**:
The visible numeric indicator of how many Queued Responses await the user's attention. A Response Announcement does not reduce it; full playback, opening the response, beginning a Theo Conversation about it, or explicit dismissal does.
_Avoid_: notification counter, unread-message badge

**Attention Queue**:
The durable, account-level, high-priority queue of Coding Agent approvals, requested user input, and failures that block progress. Its items are handled before Queued Responses, survive restarts, synchronize across devices, do not automatically interrupt Theo's speech, and remain until resolved, canceled, or proven stale by the originating session.
_Avoid_: Response Queue, notification list

**Attention Item**:
A blocking approval, requested input, failure, or confidently decision-seeking completed response in the Attention Queue, announced oldest-first by “T3, what needs me?” Decision-seeking responses are promoted rather than duplicated across queues; uncertain classification remains a normal Queued Response.
_Avoid_: Queued Response, alert

**Voice Approval**:
The explicit resolution of an approval Attention Item using “Deny,” “Approve once,” or provider-supported “Approve for this session,” followed by exact read-back and Voice Confirmation. Generic assent triggers Voice Clarification rather than approval.
_Avoid_: yes, Prompt Handoff

**Attention Tone**:
The distinct nonverbal sound emitted when an Attention Item arrives.
_Avoid_: Response Arrival Tone, spoken interruption

**Attention Reminder Tone**:
The single distinct nonverbal sound emitted after a spoken segment when one or more Attention Items arrived during that segment. It follows the immediate Attention Tone without automatically speaking or interrupting and supersedes a Queue Reminder Tone when both kinds arrived.
_Avoid_: Attention Tone, spoken alert

**Voice Alert Policy**:
The user-configurable tone and haptic behavior for Response and Attention events. Alerts respect OS silent and Do Not Disturb by default; time-sensitive or critical Attention delivery requires explicit platform permission, while badges and queues always continue updating.
_Avoid_: critical alert, notification settings

**Attention Badge**:
The visible numeric indicator of unresolved Attention Items, separate from the Queue Badge. Announcing an item does not reduce it; only resolution or cancellation does.
_Avoid_: Queue Badge, combined notification count

### Wake Phrases

**T3 Wake Phrase**:
The locally detected phrase that activates one Command State utterance without entering a persistent conversation. It defaults to “T3” and may be replaced after local calibration and false-trigger testing.
_Avoid_: command wake word, T3 command

**Theo Wake Phrase**:
The locally detected phrase that enters a persistent Theo Conversation, which ends when the user says “Back to commands.” It defaults to “Hey Theo” and may be replaced after local calibration and false-trigger testing.
_Avoid_: companion wake word, Theo command

**Wake Phrase Calibration**:
The local recording and false-trigger test required before custom T3 and Theo Wake Phrases become active. Custom phrases replace the defaults, while Mode Activation Control remains the recovery path.
_Avoid_: voice training, speaker authentication

**Wake Feedback**:
Device-local evidence from explicit false-activation or missed-wake reports. Repeated evidence may produce a reversible calibration suggestion, but changes require explicit acceptance and audio never leaves the device.
_Avoid_: voice telemetry, automatic threshold tuning
