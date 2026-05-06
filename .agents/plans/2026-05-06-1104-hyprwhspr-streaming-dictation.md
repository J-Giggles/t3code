# Streaming local dictation in the thread composer

**Branch:** feat/hyprwhspr-streaming-dictation
**Worktree:** /home/jgigg/code/t3code-hyprwhspr-dictation
**Started:** 2026-05-06T11:04+02:00

## Goal

Add an always-visible microphone button to every thread composer that streams local-machine speech-to-text into the editor in real time, using whisper.cpp on the t3code server. The button must work from any client device (laptop, phone, tablet) that can reach the server, must coexist with manual typing, and must require no third-party cloud APIs.

## Background

The user originally asked for integration with `hyprwhspr` (the Linux-native Whisper dictation daemon, installed locally as `hyprwhspr 1.25.0` running as `hyprwhspr.service`). After investigation, three findings shaped the design:

1. **hyprwhspr's text injection is single-shot, not streaming.** Reading `/usr/lib/hyprwhspr/lib/main.py` and `text_injector.py`, even when configured with a realtime backend (Parakeet ONNX, ElevenLabs, OpenAI Realtime), partial transcripts are accumulated internally (`self._partial_transcript`) and `_inject_text(full_text)` is called only once on stop. There is no path that emits partials into the focused window incrementally.
2. **hyprwhspr's "Parakeet" backend is a FastAPI sidecar that runs `nvidia/parakeet-tdt-0.6b-v3` via NeMo's batch `transcribe([file])` API — also not streaming, requires a heavy NeMo+Torch+optional-CUDA stack, and the model isn't on disk as raw ONNX (NeMo loads it from the HuggingFace cache).
3. **The composer is built on Lexical**, which gives us first-class commands and node mutations — clean streaming insertion is feasible.

So the chosen approach **does not depend on hyprwhspr at runtime**. We build our own browser-→server-→ASR pipeline, with whisper.cpp as the ASR engine. The user can keep hyprwhspr installed for system-wide dictation; the t3code feature is independent.

## Plan

- [x] Define wire protocol schemas in `packages/contracts/dictation.ts` (effect/Schema, JSON tagged-union messages)
- [x] Extend the existing server→client handshake with a `dictation` capability field
- [x] Implement server capability probe (`apps/server/src/dictation/capability.ts`) — locate whisper.cpp binary, verify stream mode support, resolve model path, expose flag in handshake
- [x] Implement `whisperRunner.ts` — child_process lifecycle, Int16 frames to stdin, stateful stdout parser (`\r` partial / `\n` commit), backpressure detection, graceful flush on stop
- [x] Implement `dictationService.ts` — per-WS session state, warm-pool-of-one (30s idle keepalive), thread-switch cancel, stop-reason routing
- [ ] Wire server WS handlers in `wsServer.ts` for `dictation.start | dictation.audioFrame | dictation.stop`
- [ ] Implement `pcmResamplerWorklet.ts` — AudioWorkletProcessor, linear resample to 16 kHz Int16 mono, 50 ms frames (logic factored out for unit-testability without an AudioContext)
- [ ] Implement `audioCapture.ts` — getUserMedia (EC/NS/AGC default-on), AudioContext + worklet, secure-context guard, suspend/resume hygiene (`visibilitychange`, `track.onended`)
- [ ] Implement `dictationStore.ts` — Effect Atom store, state machine `idle | requesting-permission | recording | stopping | error`
- [ ] Implement `dictationCapability.ts` — combine server capability flag with browser checks (`isSecureContext`, `navigator.mediaDevices`)
- [ ] Implement `DictationPlugin.tsx` — Lexical plugin, register `INSERT_DICTATION_PARTIAL_COMMAND` and `COMMIT_DICTATION_COMMAND`, anchor lifecycle (zero-width text node, partial replaces, commit promotes + fresh anchor), `HISTORY_MERGE_TAG` so partials collapse to one undo entry per commit
- [ ] Implement `ComposerDictateButton.tsx` — visual states (idle / requesting-permission / recording / stopping / error / unavailable-secure-context), pulsing red recording state, `preserveComposerFocusOnPointerDown`
- [ ] Mount `DictationPlugin` in `ComposerPromptEditor.tsx`
- [ ] Slot `ComposerDictateButton` into `ComposerPrimaryActions.tsx` before the Send button, always rendered when capability true (not gated on `promptHasText`, not collapsed by `CompactComposerControlsMenu`)
- [ ] Add `Ctrl+Shift+M` keybinding via `apps/web/src/keybindings.ts`
- [ ] Add a read-only `Dictation` status block to settings (capability, model label, binary path) — install instructions link to whisper.cpp docs; no in-app model download in v1
- [ ] Subscribe `ChatComposer` to `dictationStore` events, dispatch Lexical commands accordingly
- [ ] Auto-stop on thread switch (effect inside the existing thread route component)
- [ ] Vite config touch: register the AudioWorklet file as a fingerprinted asset
- [ ] Unit tests (see Testing strategy below)
- [ ] Integration tests (see Testing strategy below)
- [ ] `bun fmt`, `bun lint`, `bun typecheck`, `bun run test` all green

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/web (browser, Lexical composer)                           │
│                                                                 │
│   [🎙 Dictate Button]──onClick──┐                                │
│                                 │                                │
│   getUserMedia → AudioWorklet ──┘                                │
│       │ Float32 @ ctx rate                                      │
│       ▼                                                         │
│   resampler+gain → Int16 PCM @ 16 kHz mono, 50 ms frames         │
│       │                                                         │
│       └──────────► WebSocket: dictation.audioFrame ─────────┐   │
│                                                              │   │
│   Lexical ◄──── dictation.partial / dictation.commit ◄──────┤   │
│   command "insertDictation" appends at anchor                │   │
└──────────────────────────────────────────────────────────────│───┘
                                                               │
┌──────────────────────────────────────────────────────────────▼───┐
│  apps/server (Node, per-WS dictation session)                   │
│                                                                 │
│   wsServer ── routes dictation.* to DictationService            │
│       │                                                         │
│       ▼                                                         │
│   DictationService                                              │
│       ├─ spawns whisper.cpp `stream` child once per session     │
│       ├─ warm-pool-of-one (30 s idle keepalive)                 │
│       ├─ writes Int16 frames to stdin                           │
│       ├─ parses stdout (`[partial] ...`, `[commit] ...`)        │
│       └─ emits dictation.partial / dictation.commit / .error    │
│                                                                 │
│   DictationCapability (boot-time)                               │
│       ├─ probes `whisper-cli`/`whisper-stream` --help           │
│       ├─ resolves model path                                    │
│       └─ exposes capability in handshake                        │
└─────────────────────────────────────────────────────────────────┘
```

**Single dictation session per WebSocket.** Switching threads mid-recording auto-stops. Audio is fire-and-forget (no per-frame ACKs); whisper.cpp's VAD recovers from single-frame drops. Tokens are append-only — partials replace in place, commits append.

## Components

### Server: ASR pipeline

**Subprocess model.** Spawn `whisper-cli --stream` (binary name varies; capability probe figures it out) once per session. Keep the last child idle for ~30 s after `dictation.stop` (warm pool of one) — saves the 1–3 s model load on repeat sessions. Idle past 30 s → kill. No long-lived global child.

**Stdin protocol.** whisper.cpp's stream binary normally reads from a sound device; we bypass with `-c 0` + `-f -` (raw 16 kHz Int16 mono PCM from stdin). Capability probe verifies support and refuses to claim availability if not.

**Stdout parsing.** Line-oriented; matches `[partial]` and `[commit]` prefixes, maps to the corresponding wire events. Unrecognised lines → `[dictation]` log channel, not surfaced to the user.

**Backpressure.** If the child's stdin write buffer stays full > 500 ms, runner emits `dictation.error { code: "backpressure" }` and stops.

**Capability probe (server boot).**
1. `which whisper-cli` (and `whisper-stream`, fallback names).
2. Run `--help`; verify stream mode supported.
3. Resolve a model file: (a) path in `~/.config/t3code/dictation.toml`, (b) `WHISPER_MODEL` env var, (c) common defaults like `~/.cache/whisper/ggml-base.en.bin`.
4. On any failure: capability `{ available: false, reason: "<short string>" }`.

**Files:**
- `apps/server/src/dictation/whisperRunner.ts`
- `apps/server/src/dictation/dictationService.ts`
- `apps/server/src/dictation/capability.ts`
- Edits in `wsServer.ts` (route 3 message kinds), handshake schema

### Browser: audio capture

**Pipeline.**

```
getUserMedia({ audio: { channelCount: 1,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true }})
        │
        ▼
AudioContext (device-native sample rate)
        │
        ▼
AudioWorkletNode "pcm-resampler"
        │ MessageChannel: ArrayBuffer Int16, 16 kHz mono, 50 ms frames
        ▼
DictationStore.send(frame) → WebSocket dictation.audioFrame
```

**Why AudioWorklet, not MediaRecorder.** MediaRecorder gives Opus-in-WebM at the browser's whim — the server would need an Opus decoder, ~100 ms minimum chunking. AudioWorklet runs the resample/quantize on the audio thread (no main-thread jank), lets us control frame size, and yields PCM that whisper.cpp consumes directly. Linear resampler is fine for ASR.

**Permission lifecycle.** First click → browser prompts (click counts as user gesture). Permission denied → button enters `error` state, no further auto-prompts. Granted → MediaStream held only while recording; on stop, `track.stop()` releases the OS mic indicator. Re-acquired on next click without re-prompting.

**HTTPS guard.** Before `getUserMedia`, check `window.isSecureContext`. If false: button shows HTTPS-required state with a tooltip mentioning `tailscale serve`. Fail fast, no opaque permission errors.

**Suspend/resume hygiene.**
- `visibilitychange → hidden` mid-recording → auto-stop.
- WS close mid-recording → server cancels session, kills child stdin write.
- Mic device unplugged → `track.onended` → auto-stop with toast.

**Default DSP.** EC/NS/AGC default-on, no settings toggle in v1 (matches every voice app default). Add a toggle only if a user reports distortion.

**Files:**
- `apps/web/src/dictation/audioCapture.ts`
- `apps/web/src/dictation/pcmResamplerWorklet.ts` (with the resample logic factored into an importable module for tests)
- `apps/web/src/dictation/dictationStore.ts`
- `apps/web/src/dictation/dictationCapability.ts`

### Browser: Lexical composer integration

**Anchor model.** On record start:
1. Capture current Lexical selection; collapse range → focus point; if no selection, anchor at end-of-document.
2. Insert a zero-width "dictation cursor" `TextNode` with a unique key — the **dictation anchor**.
3. Each `dictation.partial` event replaces the anchor node's text content with the partial.
4. Each `dictation.commit` event:
   - Promotes the anchor's text to a normal text node (split out, lose the special key).
   - Creates a fresh zero-width anchor node immediately after.
   - Re-routes subsequent partials to the new anchor.
5. On clean stop: residual partial gets one final commit, anchor discarded.
6. On cancel/error: residual anchor and uncommitted partial are removed; committed text stays.

Mutations use `HISTORY_MERGE_TAG` so partials collapse into one undo entry per commit (not one per partial).

**Typing-while-dictating rule.**
- Outside the active anchor → typing is independent; dictation tokens flow into the anchor regardless.
- Inside the anchor → typing implicitly **commits** the current partial (treats it as final), the keystroke applies after, and a fresh anchor is created at the new cursor for subsequent partials.

This is how desktop dictation systems (Mac dictation, Dragon, Wispr Flow) behave — principle of least surprise.

**Implementation.**
- `DictationPlugin` registers `INSERT_DICTATION_PARTIAL_COMMAND` and `COMMIT_DICTATION_COMMAND` on the Lexical editor.
- A `useEffect` in `ChatComposer.tsx` subscribes to `dictationStore` and dispatches commands as events arrive.
- `ComposerPromptEditor`'s existing imperative handle is the dispatch target.

**Button placement and behavior.**
- `ComposerDictateButton.tsx` lives inside `ComposerPrimaryActions.tsx`, rendered before the Send button.
- Always rendered when capability true. Not gated on `promptHasText`. Not collapsed by `CompactComposerControlsMenu`.
- Uses `preserveComposerFocusOnPointerDown` so clicking it doesn't steal focus.
- States: `idle` | `requesting-permission` | `recording` (red, soft pulse) | `stopping` | `error` | `unavailable-secure-context`.
- Click on empty composer → `editor.focus()` first, then dispatch start.
- Keyboard shortcut: `Ctrl+Shift+M`, configurable via `apps/web/src/keybindings.ts`.

**Files:**
- `apps/web/src/components/composer/DictationPlugin.tsx`
- `apps/web/src/components/chat/ComposerDictateButton.tsx`
- Edits in `ComposerPromptEditor.tsx`, `ComposerPrimaryActions.tsx`, `keybindings.ts`, `CompactComposerControlsMenu.tsx`, `ChatComposer.tsx`

## Wire protocol (`packages/contracts/dictation.ts`)

All schemas via `effect/Schema`, tagged-union `kind` matching the existing WS protocol style.

**Client → Server**
- `DictationStartRequest { kind: "dictation.start", threadId: ThreadId, language: string | null }`
- `DictationAudioFrame { kind: "dictation.audioFrame", pcm: string /* base64 of Int16 LE */, seq: number }`
- `DictationStopRequest { kind: "dictation.stop", reason: "user" | "thread-switch" | "tab-hidden" | "mic-disconnect" }`

**Server → Client**
- `DictationStarted { kind: "dictation.started", sessionId: string, modelLabel: string }`
- `DictationPartial { kind: "dictation.partial", sessionId: string, text: string }` — replaces, doesn't append
- `DictationCommit { kind: "dictation.commit", sessionId: string, text: string }` — appends new committed segment
- `DictationStopped { kind: "dictation.stopped", sessionId: string, reason: "client-stop" | "server-stop" }`
- `DictationError { kind: "dictation.error", sessionId: string | null, code: "spawn-failed" | "model-missing" | "backpressure" | "audio-decode" | "child-crashed" | "permission-denied" | "internal", message: string }`

**Capability flag (in existing handshake)**
- `DictationCapability { available: boolean, reason: string | null, modelLabel: string | null, binaryPath: string | null }`

**Sequencing.** `seq` monotonic from 0 per session. Server tracks last seen; gap → telemetry counter. > 5 % drops in a 1 s window → `dictation.error { code: "audio-decode" }` and stop.

**Why base64 over JSON for v1, not binary WS frames.** Existing protocol is JSON-only; binary frames are a v2 refactor. 50 ms × 16 kHz × Int16 = 1600 bytes raw / ~2200 base64; ~30 s utterance ≈ 4 MB. Trivial on local network, fine on Tailscale.

## Testing strategy

**Unit (vitest, deterministic)**
- `pcmResamplerWorklet` logic — 1 kHz sine at 48 kHz in, assert 16 kHz Int16 out, sample count + amplitude within tolerance. Resample logic factored out so tests run in node without an `AudioContext`.
- `whisperRunner` stdout parser — corpus of `[partial]/[commit]` lines, edge cases (whitespace, ANSI, empty lines, errors).
- `whisperRunner` lifecycle — mock `child_process.spawn`, drive start → frames → exit → idle timer; verify warm-pool-of-one reuses across two consecutive sessions; no leaks.
- `dictationCapability` probe — mock `which`/`access`/`spawn`, hit each branch.
- `dictationStore` state machine — legal transitions OK, illegal transitions throw or no-op.
- `DictationPlugin` Lexical commands — headless Lexical editor, dispatch commands, assert resulting node tree (anchor placement, partial replace, commit promote).

**Integration**
- WS round-trip with a mocked whisper child: client sends `start` + frames + `stop`; mock child emits scripted partials/commits; assert ordering and clean lifecycle.
- Capability false → handshake reports `available: false` → client renders no button.

**Browser smoke (existing pattern)**
- Capability mocked true → dictate button in DOM, correct `aria-label`.
- Capability false → no dictate button.
- Click without a real mic (mock `getUserMedia` reject) → error state with right tooltip.

**Explicitly NOT tested**
- ASR accuracy (whisper.cpp's job).
- Real microphones in CI.
- The Python NeMo stack (no v1 dependency).

**Pass bar.** Per `AGENTS.md`: `bun fmt`, `bun lint`, `bun typecheck`, `bun run test` all green. Use `bun run test` (not `bun test`) — the docs are explicit.

## Acceptance criteria

The feature is complete when **all** of these are demonstrably true:

1. With whisper.cpp + a model on the server, every thread composer renders a microphone button before Send.
2. The button is visible regardless of whether the composer has text typed.
3. Clicking the button (first time) prompts for mic permission. Subsequent clicks toggle recording without re-prompting.
4. While recording, partial text appears in the composer and updates in place as the user speaks; committed segments stay put when the model finalizes them.
5. Stopping recording leaves the dictated text in the composer; nothing auto-sends.
6. Typing while recording works: typing outside the dictation anchor is independent; typing inside it commits the current partial.
7. Switching threads while recording auto-stops the session.
8. With whisper.cpp absent on the server, the dictate button does not render anywhere.
9. With browser context not secure (`http://` over Tailscale), the button shows an HTTPS-required state with an actionable tooltip.
10. `bun fmt`, `bun lint`, `bun typecheck`, `bun run test` all pass.
11. Mic permission is released (OS indicator off) within 1 second of stop.
12. Sustained dictation audio stays under 50 KB/s on the wire (sanity check).

## Notes

### Constraints

- t3code is currently early WIP and Codex-first; the dictation feature must not couple to provider-specific code paths. It should work for any provider session because it operates on the composer, which is provider-agnostic.
- Maintainability priority from `AGENTS.md`: extract shared logic; the resample function and stdout parser should be importable, single-purpose modules — not buried inside React components or service classes.
- Performance/reliability priority from `AGENTS.md`: dictation must degrade gracefully under WS reconnects (active session is dropped, button returns to idle, no zombie child processes).

### Design decisions (locked in during brainstorming)

- ASR engine for v1: whisper.cpp (server-side). Not hyprwhspr/Parakeet/NeMo — see Background.
- Audio transport: base64 PCM in JSON over the existing WS. Binary frames deferred.
- Audio capture: AudioWorklet (not MediaRecorder).
- DSP: EC/NS/AGC default-on, no toggle in v1.
- Streaming UX: anchor-based, partial-replaces / commit-promotes-and-resets-anchor.
- Typing-inside-anchor: implicit commit, fresh anchor at the new cursor.
- Stop behavior: leave text in composer, do not auto-send.
- Keyboard shortcut: `Ctrl+Shift+M`, configurable.
- Keepalive: warm pool of one whisper.cpp child, 30 s idle timeout.
- Model install: manual in v1; settings page is read-only status.

### Open questions / assumptions to verify during implementation

- Exact `whisper.cpp` binary name and stream-mode flag set on Arch / common distros — capability probe must handle both `whisper-cli` and `whisper-stream` (and `main` from upstream builds, if encountered).
- Whether the existing handshake schema has a single `capabilities` object or a flat structure — adapt the dictation flag accordingly.
- Whether the existing keybinding system already handles per-thread keybindings or only global; `Ctrl+Shift+M` should be global.

## Deferred (v2+ tickets, NOT implemented in v1)

- Browser-side WASM ASR fallback (`@xenova/transformers` whisper-tiny.en) for clients hitting servers without whisper.cpp installed.
- Binary WebSocket frames for audio (~30 % bandwidth, modest CPU saving).
- Auto-download / install flow for whisper.cpp model files from the settings UI.
- NeMo Parakeet streaming as an alternate ASR provider (potentially reusing hyprwhspr's venv if installed).
- Push-to-talk (hold to record) in addition to click-toggle.
- Multi-language hints / language picker.
- Per-thread dictation transcripts saved as a separate artifact.
- Voice-activated wake (server-initiated `dictation.start`).
