# On-the-Go Mode — Design Spec

**Date:** 2026-05-06
**Branch:** `feat/on-the-go-mode`
**Worktree:** `/home/jgigg/code/t3code-on-the-go`
**Status:** Approved — ready for implementation planning

## Summary

A mobile-first, voice-first mode for T3 Code that lets the user drive their coding agent away from their desk. Completed agent threads surface as notifications; tapping one enters a hands-free voice flow where a "summary bot" reads a TL;DR aloud, helps the user formulate a reply through natural conversation, and submits an optimized prompt back to the main thread on an explicit commit gesture. Sessions can be paused and resumed.

## Goals

- Let a user with their phone in one hand make meaningful progress on an agent-driven coding task without typing.
- Reuse existing T3 Code infrastructure (pairing, RPC, thread state, persistence) — no new server work for v1.
- Keep the voice and AI layers behind swappable interfaces so cloud/realtime upgrades plug in without rewrites.
- Ship something that is genuinely calm and minimal on the screen, not a desktop UI shrunk down.

## Non-goals (v1)

- Web Push / OS-level notifications when the app is fully closed (deferred to v2 — needs PWA + service worker + VAPID).
- Multi-device coordination of the same on-the-go session (start on phone, finish on desktop).
- Offline mode — the feature is fundamentally network-dependent.
- Voice quality / mic noise suppression beyond what the browser provides.
- Native mobile app. v1 is browser-only — runs in mobile Safari and mobile Chrome via the existing T3 Code web app pairing flow. No service worker, no PWA install, no manifest. PWA installability is v2 work and only required for Web Push.

## Context

T3 Code is a minimal web GUI for coding agents (Codex, Claude, OpenCode), shipped as a desktop Electron app and a web app (`apps/web`, Vite + React + TanStack Router + shadcn/Tailwind + Lucide, zinc base color, `base-mira` style). It has an existing remote-access story: backend can be exposed via LAN HTTP, Tailscale, or `t3 serve`, and other devices (phone, tablet, separate desktop) connect via a pairing link or QR code. Live thread state flows through an existing RPC subscription layer.

This feature lives in `apps/web` as a new top-level route, reusing the existing pairing flow for auth and the existing RPC for data.

## Top-level decisions

| Concern                     | Decision                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where it lives              | Dedicated route `/on-the-go/$tab` in `apps/web` **plus** a toggle icon in the existing header. Available on any device, intentionally entered.                                                                                                                                                                                                                                                              |
| Voice stack                 | **Browser-native default** (`SpeechSynthesis` + `webkitSpeechRecognition`) behind a `VoiceAdapter` interface. Cloud upgrades (OpenAI Realtime, ElevenLabs+Whisper) plug in later via the same interface, no orchestrator changes.                                                                                                                                                                           |
| Notification trigger        | Threads in state `awaiting` (agent finished, awaiting user) **or** `errored` (crash / permission denial / unrecoverable). Deduped per `threadId` — same thread cycling produces one entry, updated in place.                                                                                                                                                                                                |
| Summary bot AI              | **Pluggable `SummaryAdapter` interface.** v1 ships with `OpenAIAdapter` (default `gpt-4o-mini`), `AnthropicAdapter` (default `claude-haiku`), and `MainAgentCliAdapter` (escape hatch for users who refuse a second key — uses the existing agent CLI; slower; marked experimental).                                                                                                                        |
| Voice interaction model     | **Auto-listen turn-taking** (silence-detection ends turns, no per-turn wake-phrase). Explicit commit gate to send to main thread: configurable phrase (default `"ship it"`) **or** tap a big button. Visible `Pause / Mic / Ship it` button bar always present as fallback.                                                                                                                                 |
| Bot interruption            | Toggleable in settings. Default ON: user speaking interrupts bot mid-TTS.                                                                                                                                                                                                                                                                                                                                   |
| Idle timeout                | After 30s silence: TTS prompt "Still there?" If no answer in 15s, auto-pause (moves to Paused tab).                                                                                                                                                                                                                                                                                                         |
| Optimized prompt generation | Single LLM call at commit time, using a versioned skill file (`apps/web/src/onTheGo/skills/optimize-prompt.md`) loaded as system prompt. Provider-agnostic — works whether `SummaryAdapter` is OpenAI, Anthropic, or escape-hatch. Anthropic adapter applies prompt caching automatically.                                                                                                                  |
| Commit confirmation         | When commit phrase fires: (1) compose call → (2) audible preview spoken aloud → (3) full prompt text shown on screen → (4) 3-second cancel countdown with big visible Cancel button → (5) prompt sent + notification cleared.                                                                                                                                                                               |
| Optimizer fallback          | If `composePrompt` fails (network, rate limit, malformed response), automatically send the **full side-conversation transcript verbatim** wrapped in an envelope that signals to the main agent: "this is a fallback transcript — please synthesize and proceed."                                                                                                                                           |
| Pause UX                    | Two tabs: `Inbox` (unread) and `Paused` (interrupted sessions). Pausing snapshots full session state — history, last bot reply, original notification. Resume restores conversation with TTS context-restore prompt.                                                                                                                                                                                        |
| Off-app awareness           | Browser `Notification` API for system-style banners while the tab is loaded (foreground or background). No service worker, no PWA install required. Web Push deferred.                                                                                                                                                                                                                                      |
| Notifications panel layout  | Card-based (~180-200px tall), 3-4 visible per screen. Each card: status badge + thread title + 3-line agent message preview + change chip (e.g. "4 files edited") + branch + tap-to-summarize affordance. Errored entries float to top. Swipe-left = dismiss, swipe-right = pause.                                                                                                                          |
| Voice screen layout         | Phone-call style: thin status header, large central voice indicator (3-dot pulse / animated ring / spinner / mic), live caption ribbon (latest 1-2 lines, fades after 5s of silence), three huge buttons at the bottom (`Pause / Mic / Ship it`). Swipe-up reveals full transcript drawer.                                                                                                                  |
| Theming                     | Extend existing T3 Code shadcn / zinc / `base-mira` palette. Same colors and primitives, but type and tap targets aggressively scaled up (body 18-20px, buttons ≥64pt tall). No new design system.                                                                                                                                                                                                          |
| Privacy / persistence       | Audio never persisted by us. (Browser STT vendors — Apple, Google — may transcribe in their own cloud services; their privacy posture, out of our scope.) Transcripts: in-memory during session, persisted on pause via existing data layer, archived as collapsed metadata under the resulting main-thread message on commit, discarded on dismiss. No telemetry of voice content leaves the user's infra. |
| Onboarding                  | One-screen first-run flow: welcome → mic permission → notification permission → SummaryAdapter setup (pick provider + paste key, or escape-hatch) → done. Settings panel exposes the same toggles afterwards.                                                                                                                                                                                               |
| Toggle placement            | Small icon (Lucide `phone` or `headphones`) in the existing header alongside settings/account. Tap → `/on-the-go`. On `/on-the-go`, icon swaps to `x-circle` and returns to regular UI.                                                                                                                                                                                                                     |
| Post-commit                 | Stay in on-the-go view. Toast "Prompt sent — agent is working." Notification animates out. Return to Inbox.                                                                                                                                                                                                                                                                                                 |

## Architecture

Six independently-understandable units plus two swappable interfaces. Module dependencies flow one way: routes → orchestrator → interfaces / stores → existing RPC.

```
                   OnTheGoRoutes
                (TanStack: /on-the-go/$tab)
                          │
                          ▼
              OnTheGoFlowOrchestrator
        (FSM: idle → entering → summarizing →
              conversing → composing →
              countdown → committing → idle)
                          │
        ┌─────────┬───────┴────────┬─────────────┐
        ▼         ▼                ▼             ▼
  Notifications  Paused        VoiceAdapter   SummaryAdapter
     Store     Sessions       (interface,    (interface,
                Store         browser impl)  3 impls)
        │         │                              │
        └────┬────┘                              ▼
             ▼                            skills/
   Existing T3 Code RPC                optimize-prompt.md
   (thread state subs,
   pairing, persistence)
```

**Why interfaces over concrete classes for voice and AI:** the orchestrator is the only place state and timing matter, and it's expensive to test with real APIs. Using interfaces means the orchestrator's tests run with fakes (no network, no browser), and the interface contract is a stable seam against which both fakes and real impls are written. Future cloud adapters (OpenAI Realtime for voice, etc.) plug in without orchestrator changes.

**Why no server changes for v1:** thread state already streams through the existing RPC subscription layer. Pairing already authenticates phones to a backend. Paused sessions can persist via the existing data layer. The only future server work is the Web Push subscribe endpoint, which is explicitly deferred.

### File layout

```
apps/web/src/onTheGo/
  components/        ← NotificationCard, ThreeButtonBar, VoiceIndicator,
                       LiveCaptionRibbon, TranscriptDrawer, CommitCountdown,
                       OnboardingFlow, OnTheGoSettings
  hooks/             ← useVoiceSession, useNotifications, useCommitCountdown
  state/             ← notificationsStore, voiceFlowMachine,
                       pausedSessionsStore
  flow/              ← OnTheGoFlowOrchestrator
  skills/
    optimize-prompt.md   ← versioned skill file, ~30-80 lines
  voice/
    VoiceAdapter.ts          ← interface
    BrowserVoiceAdapter.ts   ← default impl (browser APIs)
  adapters/
    SummaryAdapter.ts        ← interface
    OpenAIAdapter.ts
    AnthropicAdapter.ts
    MainAgentCliAdapter.ts   ← escape hatch (uses effect-acp / effect-codex-app-server)
  routes/
    on-the-go.$tab.tsx       ← TanStack Router route ($tab = inbox | paused)
  settings/                  ← OnTheGoSettings panel
  __tests__/                 ← orchestrator + store tests with fake adapters
```

## Components and interfaces

### `VoiceAdapter` interface

```ts
interface VoiceAdapter {
  speak(text: string, opts?: { onStart?: () => void; onEnd?: () => void }): AbortablePromise<void>;
  listen(opts: {
    onPartial?: (text: string) => void;
    silenceTimeoutMs: number;
  }): AbortablePromise<{ finalText: string }>;
  interrupt(): void;
  destroy(): void;
}
```

**`BrowserVoiceAdapter` (default impl):**

- TTS via `SpeechSynthesisUtterance` + `speechSynthesis`.
  - iOS Safari requires the first utterance to be triggered inside a user-gesture stack — primed during onboarding when the user taps "Enable microphone."
- STT via `webkitSpeechRecognition` (Chrome/Safari), continuous mode + interim results.
  - Silence detection hand-rolled on top of `onresult` events: 1.5s without new partial text → fire `finalText`.
- `interrupt()` cancels both `speechSynthesis` and `recognition` idempotently.
- Page Visibility API integration: on `visibilitychange` to hidden, in-flight listen is canceled and the orchestrator transitions to a paused state.

**Future cloud adapters** (out of scope for v1) implement the same interface: `OpenAIRealtimeVoiceAdapter`, `ElevenLabsTtsWhisperSttAdapter`. The interface is the v1 deliverable.

### `SummaryAdapter` interface

```ts
type Turn = { role: "user" | "assistant"; text: string; at: number };

interface SummaryAdapter {
  summarize(input: { agentMessage: string; userMessage: string }): Promise<string>;
  reply(input: { history: Turn[]; userTurn: string }): Promise<string>;
  composePrompt(input: { history: Turn[]; skill: string }): Promise<string>;
}
```

- `summarize` produces the initial TL;DR spoken when the user enters the voice flow. Context: just the agent's final message + the user's last message that triggered it (per Q4 follow-up — small, focused).
- `reply` is the per-turn conversational response.
- `composePrompt` is the commit-time call. `skill` is the loaded contents of `optimize-prompt.md`, used as the system prompt.

**Implementations:**

- **`OpenAIAdapter`** — direct `fetch` to `chat.completions`. Default model `gpt-4o-mini`. System prompt for `summarize`/`reply` is inline; `composePrompt` uses the skill file.
- **`AnthropicAdapter`** — direct `fetch` to `messages` API. Default `claude-haiku-4-5`. Prompt caching applied automatically to the system prompt block (since `composePrompt` is called repeatedly across sessions with the same skill file).
- **`MainAgentCliAdapter`** — spawns ephemeral sessions through the existing `effect-acp` / `effect-codex-app-server` infrastructure. Slow but no second API key. Marked **experimental** in settings.

### `NotificationsStore`

```ts
type Notification = {
  threadId: string;
  threadTitle: string;
  status: "awaiting" | "errored";
  agentLastMessage: string;
  userLastMessage: string;
  changeSummary?: string;
  branch?: string;
  updatedAt: number;
};

interface NotificationsStore {
  notifications: Signal<Notification[]>;
  dismiss(threadId: string): void;
  count: Signal<number>;
}
```

- Subscribes to existing thread RPC, filters to `awaiting | errored`, dedupes by `threadId` (last write wins).
- Sort: errored entries first, then by `updatedAt` descending within each group.
- Notification API integration as a side-effect: `add` + `document.hidden` + permission granted → fire `new Notification(...)` with `tag: threadId` (OS-level dedupe). `notification.onclick` focuses window and routes to `/on-the-go/inbox?focus=threadId`.

### `PausedSessionsStore`

```ts
type PausedSession = {
  threadId: string;
  notification: Notification;
  history: Turn[];
  pendingDraft?: string;
  pausedAt: number;
  pauseReason: "manual" | "idle-timeout";
};

interface PausedSessionsStore {
  list: Signal<PausedSession[]>;
  save(session: PausedSession): Promise<void>;
  restore(threadId: string): Promise<PausedSession>;
  drop(threadId: string): Promise<void>;
}
```

- Persists via existing T3 Code data layer (server-side, encrypted at rest if the underlying store does).
- Keyed by `threadId` — at most one paused session per thread; re-pausing overwrites.

### `OnTheGoFlowOrchestrator`

The state machine. Hand-rolled FSM (no XState — minimal deps).

```ts
type FlowState =
  | "idle"
  | "entering"
  | "summarizing"
  | "conversing"
  | "composing"
  | "countdown"
  | "committing";

interface OnTheGoFlowOrchestrator {
  state: Signal<FlowState>;
  caption: Signal<string>;
  history: Signal<Turn[]>;
  enter(notification: Notification): Promise<void>;
  resume(threadId: string): Promise<void>;
  pause(reason: "manual" | "idle-timeout"): Promise<void>;
  cancel(): Promise<void>;
  shipIt(): Promise<void>;
  cancelShip(): void;
  interruptBot(): void;
}
```

- Holds refs to the configured `VoiceAdapter` and `SummaryAdapter`.
- Each state has a single async function; transitions are explicit.
- Cancellation universal: any state → `idle` via `cancel()` (which calls `voiceAdapter.interrupt()` then resets).
- Skill file (`optimize-prompt.md`) loaded once on construction via Vite import-as-string.

### UI components

Mobile-first variants of shadcn primitives, in `apps/web/src/onTheGo/components/`:

- **`<NotificationCard>`** — Q9 card layout. Wraps shadcn `Card` with mobile-first spacing.
- **`<ThreeButtonBar>`** — Q10 bottom row. Three buttons, accent on center, safe-area inset aware.
- **`<VoiceIndicator>`** — abstract indicator (3-dot pulse for speech, animated ring for listening, spinner for thinking, mic for paused). Pure SVG, no animation library.
- **`<LiveCaptionRibbon>`** — fading caption strip. Latest 1-2 lines, fades after 5s of silence.
- **`<TranscriptDrawer>`** — swipe-up sheet for full transcript history. shadcn `Sheet` underneath.
- **`<CommitCountdown>`** — morphing "Ship it → Cancel (3…2…1)" button.
- **`<OnboardingFlow>`** — first-run flow.
- **`<OnTheGoSettings>`** — settings panel.

All extend zinc / `base-mira` / Lucide. No new design system.

### The `optimize-prompt.md` skill file

~30-80 lines of markdown, treated as the system prompt for the commit-time LLM call. Structure:

1. Role: "you are a prompt-rewriter for a coding agent."
2. Voice / style rules: terse, action-oriented, preserve file paths and identifiers verbatim, no hedging, no preamble.
3. Few-shot examples (2-3 conversation→prompt pairs) showing input transcript and ideal output.
4. Output format: plain prompt text, no surrounding quotes or markdown.

Provider-agnostic. Versioned and reviewable like any other source file.

## Data flow

### Happy path: notification → ship it

1. Existing RPC emits "thread X awaiting." `NotificationsStore.add(notif)` updates the signal.
2. Inbox tab re-renders; new card appears. User taps card.
3. Orchestrator: `enter(notif)` → state `summarizing` → `summaryAdapter.summarize(...)` → TLDR returned.
4. `voiceAdapter.speak(tldr)`; caption ribbon displays. State → `conversing`.
5. Loop: `voiceAdapter.listen()` → user reply → `summaryAdapter.reply({history, userTurn})` → bot reply → `voiceAdapter.speak(reply)`. History grows.
6. User says "ship it" (or taps Ship-it button). `voiceAdapter.interrupt()`. State → `composing`.
7. `summaryAdapter.composePrompt({history, skill})` → optimized prompt text.
8. State → `countdown`. `voiceAdapter.speak("Sending: <prompt> — tap cancel to abort")`. UI shows full prompt text + 3-second countdown button.
9. No cancel within 3s. State → `committing`. `existingRPC.sendUserMessage(threadId, prompt)`. `notificationsStore.dismiss(threadId)`.
10. State → `idle`. Toast "Prompt sent." User returns to Inbox.

### Pause + resume

- Pause from any conversational state: `voiceAdapter.interrupt()`, then `pausedSessionsStore.save({threadId, notification, history, pendingDraft, pausedAt, pauseReason})`. State → `idle`. Card moves Inbox → Paused.
- Resume: tap card in Paused tab. `pausedSessionsStore.restore(threadId)`. `voiceAdapter.speak("Welcome back. Last we said: …")`. History reattached. State → `conversing`. `pausedSessionsStore.drop(threadId)`.
- Invariant: a thread is in **exactly one of** {Inbox, Paused, in-flight} at any time.

### Notification dedupe / update

- Same thread cycling `awaiting → running → awaiting` produces a single entry, last-write-wins.
- If a thread is currently in-flight in on-the-go when a new state arrives, the orchestrator's snapshot is preserved (no live mutation of the active conversation). New state surfaces in Inbox after current session terminates.

### Off-app notification (Q8 option B)

- `NotificationsStore.add(...)` checks `document.hidden` + `Notification.permission`. If both pass, fires `new Notification(...)` with `tag: threadId`. Click handler focuses window + routes to `/on-the-go/inbox?focus=threadId`.

### Full state transition table

| From        | Trigger               | To          | Side effects                                      |
| ----------- | --------------------- | ----------- | ------------------------------------------------- |
| idle        | `enter(notif)`        | entering    | snapshot notif, mark in-flight                    |
| idle        | `resume(threadId)`    | entering    | restore session from `PausedSessionsStore`        |
| entering    | (auto)                | summarizing | `summaryAdapter.summarize()`                      |
| summarizing | summary returned      | conversing  | `voiceAdapter.speak(summary)`, then listen        |
| conversing  | user turn → bot reply | conversing  | update history, `voiceAdapter.speak(reply)`       |
| conversing  | "ship it" or button   | composing   | `voiceAdapter.interrupt()`                        |
| conversing  | "pause" or button     | idle        | `pausedSessionsStore.save(...)`                   |
| conversing  | first idle timeout    | conversing  | TTS "still there?", restart listen                |
| conversing  | second idle timeout   | idle        | auto-pause, save                                  |
| composing   | prompt returned       | countdown   | `voiceAdapter.speak(prompt)` + show + 3s timer    |
| composing   | adapter throws        | countdown   | use envelope-wrapped verbatim transcript fallback |
| countdown   | timer expires         | committing  | send to main thread                               |
| countdown   | cancel                | conversing  | restore listen                                    |
| committing  | RPC ok                | idle        | `dismiss()`, toast                                |
| committing  | RPC fails             | conversing  | toast error, transcript preserved, retry button   |
| any         | `cancel()`            | idle        | `voiceAdapter.interrupt()`, reset                 |

## Error handling

### Voice failures

| Failure                                                         | Response                                                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Mic permission denied                                           | Fall back to text-input mode (transcript drawer always open + text input replaces listen step). Commit phrase requires button tap. |
| STT API unsupported (Firefox, embedded webviews)                | Same text-input fallback. Banner: "Voice input not supported in this browser."                                                     |
| TTS API unsupported                                             | Captions become primary; bot replies render as text only. Indicator stays visible.                                                 |
| Silence detection fails (mic stays "active" >30s without final) | Indicator turns yellow; caption: "Couldn't detect end-of-turn. Tap mic to send."                                                   |
| iOS Safari background-tab eviction                              | Auto-pause via Page Visibility API. Resume offered on return.                                                                      |
| Recognition `onerror` (network, audio-capture, not-allowed)     | Toast with cause + retry. `not-allowed` mid-session = full re-onboard.                                                             |

### `SummaryAdapter` failures

| Failure                                | Response                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Network / timeout                      | Single auto-retry with exponential backoff (200ms, 1s). Then per-state recovery.                        |
| 429 rate limited                       | TTS + caption "Rate limited — try again in N seconds." Conversation pauses; resume on next user prompt. |
| 401/403 invalid key                    | Hard stop. TTS "On-the-go AI is misconfigured. Tap to fix." Routes to Settings. Session auto-paused.    |
| Malformed / empty response             | Treat as offline → trigger envelope-wrapped verbatim fallback.                                          |
| `>15s` timeout for `summarize`/`reply` | Cancel request, treat as network error.                                                                 |

**Per-state recovery for adapter failures:**

- During `summarize`: TTS "Couldn't reach summary AI. Tap to retry." Stays in `summarizing`.
- During `reply`: TTS "Lost connection — say that again?" Failed turn retries on next utterance. Stays in `conversing`.
- During `composePrompt`: **automatic envelope-wrapped verbatim transcript fallback**. Countdown still runs with the transcript as the prompt; cancel still works. Tiny banner: "AI composer offline — sending transcript instead."

The fallback envelope:

```
[On-the-go composer offline — sending raw side-conversation transcript.
The user was drafting their next instruction. Please read the conversation,
synthesize what they want, and proceed.]

You: <user turn 1>
On-the-go assistant: <bot turn 1>
You: <user turn 2>
On-the-go assistant: <bot turn 2>
...
```

The main agent has full thread context already, so it's well-positioned to synthesize. This makes the fallback path arguably more reliable than the happy path, which is a desirable property.

### State machine edge cases

| Edge case                                   | Handling                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser back during voice flow              | Treated as `cancel()`. Confirmation dialog if state is `composing` / `countdown` / `committing`.                                                                                                              |
| Page reloaded mid-session                   | `localStorage` flag set on `enter()`, cleared on terminal states. On reload: banner "You had an unsaved on-the-go session for thread X. Resume?" Best-effort restore from `localStorage`-snapshotted history. |
| Multiple on-the-go tabs                     | `BroadcastChannel`-based tab leadership. First tab to `enter()` thread X claims it; other tabs show "This thread is being handled in another tab." Notifications panel still updates everywhere.              |
| "Ship it" said before any conversation      | Prompt becomes literal `"continue"`. Countdown still runs. Caption shows the literal string.                                                                                                                  |
| Commit phrase accidentally said mid-thought | The 3-second cancel countdown is the safety net. Cancel returns to `conversing` with conversation intact.                                                                                                     |

### RPC / persistence failures

| Failure                             | Handling                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| RPC subscription disconnects        | Existing reconnection UX; notifications panel grays out. New entries blocked until reconnect.           |
| `pausedSessionsStore.save` fails    | Toast "Couldn't save — keeping in memory only." Backed up to `localStorage`, retries every 30s.         |
| `pausedSessionsStore.restore` fails | Toast; manual delete option. No transition into voice flow.                                             |
| Main thread send fails on commit    | Return to `conversing`. Banner "Couldn't deliver. Tap to retry or pause." Notification stays in-flight. |

### Out of scope (deliberately)

- Multi-device coordination on the same thread
- Offline mode beyond "show last known notifications + block voice flow entry"
- Voice quality / mic noise suppression beyond browser defaults

## Testing strategy

### Layer 1: Orchestrator FSM tests (most coverage)

Plain Vitest unit tests with **fake adapters** on both sides — no browser, no network.

```ts
class FakeVoiceAdapter implements VoiceAdapter {
  /* records calls, replays canned responses */
}
class FakeSummaryAdapter implements SummaryAdapter {
  /* configurable replies + failures */
}
```

Test cases (one per row):

- Happy path through all states
- `cancel()` from each non-idle state — voice interrupted, no orphan async
- `pause()` from `conversing` — paused store snapshot
- `resume()` restores history, re-enters conversing
- Idle timeout: first elapse triggers "still there?", second elapses to auto-pause
- `interruptBot()` during TTS calls `voiceAdapter.interrupt()` and re-enters listen
- Commit phrase cancellation during countdown returns to `conversing` with history intact
- `summarize` failure → retry → surface error
- `reply` failure → retry-on-next-turn semantics
- `composePrompt` failure → envelope-wrapped verbatim fallback (assert envelope text + verbatim transcript)
- `enter()` while non-idle → rejection
- Concurrent `pause()` and `cancel()` → cancel wins

Coverage target: **100% branch.** The FSM table doubles as test specification.

### Layer 2: Store tests

Plain Vitest unit tests with mocked RPC and storage.

- `NotificationsStore`: dedupe by `threadId`, sort order (errored first), Notification API side-effects with mocked `document.hidden`
- `PausedSessionsStore`: save/restore round-trip, drop, re-pause overwrite, corrupted entry handling

Coverage target: **100% branch.**

### Layer 3: Adapter tests

- **`BrowserVoiceAdapter`**: `vitest.browser.config.ts` with mocked `SpeechSynthesis` / `webkitSpeechRecognition`. Synthesize timed `onresult` events; assert silence detection fires after 1.5s gap. `interrupt()` idempotency. Page Visibility cancellation.
- **`OpenAIAdapter`, `AnthropicAdapter`**: `vi.fn()` on `fetch`. Correct request shape per method; 401/403 throws `InvalidApiKeyError`; 429 throws `RateLimitError`; network error retries once with backoff; 15s timeout; `composePrompt` includes skill file as system prompt; Anthropic adds `cache_control: {type: "ephemeral"}` on the system prompt block.
- **`MainAgentCliAdapter`**: integration test using existing test fixtures for the CLI path. Marked `slow`, separate test job.

Coverage target: **90% branch** (some network/timing edges hard to hit deterministically).

### Layer 4: Component tests (browser mode)

`vitest-browser` against real DOM. Targeted, not exhaustive.

- `<NotificationCard>` per status; errored has role `alert`; full card is tap target; swipe gestures fire callbacks
- `<ThreeButtonBar>` heights ≥ 64pt; focus order; safe-area insets
- `<VoiceIndicator>` correct visual per prop
- `<LiveCaptionRibbon>` fade behavior with fake timers
- `<CommitCountdown>` morphs Ship/Cancel; countdown fires
- `<OnboardingFlow>` step nav, mocked `getUserMedia`, mocked HTTP for adapter setup

Inline axe-based a11y assertions in component tests.

### Layer 5: End-to-end smoke

One Playwright test against a local T3 Code instance with `VITE_ON_THE_GO_FAKE_ADAPTERS=1`:

1. Pair phone via existing pairing test infra
2. Fake RPC emits "thread X awaiting"
3. Browser sees notification card
4. Tap → enter voice flow (fake adapter, canned responses)
5. "Ship it" → countdown → main thread receives prompt
6. Notification cleared from inbox

### Layer 6: Manual / device verification (release gate)

Not codified; documented as a release gate.

- Real iOS Safari + Android Chrome with real OpenAI/Anthropic keys (small budget caps)
- Noisy environment (music at moderate volume)
- Background-tab (start, switch apps 30s, return → graceful pause)
- Permission revocation mid-session
- Network drop mid-session

## Dependencies

**Existing:**

- T3 Code RPC subscription layer (thread state)
- T3 Code data persistence layer (paused sessions)
- T3 Code pairing flow (phone auth)
- shadcn / Tailwind / Lucide / TanStack Router (existing in `apps/web`)
- Vitest (browser + unit configs already in place)
- `effect-acp`, `effect-codex-app-server` (for `MainAgentCliAdapter`)

**New:**

- No new packages. All work is within `apps/web`.
- No new server endpoints for v1.
- Only new external optional dependency: user-supplied OpenAI or Anthropic API key (configured via Onboarding / Settings).

## Acceptance criteria

- [ ] User can navigate to `/on-the-go` and see a list of completed/awaiting threads as cards.
- [ ] Errored threads sort to top of the Inbox.
- [ ] Tapping a card initiates a voice flow with TTS summary, hands-free conversation loop, and explicit commit gesture.
- [ ] Saying "ship it" (or tapping Ship-it button) triggers a 3-second cancel countdown with both audible and visible preview of the optimized prompt; on expiry, the prompt is delivered to the main thread and the notification is cleared.
- [ ] Saying "cancel" (or tapping Cancel) during countdown returns to conversation with full history intact.
- [ ] Saying "pause" (or tapping Pause) snapshots full session state, moves card to Paused tab. Tapping a Paused card restores conversation with TTS context-restore prompt.
- [ ] Idle timeout (30s + 15s) auto-pauses to Paused tab.
- [ ] All three `SummaryAdapter` impls (OpenAI, Anthropic, MainAgentCli escape hatch) are functional and selectable in Settings.
- [ ] Mic-permission-denied path falls back to text input cleanly.
- [ ] `composePrompt` failure path falls back to envelope-wrapped verbatim transcript.
- [ ] Page reload mid-session offers best-effort recovery from `localStorage`.
- [ ] Browser `Notification` API fires system banners when tab is loaded but hidden.
- [ ] Onboarding runs once on first visit; settings expose all toggles afterwards.
- [ ] All FSM tests (Layer 1) and store tests (Layer 2) pass with 100% branch coverage.
- [ ] One end-to-end happy-path test passes with fake adapters.
- [ ] Manual device verification on iOS Safari + Android Chrome documented and signed off before release.

## Open questions / followups

- v1.1: Web Push for true OS-level notifications when app is closed (deferred; needs PWA + service worker + VAPID).
- v1.1: Cloud `VoiceAdapter` impls (`OpenAIRealtimeVoiceAdapter`, `ElevenLabsTtsWhisperSttAdapter`).
- v1.1: "Sent" history view (recently committed prompts and the agent's response to them — deferred from Q7).
- v1.x: Configurable prompt-style preference (terse vs detailed vs structured) for the optimizer skill file.
- v2: Multi-device session coordination.
