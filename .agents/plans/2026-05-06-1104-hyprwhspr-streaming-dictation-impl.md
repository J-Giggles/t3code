# Streaming Dictation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Companion to:** `.agents/plans/2026-05-06-1104-hyprwhspr-streaming-dictation.md` (the spec / contract). The spec is normative on architecture, components, and acceptance. This file is the granular handbook.

**Branch:** `feat/hyprwhspr-streaming-dictation`
**Worktree:** `/home/jgigg/code/t3code-hyprwhspr-dictation`

**Goal:** Add an always-visible microphone button to the thread composer that streams local-machine speech-to-text into the Lexical editor in real time, using whisper.cpp on the server.

**Architecture:** Browser captures audio via `getUserMedia` + an AudioWorklet that resamples to 16 kHz Int16 PCM in 50 ms frames. Frames stream over the existing WebSocket as fire-and-forget RPCs. Server spawns `whisper.cpp` in stream mode, pipes Int16 stdin, parses `[partial]`/`[commit]` stdout, and pushes events back through a streaming subscription. Composer integrates via a Lexical plugin with an "anchor" node — partials replace, commits promote and reset.

**Tech Stack:** Effect Rpc (server + client), Effect Schema (contracts), Effect Atom (web state), Lexical (composer), Vitest (tests), AudioWorklet + Web Audio API (capture), `child_process.spawn` (whisper.cpp), Vite (web bundler), Bun (dev/test runner).

---

## Pre-flight: deviations from the spec

The spec was written before reading the actual codebase. Two structural translations are required. **Get sign-off on these before executing Task 1.**

1. **Wire protocol uses Effect Rpc, not custom tagged-union JSON.** The existing WS layer (`apps/server/src/ws.ts`, `packages/contracts/src/rpc.ts`) is an Effect `RpcGroup` of named RPCs with `payload` / `success` / `error` / `stream: true`. The spec's "tagged-union messages" map to:
   - `WsDictationStartRpc` (request → response: sessionId + modelLabel)
   - `WsDictationAudioFrameRpc` (request → no body, error on backpressure; one RPC call per 50 ms frame)
   - `WsDictationStopRpc` (request → response)
   - `WsSubscribeDictationRpc` (streaming subscription; emits `started` | `partial` | `commit` | `stopped` | `error` events as a tagged union — the tagged union *does* survive, but as the streaming payload, not as the top-level message envelope)
   - Capability flag added as a top-level field on `ServerConfig` (existing handshake — answers spec open-question about flat vs nested capabilities).

2. **Server entrypoint is `apps/server/src/ws.ts`, not `wsServer.ts`.** All spec references to `wsServer.ts` apply to `ws.ts`.

3. **No existing `apps/web/src/dictation/` or `apps/server/src/dictation/` directories.** Both will be created.

4. **Keybinding goes through the existing contracts-driven keybinding system.** Add `dictation.toggle` to `STATIC_KEYBINDING_COMMANDS` in `packages/contracts/src/keybindings.ts`, then a default binding for `Ctrl+Shift+M` in the shared default keybindings.

If the user accepts these deviations, the rest of the plan proceeds as written.

---

## File map (what gets created vs modified)

**Created (server):**
- `apps/server/src/dictation/capability.ts` — boot-time probe (binary path, model path, stream-mode support)
- `apps/server/src/dictation/capability.test.ts`
- `apps/server/src/dictation/whisperRunner.ts` — child process lifecycle, stdin frames, stdout parsing
- `apps/server/src/dictation/whisperRunner.test.ts`
- `apps/server/src/dictation/whisperStdoutParser.ts` — pure function, line → event
- `apps/server/src/dictation/whisperStdoutParser.test.ts`
- `apps/server/src/dictation/dictationService.ts` — per-WS session state, warm pool of one
- `apps/server/src/dictation/dictationService.test.ts`

**Created (contracts):**
- `packages/contracts/src/dictation.ts` — schemas, RPC definitions, capability struct

**Created (web):**
- `apps/web/src/dictation/pcmResampler.ts` — pure resample function (testable without AudioContext)
- `apps/web/src/dictation/pcmResampler.test.ts`
- `apps/web/src/dictation/pcmResamplerWorklet.ts` — AudioWorkletProcessor wrapping the pure function
- `apps/web/src/dictation/audioCapture.ts` — getUserMedia + AudioContext + worklet wiring
- `apps/web/src/dictation/dictationCapability.ts` — combines server flag + browser checks
- `apps/web/src/dictation/dictationCapability.test.ts`
- `apps/web/src/dictation/dictationStore.ts` — Effect Atom store, state machine
- `apps/web/src/dictation/dictationStore.test.ts`
- `apps/web/src/components/composer/DictationPlugin.tsx` — Lexical plugin (anchor model + commands)
- `apps/web/src/components/composer/DictationPlugin.test.tsx`
- `apps/web/src/components/chat/ComposerDictateButton.tsx`
- `apps/web/src/components/chat/ComposerDictateButton.test.tsx`

**Modified:**
- `packages/contracts/src/server.ts` — add `dictation: DictationCapability` to `ServerConfig`
- `packages/contracts/src/rpc.ts` — add the 4 dictation RPCs to `WS_METHODS` and `WsRpcGroup`
- `packages/contracts/src/keybindings.ts` — add `dictation.toggle` to `STATIC_KEYBINDING_COMMANDS`
- `packages/shared/src/keybindings/<defaults file>` — add default `Ctrl+Shift+M` for `dictation.toggle`
- `packages/contracts/src/index.ts` — re-export new dictation symbols
- `apps/server/src/ws.ts` — register the 4 dictation handlers, integrate capability into config load
- `apps/server/src/serverRuntimeStartup.ts` (if capability is probed at boot) — wire up
- `apps/web/src/rpc/wsRpcClient.ts` — add typed methods for the 4 RPCs
- `apps/web/src/rpc/serverState.ts` — expose dictation capability selector
- `apps/web/src/components/ComposerPromptEditor.tsx` — mount `DictationPlugin`
- `apps/web/src/components/chat/ChatComposer.tsx` — slot dictate button, subscribe to store, dispatch Lexical commands, auto-stop on thread switch
- `apps/web/src/components/chat/ComposerPrimaryActions.tsx` — accept a `dictateButton?: ReactNode` slot prop *or* let ChatComposer render dictate button as sibling (decide in Task 9)
- `apps/web/src/components/chat/CompactComposerControlsMenu.tsx` — verify dictate button is *not* collapsed
- `apps/web/src/keybindings.ts` — extend matcher to handle `dictation.toggle`
- `apps/web/vite.config.ts` — register `pcmResamplerWorklet.ts` as a fingerprinted worklet asset
- `apps/web/src/components/settings/<settings page>` — read-only Dictation status block (exact file located by Task 14.1's `grep` command)
- `.agents/plans/2026-05-06-1104-hyprwhspr-streaming-dictation.md` — tick `[ ]` → `[x]` as steps land

---

## Conventions used in every task

- **Test framework:** Vitest. Run individual tests with `bun run test <path-pattern>`. NEVER `bun test`.
- **Formatter / linter / typechecker:** `bun fmt`, `bun lint`, `bun typecheck`. All must be green at every commit.
- **Commit cadence:** one commit per task (or one per coherent sub-step if the task is large). Tick the matching checkbox in the spec's `## Plan` section in the same commit.
- **Test before implementation.** TDD: failing test → minimal impl → green → refactor → commit.
- **Schema first.** When adding a new contract, write the Schema, then a roundtrip decode/encode test, then any consumer.
- **No barrel-index pollution.** `packages/shared` uses subpath exports; do not add to a barrel `index.ts`.

---

## Task 1: Wire protocol contracts (`packages/contracts/src/dictation.ts`)

Defines the schemas and RPCs. Foundation for everything else.

**Files:**
- Create: `packages/contracts/src/dictation.ts`
- Create: `packages/contracts/src/dictation.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/server.ts`
- Modify: `packages/contracts/src/rpc.ts`

- [ ] **Step 1.1: Write the failing schema roundtrip test**

Create `packages/contracts/src/dictation.test.ts`:

```ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  DictationAudioFrameInput,
  DictationCapability,
  DictationStartInput,
  DictationStartResult,
  DictationStopInput,
  DictationStreamEvent,
} from "./dictation.ts";

describe("dictation schemas", () => {
  it("roundtrips DictationStartInput", () => {
    const decoded = Schema.decodeUnknownSync(DictationStartInput)({
      threadId: "thread_abc123",
      language: null,
    });
    expect(decoded.threadId).toBe("thread_abc123");
    expect(decoded.language).toBeNull();
  });

  it("roundtrips DictationAudioFrameInput with base64 PCM", () => {
    const decoded = Schema.decodeUnknownSync(DictationAudioFrameInput)({
      sessionId: "sess_1",
      seq: 0,
      pcm: "AAAA",
    });
    expect(decoded.seq).toBe(0);
  });

  it("roundtrips DictationStreamEvent partial", () => {
    const decoded = Schema.decodeUnknownSync(DictationStreamEvent)({
      type: "partial",
      sessionId: "sess_1",
      text: "hello",
    });
    expect(decoded.type).toBe("partial");
  });

  it("roundtrips DictationStreamEvent commit", () => {
    const decoded = Schema.decodeUnknownSync(DictationStreamEvent)({
      type: "commit",
      sessionId: "sess_1",
      text: "hello world.",
    });
    expect(decoded.type).toBe("commit");
  });

  it("DictationCapability available defaults", () => {
    const decoded = Schema.decodeUnknownSync(DictationCapability)({
      available: true,
      reason: null,
      modelLabel: "ggml-base.en",
      binaryPath: "/usr/bin/whisper-cli",
    });
    expect(decoded.available).toBe(true);
  });

  it("DictationStopInput accepts reason union", () => {
    const reasons = ["user", "thread-switch", "tab-hidden", "mic-disconnect"] as const;
    for (const reason of reasons) {
      const decoded = Schema.decodeUnknownSync(DictationStopInput)({
        sessionId: "sess_1",
        reason,
      });
      expect(decoded.reason).toBe(reason);
    }
  });

  it("DictationStartResult exposes sessionId and modelLabel", () => {
    const decoded = Schema.decodeUnknownSync(DictationStartResult)({
      sessionId: "sess_1",
      modelLabel: "ggml-base.en",
    });
    expect(decoded.sessionId).toBe("sess_1");
  });
});
```

- [ ] **Step 1.2: Run test, verify FAIL**

```
bun run test packages/contracts/src/dictation.test.ts
```

Expected: FAIL — `Cannot find module './dictation.ts'`.

- [ ] **Step 1.3: Implement the schemas**

Create `packages/contracts/src/dictation.ts`:

```ts
import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

const DictationSessionId = TrimmedNonEmptyString;
export type DictationSessionId = typeof DictationSessionId.Type;

const Base64Pcm = Schema.String.check(Schema.isMaxLength(8192));

export const DictationCapability = Schema.Struct({
  available: Schema.Boolean,
  reason: Schema.NullOr(TrimmedNonEmptyString),
  modelLabel: Schema.NullOr(TrimmedNonEmptyString),
  binaryPath: Schema.NullOr(TrimmedNonEmptyString),
});
export type DictationCapability = typeof DictationCapability.Type;

export const DictationStartInput = Schema.Struct({
  threadId: ThreadId,
  language: Schema.NullOr(TrimmedNonEmptyString),
});
export type DictationStartInput = typeof DictationStartInput.Type;

export const DictationStartResult = Schema.Struct({
  sessionId: DictationSessionId,
  modelLabel: TrimmedNonEmptyString,
});
export type DictationStartResult = typeof DictationStartResult.Type;

export const DictationAudioFrameInput = Schema.Struct({
  sessionId: DictationSessionId,
  seq: NonNegativeInt,
  pcm: Base64Pcm,
});
export type DictationAudioFrameInput = typeof DictationAudioFrameInput.Type;

const DictationStopReason = Schema.Literals([
  "user",
  "thread-switch",
  "tab-hidden",
  "mic-disconnect",
]);
export type DictationStopReason = typeof DictationStopReason.Type;

export const DictationStopInput = Schema.Struct({
  sessionId: DictationSessionId,
  reason: DictationStopReason,
});
export type DictationStopInput = typeof DictationStopInput.Type;

export const DictationErrorCode = Schema.Literals([
  "spawn-failed",
  "model-missing",
  "backpressure",
  "audio-decode",
  "child-crashed",
  "permission-denied",
  "internal",
]);
export type DictationErrorCode = typeof DictationErrorCode.Type;

export const DictationError = Schema.Struct({
  _tag: Schema.Literal("DictationError"),
  code: DictationErrorCode,
  message: TrimmedNonEmptyString,
  sessionId: Schema.NullOr(DictationSessionId),
});
export type DictationError = typeof DictationError.Type;

const DictationEventStarted = Schema.Struct({
  type: Schema.Literal("started"),
  sessionId: DictationSessionId,
  modelLabel: TrimmedNonEmptyString,
});
const DictationEventPartial = Schema.Struct({
  type: Schema.Literal("partial"),
  sessionId: DictationSessionId,
  text: Schema.String,
});
const DictationEventCommit = Schema.Struct({
  type: Schema.Literal("commit"),
  sessionId: DictationSessionId,
  text: Schema.String,
});
const DictationEventStopped = Schema.Struct({
  type: Schema.Literal("stopped"),
  sessionId: DictationSessionId,
  reason: Schema.Literals(["client-stop", "server-stop"]),
});
const DictationEventError = Schema.Struct({
  type: Schema.Literal("error"),
  sessionId: Schema.NullOr(DictationSessionId),
  code: DictationErrorCode,
  message: TrimmedNonEmptyString,
});

export const DictationStreamEvent = Schema.Union([
  DictationEventStarted,
  DictationEventPartial,
  DictationEventCommit,
  DictationEventStopped,
  DictationEventError,
]);
export type DictationStreamEvent = typeof DictationStreamEvent.Type;

export const DICTATION_WS_METHODS = {
  start: "dictation.start",
  audioFrame: "dictation.audioFrame",
  stop: "dictation.stop",
  subscribe: "subscribeDictation",
} as const;

export const WsDictationStartRpc = Rpc.make(DICTATION_WS_METHODS.start, {
  payload: DictationStartInput,
  success: DictationStartResult,
  error: DictationError,
});

export const WsDictationAudioFrameRpc = Rpc.make(DICTATION_WS_METHODS.audioFrame, {
  payload: DictationAudioFrameInput,
  error: DictationError,
});

export const WsDictationStopRpc = Rpc.make(DICTATION_WS_METHODS.stop, {
  payload: DictationStopInput,
  error: DictationError,
});

export const WsSubscribeDictationRpc = Rpc.make(DICTATION_WS_METHODS.subscribe, {
  payload: Schema.Struct({}),
  success: DictationStreamEvent,
  stream: true,
});
```

- [ ] **Step 1.4: Run test, verify PASS**

```
bun run test packages/contracts/src/dictation.test.ts
```

Expected: PASS, 7/7.

- [ ] **Step 1.5: Wire schemas into ServerConfig and RpcGroup**

In `packages/contracts/src/server.ts`, add an import and a field:

```ts
import { DictationCapability } from "./dictation.ts";
```

In `ServerConfig` struct, add:

```ts
  dictation: DictationCapability,
```

In `packages/contracts/src/rpc.ts`, add imports:

```ts
import {
  DICTATION_WS_METHODS,
  WsDictationAudioFrameRpc,
  WsDictationStartRpc,
  WsDictationStopRpc,
  WsSubscribeDictationRpc,
} from "./dictation.ts";
```

Spread into `WS_METHODS`:

```ts
  // Dictation methods
  dictationStart: DICTATION_WS_METHODS.start,
  dictationAudioFrame: DICTATION_WS_METHODS.audioFrame,
  dictationStop: DICTATION_WS_METHODS.stop,
  subscribeDictation: DICTATION_WS_METHODS.subscribe,
```

Append the four RPCs to `WsRpcGroup.make(...)` arguments.

In `packages/contracts/src/index.ts`, re-export the new symbols (follow the existing export pattern in that file).

- [ ] **Step 1.6: Run typecheck and full test suite**

```
bun typecheck
bun run test packages/contracts
```

Expected: typecheck PASS. **All existing producers of `ServerConfig` will fail typecheck** because they don't yet construct the new `dictation` field. That's the intended TDD signal for Task 2 — leave the typecheck red and commit only the contracts changes for now.

Actually — to keep main green at every commit, in this commit also add a temporary `dictation: { available: false, reason: "not-yet-probed", modelLabel: null, binaryPath: null }` literal at every `ServerConfig` construction site. List of sites: run

```
grep -rn "ServerConfig" packages/contracts/src apps/server/src apps/web/src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -v "ServerConfigStream\|ServerConfigIssue\|ServerConfigUpdated\|ServerConfigKeybindings\|ServerConfigProviderStatuses\|ServerConfigSettings"
```

Patch each one. Verify typecheck PASS.

- [ ] **Step 1.7: Commit**

```bash
git add packages/contracts/src/dictation.ts \
        packages/contracts/src/dictation.test.ts \
        packages/contracts/src/server.ts \
        packages/contracts/src/rpc.ts \
        packages/contracts/src/index.ts \
        apps/server/src apps/web/src
git commit -m "feat(contracts): add dictation wire protocol and capability"
```

In the same commit, tick the spec's `## Plan` checkbox: `[x] Define wire protocol schemas in packages/contracts/dictation.ts (effect/Schema, JSON tagged-union messages)`.

---

## Task 2: Server capability probe (`apps/server/src/dictation/capability.ts`)

Locates the whisper.cpp binary, checks it supports stream mode + stdin PCM, resolves a model file path. Returns a `DictationCapability` value.

**Files:**
- Create: `apps/server/src/dictation/capability.ts`
- Create: `apps/server/src/dictation/capability.test.ts`

- [ ] **Step 2.1: Write the failing tests**

Create `apps/server/src/dictation/capability.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { probeDictationCapability } from "./capability.ts";

const okHelp = `usage: whisper-cli [options]
  -f FNAME, --file FNAME       input WAV file (use - for stdin)
  -c ID,    --capture ID       capture device id (-c 0 for stdin)
  --stream                     stream mode
`;

const noStreamHelp = `usage: whisper-cli [options]\n  -f FNAME\n`;

function makeIo(opts: {
  whichResolves: { binary: string; path: string | null }[];
  helpOutput: Record<string, string>;
  modelExists: Record<string, boolean>;
  envModel?: string | null;
  configModel?: string | null;
}) {
  return {
    which: vi.fn(async (binary: string) =>
      opts.whichResolves.find((entry) => entry.binary === binary)?.path ?? null,
    ),
    spawnHelp: vi.fn(async (path: string) => opts.helpOutput[path] ?? ""),
    fileExists: vi.fn(async (path: string) => Boolean(opts.modelExists[path])),
    readEnv: vi.fn(() => opts.envModel ?? null),
    readConfigModel: vi.fn(async () => opts.configModel ?? null),
    homeDir: () => "/home/user",
  };
}

describe("probeDictationCapability", () => {
  it("returns available when whisper-cli supports stream mode and a model is found via env", async () => {
    const io = makeIo({
      whichResolves: [{ binary: "whisper-cli", path: "/usr/bin/whisper-cli" }],
      helpOutput: { "/usr/bin/whisper-cli": okHelp },
      modelExists: { "/path/to/ggml-base.en.bin": true },
      envModel: "/path/to/ggml-base.en.bin",
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(true);
    expect(result.binaryPath).toBe("/usr/bin/whisper-cli");
    expect(result.modelLabel).toBe("ggml-base.en");
  });

  it("falls back to whisper-stream when whisper-cli is not found", async () => {
    const io = makeIo({
      whichResolves: [
        { binary: "whisper-cli", path: null },
        { binary: "whisper-stream", path: "/usr/local/bin/whisper-stream" },
      ],
      helpOutput: { "/usr/local/bin/whisper-stream": okHelp },
      modelExists: { "/home/user/.cache/whisper/ggml-base.en.bin": true },
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(true);
    expect(result.binaryPath).toBe("/usr/local/bin/whisper-stream");
  });

  it("reports unavailable when no binary is found", async () => {
    const io = makeIo({
      whichResolves: [
        { binary: "whisper-cli", path: null },
        { binary: "whisper-stream", path: null },
        { binary: "main", path: null },
      ],
      helpOutput: {},
      modelExists: {},
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/binary/i);
  });

  it("reports unavailable when binary lacks stream-mode support", async () => {
    const io = makeIo({
      whichResolves: [{ binary: "whisper-cli", path: "/usr/bin/whisper-cli" }],
      helpOutput: { "/usr/bin/whisper-cli": noStreamHelp },
      modelExists: {},
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/stream/i);
  });

  it("reports unavailable when no model file is resolvable", async () => {
    const io = makeIo({
      whichResolves: [{ binary: "whisper-cli", path: "/usr/bin/whisper-cli" }],
      helpOutput: { "/usr/bin/whisper-cli": okHelp },
      modelExists: {},
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/model/i);
  });
});
```

- [ ] **Step 2.2: Run test, verify FAIL**

```
bun run test apps/server/src/dictation/capability.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 2.3: Implement `capability.ts`**

Create `apps/server/src/dictation/capability.ts`:

```ts
import * as path from "node:path";
import type { DictationCapability } from "@t3tools/contracts";

export interface CapabilityProbeIo {
  which(binary: string): Promise<string | null>;
  spawnHelp(path: string): Promise<string>;
  fileExists(path: string): Promise<boolean>;
  readEnv(): string | null;
  readConfigModel(): Promise<string | null>;
  homeDir(): string;
}

const CANDIDATE_BINARIES = ["whisper-cli", "whisper-stream", "main"] as const;

const STREAM_MODE_MARKERS = [/--stream/i, /\bcapture\b.*stdin/i, /\bstdin\b/i];

function modelLabel(absPath: string): string {
  const base = path.basename(absPath);
  return base.replace(/\.bin$/i, "");
}

async function resolveBinary(
  io: CapabilityProbeIo,
): Promise<{ path: string; help: string } | null> {
  for (const binary of CANDIDATE_BINARIES) {
    const found = await io.which(binary);
    if (!found) continue;
    const help = await io.spawnHelp(found);
    if (STREAM_MODE_MARKERS.some((re) => re.test(help))) {
      return { path: found, help };
    }
  }
  return null;
}

async function resolveModelPath(io: CapabilityProbeIo): Promise<string | null> {
  const fromConfig = await io.readConfigModel();
  if (fromConfig && (await io.fileExists(fromConfig))) return fromConfig;

  const fromEnv = io.readEnv();
  if (fromEnv && (await io.fileExists(fromEnv))) return fromEnv;

  const home = io.homeDir();
  const defaults = [
    path.join(home, ".cache", "whisper", "ggml-base.en.bin"),
    path.join(home, ".cache", "whisper", "ggml-small.en.bin"),
    path.join(home, ".cache", "whisper", "ggml-tiny.en.bin"),
  ];
  for (const candidate of defaults) {
    if (await io.fileExists(candidate)) return candidate;
  }
  return null;
}

export async function probeDictationCapability(
  io: CapabilityProbeIo,
): Promise<DictationCapability> {
  const binary = await resolveBinary(io);
  if (!binary) {
    return {
      available: false,
      reason: "whisper.cpp binary not found (looked for whisper-cli, whisper-stream, main)",
      modelLabel: null,
      binaryPath: null,
    };
  }

  const model = await resolveModelPath(io);
  if (!model) {
    return {
      available: false,
      reason: "whisper model file not found (set WHISPER_MODEL env or ~/.cache/whisper/ggml-*.bin)",
      modelLabel: null,
      binaryPath: binary.path,
    };
  }

  return {
    available: true,
    reason: null,
    modelLabel: modelLabel(model),
    binaryPath: binary.path,
  };
}
```

- [ ] **Step 2.4: Run test, verify PASS**

```
bun run test apps/server/src/dictation/capability.test.ts
```

Expected: PASS, 5/5.

- [ ] **Step 2.5: Wire probe into server boot**

Find where `ServerConfig` is constructed (search `loadServerConfig` in `apps/server/src/`). Add a `probeDictationCapability(...)` call with a real IO adapter (using `node:fs/promises.access`, `child_process.spawn(binary, ['--help'])`, `which`, `os.homedir()`, `process.env.WHISPER_MODEL`). Replace the placeholder `dictation` literal from Task 1.7 with the probe result.

The IO adapter is a plain object literal at the call site — no need for Effect Layer plumbing because the probe runs once at boot.

```ts
// In whichever module produces the ServerConfig (likely server.ts or serverRuntimeStartup.ts):
import { probeDictationCapability } from "./dictation/capability.ts";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import { spawn } from "node:child_process";

async function which(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("which", [binary], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.on("close", (code) => resolve(code === 0 ? out.trim() || null : null));
    child.on("error", () => resolve(null));
  });
}

async function spawnHelp(binPath: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(binPath, ["--help"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.stderr.on("data", (chunk) => (out += String(chunk)));
    child.on("close", () => resolve(out));
    child.on("error", () => resolve(""));
  });
}

const dictation = await probeDictationCapability({
  which,
  spawnHelp,
  fileExists: async (p) => {
    try { await fsp.access(p); return true; } catch { return false; }
  },
  readEnv: () => process.env.WHISPER_MODEL ?? null,
  readConfigModel: async () => null, // T-config integration in Task 13
  homeDir: () => os.homedir(),
});
```

- [ ] **Step 2.6: Verify typecheck + tests still pass**

```
bun typecheck
bun run test apps/server
```

- [ ] **Step 2.7: Commit**

```bash
git add apps/server/src/dictation/capability.ts \
        apps/server/src/dictation/capability.test.ts \
        apps/server/src/server.ts # or whichever boot module changed
git commit -m "feat(server): probe whisper.cpp dictation capability at boot"
```

Tick spec checkbox: `[x] Implement server capability probe (apps/server/src/dictation/capability.ts) ...`.

---

## Task 3: Whisper stdout parser (`apps/server/src/dictation/whisperStdoutParser.ts`)

Pure function. Takes a single stdout line, returns a parsed event or `null` for unrecognized lines. Factored out so the runner test doesn't need to mock parsing.

**Files:**
- Create: `apps/server/src/dictation/whisperStdoutParser.ts`
- Create: `apps/server/src/dictation/whisperStdoutParser.test.ts`

- [ ] **Step 3.1: Write the failing test**

```ts
// apps/server/src/dictation/whisperStdoutParser.test.ts
import { describe, expect, it } from "vitest";
import { parseWhisperStdoutLine } from "./whisperStdoutParser.ts";

describe("parseWhisperStdoutLine", () => {
  it("parses partial events", () => {
    expect(parseWhisperStdoutLine("[partial] hello world")).toEqual({
      kind: "partial",
      text: "hello world",
    });
  });

  it("parses commit events", () => {
    expect(parseWhisperStdoutLine("[commit] hello world.")).toEqual({
      kind: "commit",
      text: "hello world.",
    });
  });

  it("trims trailing whitespace and ANSI escapes from text", () => {
    expect(parseWhisperStdoutLine("[partial] [2K[1G hello [0m  ")).toEqual({
      kind: "partial",
      text: "hello",
    });
  });

  it("returns null for empty lines", () => {
    expect(parseWhisperStdoutLine("")).toBeNull();
    expect(parseWhisperStdoutLine("   ")).toBeNull();
  });

  it("returns null for unrecognized lines (logged separately)", () => {
    expect(parseWhisperStdoutLine("loading model...")).toBeNull();
    expect(parseWhisperStdoutLine("whisper_init: loaded ggml-base.en.bin")).toBeNull();
  });

  it("treats whitespace-only payload as empty text (still emitted)", () => {
    expect(parseWhisperStdoutLine("[partial]   ")).toEqual({ kind: "partial", text: "" });
  });
});
```

- [ ] **Step 3.2: Run, verify FAIL**

```
bun run test apps/server/src/dictation/whisperStdoutParser.test.ts
```

- [ ] **Step 3.3: Implement parser**

```ts
// apps/server/src/dictation/whisperStdoutParser.ts
export type WhisperStdoutEvent =
  | { kind: "partial"; text: string }
  | { kind: "commit"; text: string };

const ANSI_ESCAPE_RE = /\[[0-9;]*[a-zA-Z]/g;

function clean(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "").trim();
}

export function parseWhisperStdoutLine(line: string): WhisperStdoutEvent | null {
  if (line.trim().length === 0) return null;

  if (line.startsWith("[partial]")) {
    return { kind: "partial", text: clean(line.slice("[partial]".length)) };
  }
  if (line.startsWith("[commit]")) {
    return { kind: "commit", text: clean(line.slice("[commit]".length)) };
  }
  return null;
}
```

- [ ] **Step 3.4: Run, verify PASS**

- [ ] **Step 3.5: Commit**

```bash
git add apps/server/src/dictation/whisperStdoutParser.ts \
        apps/server/src/dictation/whisperStdoutParser.test.ts
git commit -m "feat(server): add whisper.cpp stdout parser"
```

---

## Task 4: Whisper runner (`apps/server/src/dictation/whisperRunner.ts`)

Spawns the child process, writes Int16 PCM frames to stdin, parses stdout (using Task 3's parser), enforces backpressure timeout, surfaces events via callbacks. Lifecycle: `start` → `writeFrame*` → `stop` (graceful) or `kill` (cancel).

**Files:**
- Create: `apps/server/src/dictation/whisperRunner.ts`
- Create: `apps/server/src/dictation/whisperRunner.test.ts`

- [ ] **Step 4.1: Write the failing test**

```ts
// apps/server/src/dictation/whisperRunner.test.ts
import { EventEmitter } from "node:events";
import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { startWhisperRunner, type WhisperRunner } from "./whisperRunner.ts";

class FakeStdin extends Writable {
  public chunks: Buffer[] = [];
  public allowWrite = true;
  _write(chunk: Buffer, _enc: string, cb: (err?: Error | null) => void) {
    this.chunks.push(Buffer.from(chunk));
    if (this.allowWrite) cb();
    // when not allowed, intentionally drop the callback to simulate backpressure
  }
}

interface FakeChild extends EventEmitter {
  stdin: FakeStdin;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdin = new FakeStdin();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function pcmFrame(): Buffer {
  return Buffer.alloc(800 * 2); // 50 ms at 16 kHz Int16
}

describe("startWhisperRunner", () => {
  it("emits partial events parsed from stdout", async () => {
    const child = makeFakeChild();
    const events: unknown[] = [];
    const runner = startWhisperRunner({
      spawn: () => child as never,
      binary: "/x",
      modelPath: "/m",
      onEvent: (e) => events.push(e),
      backpressureTimeoutMs: 500,
      idleTimeoutMs: 30_000,
      now: () => Date.now(),
    });
    child.stdout.emit("data", Buffer.from("[partial] hello\n"));
    expect(events).toEqual([{ kind: "partial", text: "hello" }]);
    runner.kill();
  });

  it("forwards Int16 frames to child stdin", async () => {
    const child = makeFakeChild();
    const runner = startWhisperRunner({
      spawn: () => child as never,
      binary: "/x",
      modelPath: "/m",
      onEvent: () => {},
      backpressureTimeoutMs: 500,
      idleTimeoutMs: 30_000,
      now: () => Date.now(),
    });
    runner.writeFrame(pcmFrame());
    expect(child.stdin.chunks.length).toBe(1);
    expect(child.stdin.chunks[0]?.length).toBe(1600);
    runner.kill();
  });

  it("emits backpressure error when stdin stalls past timeout", async () => {
    vi.useFakeTimers();
    try {
      const child = makeFakeChild();
      child.stdin.allowWrite = false;
      const events: unknown[] = [];
      const runner = startWhisperRunner({
        spawn: () => child as never,
        binary: "/x",
        modelPath: "/m",
        onEvent: (e) => events.push(e),
        backpressureTimeoutMs: 500,
        idleTimeoutMs: 30_000,
        now: () => Date.now(),
      });
      runner.writeFrame(pcmFrame());
      vi.advanceTimersByTime(501);
      expect(events.some((e: any) => e.kind === "error" && e.code === "backpressure")).toBe(true);
      runner.kill();
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits child-crashed when stdout EOF before stop", async () => {
    const child = makeFakeChild();
    const events: unknown[] = [];
    const runner = startWhisperRunner({
      spawn: () => child as never,
      binary: "/x",
      modelPath: "/m",
      onEvent: (e) => events.push(e),
      backpressureTimeoutMs: 500,
      idleTimeoutMs: 30_000,
      now: () => Date.now(),
    });
    child.emit("exit", 1, null);
    expect(events.some((e: any) => e.kind === "error" && e.code === "child-crashed")).toBe(true);
    runner.kill();
  });

  it("graceful stop closes stdin and resolves on natural exit", async () => {
    const child = makeFakeChild();
    const runner: WhisperRunner = startWhisperRunner({
      spawn: () => child as never,
      binary: "/x",
      modelPath: "/m",
      onEvent: () => {},
      backpressureTimeoutMs: 500,
      idleTimeoutMs: 30_000,
      now: () => Date.now(),
    });
    const stopped = runner.stop();
    setImmediate(() => child.emit("exit", 0, null));
    await stopped;
    // Verifies stop() awaits the exit event without timing out.
  });
});
```

- [ ] **Step 4.2: Run, verify FAIL**

- [ ] **Step 4.3: Implement runner**

```ts
// apps/server/src/dictation/whisperRunner.ts
import type { ChildProcess } from "node:child_process";
import { parseWhisperStdoutLine } from "./whisperStdoutParser.ts";

export type WhisperRunnerEvent =
  | { kind: "partial"; text: string }
  | { kind: "commit"; text: string }
  | { kind: "error"; code: "backpressure" | "child-crashed" | "spawn-failed"; message: string };

export interface WhisperRunner {
  writeFrame(frame: Buffer): void;
  stop(): Promise<void>;
  kill(): void;
}

export interface WhisperRunnerOptions {
  spawn: (binary: string, args: readonly string[]) => ChildProcess;
  binary: string;
  modelPath: string;
  onEvent: (event: WhisperRunnerEvent) => void;
  backpressureTimeoutMs: number;
  idleTimeoutMs: number;
  now: () => number;
  language?: string | null;
}

export function startWhisperRunner(options: WhisperRunnerOptions): WhisperRunner {
  const args = [
    "--stream",
    "-m", options.modelPath,
    "-c", "0",
    "-f", "-",
    ...(options.language ? ["-l", options.language] : []),
  ];
  let killed = false;
  let pendingWriteSince: number | null = null;
  let backpressureTimer: NodeJS.Timeout | null = null;
  const child = options.spawn(options.binary, args);

  child.stdout?.setEncoding("utf8");
  let stdoutBuffer = "";
  child.stdout?.on("data", (chunk: string) => {
    stdoutBuffer += chunk;
    let nl: number;
    while ((nl = stdoutBuffer.indexOf("\n")) >= 0) {
      const line = stdoutBuffer.slice(0, nl);
      stdoutBuffer = stdoutBuffer.slice(nl + 1);
      const parsed = parseWhisperStdoutLine(line);
      if (parsed) options.onEvent(parsed);
    }
  });

  let exitResolver: ((value: void) => void) | null = null;
  child.on("exit", (code) => {
    if (backpressureTimer) clearTimeout(backpressureTimer);
    if (!killed && code !== 0 && exitResolver === null) {
      options.onEvent({
        kind: "error",
        code: "child-crashed",
        message: `whisper.cpp exited with code ${code ?? "null"}`,
      });
    }
    exitResolver?.();
    exitResolver = null;
  });

  child.on("error", (err) => {
    options.onEvent({ kind: "error", code: "spawn-failed", message: err.message });
  });

  function writeFrame(frame: Buffer): void {
    if (killed || !child.stdin) return;
    const ok = child.stdin.write(frame, () => {
      pendingWriteSince = null;
      if (backpressureTimer) {
        clearTimeout(backpressureTimer);
        backpressureTimer = null;
      }
    });
    if (!ok && pendingWriteSince === null) {
      pendingWriteSince = options.now();
      backpressureTimer = setTimeout(() => {
        options.onEvent({
          kind: "error",
          code: "backpressure",
          message: `stdin stalled > ${options.backpressureTimeoutMs}ms`,
        });
      }, options.backpressureTimeoutMs);
    }
  }

  async function stop(): Promise<void> {
    if (killed) return;
    return new Promise<void>((resolve) => {
      exitResolver = resolve;
      child.stdin?.end();
    });
  }

  function kill(): void {
    killed = true;
    if (backpressureTimer) clearTimeout(backpressureTimer);
    child.kill("SIGTERM");
  }

  return { writeFrame, stop, kill };
}
```

- [ ] **Step 4.4: Run, verify PASS**

```
bun run test apps/server/src/dictation/whisperRunner.test.ts
```

- [ ] **Step 4.5: Commit**

```bash
git add apps/server/src/dictation/whisperRunner.ts \
        apps/server/src/dictation/whisperRunner.test.ts
git commit -m "feat(server): add whisper.cpp child process runner"
```

---

## Task 5: Dictation service (`apps/server/src/dictation/dictationService.ts`)

Owns per-WS session state, the warm pool of one (single idle child held for 30 s), the public Effect API consumed by `ws.ts`. Exposes:

- `startSession(input)` — Effect that returns `DictationStartResult`, lazily acquires a runner.
- `writeFrame(input)` — Effect that decodes base64 and forwards to runner.
- `stopSession(input)` — Effect that finalizes the session (last partial → commit if present), then either returns the runner to the warm pool or kills it.
- `events: Stream<DictationStreamEvent>` — multiplexed stream every subscriber sees.

**Files:**
- Create: `apps/server/src/dictation/dictationService.ts`
- Create: `apps/server/src/dictation/dictationService.test.ts`

- [ ] **Step 5.1: Write the failing test**

```ts
// apps/server/src/dictation/dictationService.test.ts
import { Effect, Stream } from "effect";
import { describe, expect, it, vi } from "vitest";
import { makeDictationService, type DictationServiceDeps } from "./dictationService.ts";
import type { WhisperRunner, WhisperRunnerEvent } from "./whisperRunner.ts";

function fakeRunner(): WhisperRunner & { __emit: (e: WhisperRunnerEvent) => void } {
  let onEvent: ((e: WhisperRunnerEvent) => void) | null = null;
  const runner = {
    writeFrame: vi.fn(),
    stop: vi.fn(async () => {}),
    kill: vi.fn(),
    __emit: (e: WhisperRunnerEvent) => onEvent?.(e),
    __setEvent: (fn: (e: WhisperRunnerEvent) => void) => (onEvent = fn),
  };
  return runner as never;
}

const deps = (overrides?: Partial<DictationServiceDeps>): DictationServiceDeps => ({
  capability: {
    available: true,
    reason: null,
    modelLabel: "ggml-base.en",
    binaryPath: "/usr/bin/whisper-cli",
  },
  startRunner: vi.fn(),
  newSessionId: () => "sess_1",
  warmPoolIdleMs: 30_000,
  ...overrides,
});

describe("dictationService", () => {
  it("startSession returns sessionId and modelLabel and emits started", async () => {
    const runner = fakeRunner();
    const startRunner = vi.fn(() => runner);
    const service = makeDictationService(deps({ startRunner: startRunner as never }));
    const events: unknown[] = [];
    const sub = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fiber = yield* Stream.runForEach(service.events, (e) =>
            Effect.sync(() => events.push(e)),
          ).pipe(Effect.fork);
          const result = yield* service.startSession({
            threadId: "thread_x" as never,
            language: null,
          });
          return { result, fiber };
        }),
      ),
    );
    expect(sub.result).toEqual({ sessionId: "sess_1", modelLabel: "ggml-base.en" });
    expect(events.some((e: any) => e.type === "started")).toBe(true);
  });

  it("audioFrame forwards decoded base64 to runner.writeFrame", async () => {
    const runner = fakeRunner();
    const service = makeDictationService(deps({ startRunner: () => runner as never }));
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* service.startSession({ threadId: "t" as never, language: null });
        yield* service.writeFrame({
          sessionId: "sess_1" as never,
          seq: 0,
          pcm: Buffer.alloc(1600).toString("base64"),
        });
      }),
    );
    expect(runner.writeFrame).toHaveBeenCalledOnce();
    const arg = (runner.writeFrame as any).mock.calls[0][0] as Buffer;
    expect(arg.length).toBe(1600);
  });

  it("stop emits stopped and keeps runner warm for next session", async () => {
    const runner = fakeRunner();
    const startRunner = vi.fn(() => runner as never);
    const service = makeDictationService(deps({ startRunner }));
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* service.startSession({ threadId: "t" as never, language: null });
        yield* service.stopSession({ sessionId: "sess_1" as never, reason: "user" });
        yield* service.startSession({ threadId: "t" as never, language: null });
      }),
    );
    expect(startRunner).toHaveBeenCalledOnce();
    expect(runner.stop).toHaveBeenCalledOnce();
    expect(runner.kill).not.toHaveBeenCalled();
  });

  it("kills warm runner after warmPoolIdleMs", async () => {
    vi.useFakeTimers();
    try {
      const runner = fakeRunner();
      const service = makeDictationService(
        deps({ startRunner: () => runner as never, warmPoolIdleMs: 100 }),
      );
      await Effect.runPromise(service.startSession({ threadId: "t" as never, language: null }));
      await Effect.runPromise(service.stopSession({ sessionId: "sess_1" as never, reason: "user" }));
      vi.advanceTimersByTime(150);
      expect(runner.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 5.2: Run, verify FAIL**

- [ ] **Step 5.3: Implement service**

This is the longest module. Sketch:

```ts
// apps/server/src/dictation/dictationService.ts
import { Effect, PubSub, Stream } from "effect";
import type {
  DictationAudioFrameInput,
  DictationCapability,
  DictationStartInput,
  DictationStartResult,
  DictationStopInput,
  DictationStreamEvent,
} from "@t3tools/contracts";
import type { WhisperRunner, WhisperRunnerEvent } from "./whisperRunner.ts";

export interface DictationServiceDeps {
  capability: DictationCapability;
  startRunner: (opts: {
    onEvent: (e: WhisperRunnerEvent) => void;
    language: string | null;
  }) => WhisperRunner;
  newSessionId: () => string;
  warmPoolIdleMs: number;
}

export interface DictationService {
  startSession(input: DictationStartInput): Effect.Effect<DictationStartResult>;
  writeFrame(input: DictationAudioFrameInput): Effect.Effect<void>;
  stopSession(input: DictationStopInput): Effect.Effect<void>;
  events: Stream.Stream<DictationStreamEvent>;
  shutdown(): Effect.Effect<void>;
}

interface ActiveSession {
  sessionId: string;
  runner: WhisperRunner;
  lastPartial: string | null;
}

export function makeDictationService(deps: DictationServiceDeps): DictationService {
  const pubsub = Effect.runSync(PubSub.unbounded<DictationStreamEvent>());
  let active: ActiveSession | null = null;
  let warm: WhisperRunner | null = null;
  let warmTimer: NodeJS.Timeout | null = null;

  function publishSync(event: DictationStreamEvent) {
    Effect.runSync(PubSub.publish(pubsub, event));
  }

  function bindRunnerEvents(runner: WhisperRunner, sessionId: string) {
    // The runner factory is called with onEvent above; this helper exists for clarity.
    return (event: WhisperRunnerEvent) => {
      if (event.kind === "partial") {
        if (active) active.lastPartial = event.text;
        publishSync({ type: "partial", sessionId, text: event.text });
      } else if (event.kind === "commit") {
        if (active) active.lastPartial = null;
        publishSync({ type: "commit", sessionId, text: event.text });
      } else if (event.kind === "error") {
        publishSync({
          type: "error",
          sessionId,
          code: event.code as never,
          message: event.message,
        });
      }
    };
  }

  function acquireRunner(language: string | null, sessionId: string): WhisperRunner {
    if (warm) {
      const reused = warm;
      warm = null;
      if (warmTimer) clearTimeout(warmTimer);
      // re-bind event handler — runner emits via shared callback; pattern is to
      // construct runner with closure over current sessionId, so warm reuse means
      // we need a runner-side `setEventHandler`. If the runner doesn't support
      // re-binding, skip warm-pool reuse and always start fresh in v1.
      return reused;
    }
    return deps.startRunner({
      onEvent: bindRunnerEvents(undefined as never, sessionId),
      language,
    });
  }

  function startSession(input: DictationStartInput): Effect.Effect<DictationStartResult> {
    return Effect.sync(() => {
      if (active) throw new Error("session already active for this WS");
      if (!deps.capability.available || !deps.capability.modelLabel) {
        throw new Error("dictation unavailable");
      }
      const sessionId = deps.newSessionId();
      const handler = bindRunnerEvents(undefined as never, sessionId);
      const runner = warm ?? deps.startRunner({ onEvent: handler, language: input.language });
      if (warm) {
        warm = null;
        if (warmTimer) clearTimeout(warmTimer);
      }
      active = { sessionId, runner, lastPartial: null };
      publishSync({ type: "started", sessionId, modelLabel: deps.capability.modelLabel });
      return { sessionId, modelLabel: deps.capability.modelLabel };
    });
  }

  function writeFrame(input: DictationAudioFrameInput): Effect.Effect<void> {
    return Effect.sync(() => {
      if (!active || active.sessionId !== input.sessionId) return;
      const frame = Buffer.from(input.pcm, "base64");
      active.runner.writeFrame(frame);
    });
  }

  function stopSession(input: DictationStopInput): Effect.Effect<void> {
    return Effect.promise(async () => {
      if (!active || active.sessionId !== input.sessionId) return;
      const session = active;
      active = null;
      // Promote any pending partial to a commit before tearing down.
      if (session.lastPartial && session.lastPartial.length > 0) {
        publishSync({ type: "commit", sessionId: session.sessionId, text: session.lastPartial });
      }
      await session.runner.stop();
      publishSync({ type: "stopped", sessionId: session.sessionId, reason: "client-stop" });
      // Warm pool of one
      warm = session.runner;
      warmTimer = setTimeout(() => {
        warm?.kill();
        warm = null;
        warmTimer = null;
      }, deps.warmPoolIdleMs);
    });
  }

  function shutdown(): Effect.Effect<void> {
    return Effect.sync(() => {
      active?.runner.kill();
      active = null;
      warm?.kill();
      warm = null;
      if (warmTimer) clearTimeout(warmTimer);
    });
  }

  return {
    startSession,
    writeFrame,
    stopSession,
    events: Stream.fromPubSub(pubsub),
    shutdown,
  };
}
```

**Note for implementer:** The warm-pool runner-reuse path requires `WhisperRunner` to expose a `setEventHandler` so the next session's `sessionId` can be threaded through. If that complicates Task 4 unduly, drop the warm-pool optimization in v1 and always spawn fresh — the spec explicitly lists this as "saves the 1-3 s model load" but it is not an acceptance criterion. Document the deferral in the spec's Notes section.

- [ ] **Step 5.4: Run, verify PASS**

- [ ] **Step 5.5: Commit**

```bash
git add apps/server/src/dictation/dictationService.ts \
        apps/server/src/dictation/dictationService.test.ts
git commit -m "feat(server): add dictation session service"
```

---

## Task 6: Server WS handlers

Wire the four RPCs into the existing `WsRpcGroup` handler map in `apps/server/src/ws.ts`.

**Files:**
- Modify: `apps/server/src/ws.ts`

- [ ] **Step 6.1: Decide where the DictationService lives**

It is per-WS-connection (each WS has at most one active dictation session). Look at how other per-WS state is held in `ws.ts` — likely inside the `WsRpcGroup.toLayer(...)` scope. Add a `const dictation = makeDictationService({ ... })` inside that scope, plumbing the boot-time `DictationCapability` from `loadServerConfig`.

- [ ] **Step 6.2: Add handler entries**

Inside the existing handler map, alongside `[WS_METHODS.subscribeServerLifecycle]: ...`:

```ts
[WS_METHODS.dictationStart]: (input) =>
  observeRpcEffect(WS_METHODS.dictationStart, dictation.startSession(input)),
[WS_METHODS.dictationAudioFrame]: (input) =>
  observeRpcEffect(WS_METHODS.dictationAudioFrame, dictation.writeFrame(input)),
[WS_METHODS.dictationStop]: (input) =>
  observeRpcEffect(WS_METHODS.dictationStop, dictation.stopSession(input)),
[WS_METHODS.subscribeDictation]: (_input) =>
  observeRpcStreamEffect(
    WS_METHODS.subscribeDictation,
    Effect.succeed(dictation.events),
    { "rpc.aggregate": "dictation" },
  ),
```

Add a finalizer at WS scope teardown that calls `dictation.shutdown()` (look at how other per-WS resources are torn down).

- [ ] **Step 6.3: Run typecheck**

```
bun typecheck
```

Fix any RPC group type errors (likely missing branch in the handler union).

- [ ] **Step 6.4: Add an integration smoke test**

In a new file `apps/server/src/dictation/wsIntegration.test.ts`, exercise the full RPC roundtrip with a mock `startRunner` that scripts events. (See existing `apps/server/src/server.test.ts` and `wsRpcClient.test.ts` for the in-process WS test pattern in this codebase. Mirror that pattern; do not invent a new harness.)

- [ ] **Step 6.5: Commit**

```bash
git add apps/server/src/ws.ts apps/server/src/dictation/wsIntegration.test.ts
git commit -m "feat(server): wire dictation RPCs into WebSocket handler group"
```

---

## Task 7: Web RPC client + dictation capability selector

Extend the typed `WsRpcClient` with the four dictation methods. Expose a server-capability selector atom.

**Files:**
- Modify: `apps/web/src/rpc/wsRpcClient.ts`
- Modify: `apps/web/src/rpc/serverState.ts`

- [ ] **Step 7.1: Read existing client structure**

```
bun run test apps/web/src/rpc/wsRpcClient.test.ts
```

This shows the existing pattern. Add `dictation: { start, audioFrame, stop, subscribe }` to the client. Add a test asserting the client surfaces these methods.

- [ ] **Step 7.2: Implement, run tests**

- [ ] **Step 7.3: Add a dictation capability selector**

In `serverState.ts`, add:

```ts
export const selectDictationCapability = (config: ServerConfig | null) =>
  config?.dictation ?? null;
```

Plus a tiny test for the null-handling branch.

- [ ] **Step 7.4: Commit**

```bash
git add apps/web/src/rpc/wsRpcClient.ts \
        apps/web/src/rpc/wsRpcClient.test.ts \
        apps/web/src/rpc/serverState.ts \
        apps/web/src/rpc/serverState.test.ts
git commit -m "feat(web): expose dictation methods on WsRpcClient"
```

---

## Task 8: Browser PCM resampler (`apps/web/src/dictation/pcmResampler.ts`)

Pure function. Float32 input at any sample rate → Int16 output at 16 kHz mono. Linear interpolation. Tested headless without an `AudioContext`.

**Files:**
- Create: `apps/web/src/dictation/pcmResampler.ts`
- Create: `apps/web/src/dictation/pcmResampler.test.ts`

- [ ] **Step 8.1: Write the failing test**

```ts
// apps/web/src/dictation/pcmResampler.test.ts
import { describe, expect, it } from "vitest";
import { resampleFloat32ToInt16 } from "./pcmResampler.ts";

function sineFloat32(sampleRate: number, freqHz: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return out;
}

describe("resampleFloat32ToInt16", () => {
  it("reduces 48kHz to 16kHz with expected sample count", () => {
    const input = sineFloat32(48_000, 1000, 1);
    const out = resampleFloat32ToInt16(input, 48_000, 16_000);
    expect(out.length).toBeGreaterThanOrEqual(15_990);
    expect(out.length).toBeLessThanOrEqual(16_010);
  });

  it("clamps Float32 values outside [-1, 1] before quantizing", () => {
    const input = new Float32Array([2, -2, 0]);
    const out = resampleFloat32ToInt16(input, 16_000, 16_000);
    expect(out[0]).toBe(32_767);
    expect(out[1]).toBe(-32_768);
    expect(out[2]).toBe(0);
  });

  it("upsample 8kHz to 16kHz roughly doubles sample count", () => {
    const input = sineFloat32(8_000, 500, 0.1);
    const out = resampleFloat32ToInt16(input, 8_000, 16_000);
    expect(out.length).toBeGreaterThanOrEqual(1590);
    expect(out.length).toBeLessThanOrEqual(1610);
  });

  it("preserves ~0.5 amplitude (Int16 ≈ 16384) for a 1kHz sine", () => {
    const input = sineFloat32(48_000, 1000, 0.5);
    const out = resampleFloat32ToInt16(input, 48_000, 16_000);
    let max = 0;
    for (const sample of out) max = Math.max(max, Math.abs(sample));
    expect(max).toBeGreaterThan(15_500);
    expect(max).toBeLessThan(17_000);
  });
});
```

- [ ] **Step 8.2: Run, verify FAIL**

- [ ] **Step 8.3: Implement resampler**

```ts
// apps/web/src/dictation/pcmResampler.ts
export function resampleFloat32ToInt16(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Int16Array {
  if (inputRate === outputRate) return floatToInt16(input);
  const ratio = inputRate / outputRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    const sample = a + (b - a) * frac;
    out[i] = clampToInt16(sample);
  }
  return out;
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = clampToInt16(input[i] ?? 0);
  return out;
}

function clampToInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped < 0 ? clamped * 32_768 : clamped * 32_767);
}
```

- [ ] **Step 8.4: Run, verify PASS**

- [ ] **Step 8.5: Commit**

```bash
git add apps/web/src/dictation/pcmResampler.ts \
        apps/web/src/dictation/pcmResampler.test.ts
git commit -m "feat(web): add PCM resampler for dictation audio capture"
```

---

## Task 9: AudioWorklet wrapper (`apps/web/src/dictation/pcmResamplerWorklet.ts`)

Wraps the pure resampler in an `AudioWorkletProcessor`, posting Int16 frames over `MessageChannel` every 50 ms.

**Files:**
- Create: `apps/web/src/dictation/pcmResamplerWorklet.ts`
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 9.1: Write the worklet**

This file runs in the AudioWorkletGlobalScope and cannot be unit-tested in node. It is intentionally tiny — all logic lives in `pcmResampler.ts`. No `.test.ts` for this file.

```ts
// apps/web/src/dictation/pcmResamplerWorklet.ts
/// <reference types="@types/audioworklet" />
import { resampleFloat32ToInt16 } from "./pcmResampler.ts";

const FRAME_MS = 50;
const TARGET_RATE = 16_000;
const SAMPLES_PER_FRAME = (TARGET_RATE * FRAME_MS) / 1000; // 800

class PcmResamplerProcessor extends AudioWorkletProcessor {
  private buffer: Int16Array = new Int16Array(0);

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const resampled = resampleFloat32ToInt16(channel, sampleRate, TARGET_RATE);
    this.buffer = concatInt16(this.buffer, resampled);
    while (this.buffer.length >= SAMPLES_PER_FRAME) {
      const frame = this.buffer.slice(0, SAMPLES_PER_FRAME);
      this.buffer = this.buffer.slice(SAMPLES_PER_FRAME);
      this.port.postMessage(frame.buffer, [frame.buffer]);
    }
    return true;
  }
}

function concatInt16(a: Int16Array, b: Int16Array): Int16Array {
  const out = new Int16Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

registerProcessor("pcm-resampler", PcmResamplerProcessor);
```

- [ ] **Step 9.2: Register the worklet as a Vite asset**

In `apps/web/vite.config.ts`, add:

```ts
// inside defineConfig({...}):
worker: { format: "es" }, // if not already set
build: {
  rollupOptions: {
    input: {
      // existing entries…
      "pcm-resampler-worklet": resolve(
        import.meta.dirname,
        "src/dictation/pcmResamplerWorklet.ts",
      ),
    },
  },
},
```

(Adjust to match the actual `vite.config.ts` shape — the project may already use a multi-input pattern.)

- [ ] **Step 9.3: Verify build**

```
bun run --filter "@t3tools/web" build  # or whichever build command the repo uses
```

Build must succeed and produce a fingerprinted `pcm-resampler-worklet-<hash>.js`. The path will be threaded through `audioCapture.ts` in Task 10 via Vite's `?url` import.

- [ ] **Step 9.4: Commit**

```bash
git add apps/web/src/dictation/pcmResamplerWorklet.ts apps/web/vite.config.ts
git commit -m "feat(web): register PCM resampler AudioWorklet"
```

---

## Task 10: Audio capture (`apps/web/src/dictation/audioCapture.ts`)

Wraps `getUserMedia` + `AudioContext` + `AudioWorkletNode`. Emits Int16 frames via a callback. Cleans up MediaStream tracks on stop.

**Files:**
- Create: `apps/web/src/dictation/audioCapture.ts`
- Create: `apps/web/src/dictation/audioCapture.test.ts`

- [ ] **Step 10.1: Write the failing test**

The browser-only path needs a thin headless test. Mock `navigator.mediaDevices`, `AudioContext`, `AudioWorkletNode`. Tests the orchestration logic, not real audio.

```ts
// apps/web/src/dictation/audioCapture.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { startAudioCapture, type AudioCaptureHandle } from "./audioCapture.ts";

class FakeAudioContext {
  sampleRate = 48_000;
  audioWorklet = { addModule: vi.fn(async () => {}) };
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  close = vi.fn(async () => {});
}
class FakeAudioWorkletNode {
  port = {
    onmessage: null as ((e: MessageEvent<ArrayBuffer>) => void) | null,
    close: vi.fn(),
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

const fakeStream = (() => {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  return { getAudioTracks: () => [track], getTracks: () => [track] } as never;
})();

beforeEach(() => {
  // @ts-expect-error - shimming JSDOM
  globalThis.AudioContext = FakeAudioContext;
  // @ts-expect-error - shimming JSDOM
  globalThis.AudioWorkletNode = FakeAudioWorkletNode;
  // @ts-expect-error - shimming JSDOM
  globalThis.navigator.mediaDevices = {
    getUserMedia: vi.fn(async () => fakeStream),
  };
  // @ts-expect-error - shimming JSDOM
  globalThis.window.isSecureContext = true;
});
afterEach(() => vi.restoreAllMocks());

describe("startAudioCapture", () => {
  it("requests mono getUserMedia with EC/NS/AGC enabled", async () => {
    await startAudioCapture({ workletUrl: "/x.js", onFrame: () => {} });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  });

  it("rejects when isSecureContext is false", async () => {
    // @ts-expect-error
    globalThis.window.isSecureContext = false;
    await expect(
      startAudioCapture({ workletUrl: "/x.js", onFrame: () => {} }),
    ).rejects.toThrow(/secure context/i);
  });

  it("posts Int16 frames from the worklet to the onFrame callback", async () => {
    const frames: ArrayBuffer[] = [];
    const handle = await startAudioCapture({
      workletUrl: "/x.js",
      onFrame: (frame) => frames.push(frame),
    });
    // simulate worklet posting a frame
    (handle as unknown as { __workletNode: FakeAudioWorkletNode }).__workletNode.port.onmessage?.(
      new MessageEvent("message", { data: new ArrayBuffer(1600) }),
    );
    expect(frames.length).toBe(1);
    expect(frames[0]?.byteLength).toBe(1600);
  });

  it("stop() releases the MediaStream tracks and closes the AudioContext", async () => {
    const handle = await startAudioCapture({ workletUrl: "/x.js", onFrame: () => {} });
    await handle.stop();
    const track = (fakeStream as never as { getAudioTracks(): { stop: ReturnType<typeof vi.fn> }[] })
      .getAudioTracks()[0]!;
    expect(track.stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 10.2: Run, verify FAIL**

- [ ] **Step 10.3: Implement**

```ts
// apps/web/src/dictation/audioCapture.ts
export interface AudioCaptureOptions {
  workletUrl: string;
  onFrame: (frame: ArrayBuffer) => void;
}

export interface AudioCaptureHandle {
  stop(): Promise<void>;
}

export async function startAudioCapture(
  options: AudioCaptureOptions,
): Promise<AudioCaptureHandle> {
  if (!window.isSecureContext) {
    throw new Error(
      "Dictation requires a secure context (HTTPS). Try `tailscale serve` for local dev.",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Dictation requires a browser with mediaDevices.getUserMedia support.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(options.workletUrl);
  const sourceNode = ctx.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(ctx, "pcm-resampler");
  workletNode.port.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) options.onFrame(event.data);
  };
  sourceNode.connect(workletNode);

  const handle: AudioCaptureHandle & { __workletNode?: AudioWorkletNode } = {
    async stop() {
      workletNode.port.onmessage = null;
      try {
        workletNode.disconnect();
      } catch {}
      try {
        sourceNode.disconnect();
      } catch {}
      for (const track of stream.getTracks()) track.stop();
      await ctx.close();
    },
  };
  handle.__workletNode = workletNode;
  return handle;
}
```

- [ ] **Step 10.4: Run, verify PASS, commit**

```bash
git add apps/web/src/dictation/audioCapture.ts \
        apps/web/src/dictation/audioCapture.test.ts
git commit -m "feat(web): wrap getUserMedia + AudioWorklet for dictation"
```

---

## Task 11: Dictation capability + dictation store

State machine + capability resolver, both as Effect Atoms.

**Files:**
- Create: `apps/web/src/dictation/dictationCapability.ts`
- Create: `apps/web/src/dictation/dictationCapability.test.ts`
- Create: `apps/web/src/dictation/dictationStore.ts`
- Create: `apps/web/src/dictation/dictationStore.test.ts`

- [ ] **Step 11.1: Capability tests + impl**

```ts
// apps/web/src/dictation/dictationCapability.test.ts
import { describe, expect, it } from "vitest";
import { resolveDictationCapability } from "./dictationCapability.ts";

describe("resolveDictationCapability", () => {
  it("unavailable when server reports unavailable", () => {
    expect(
      resolveDictationCapability({
        server: { available: false, reason: "missing", modelLabel: null, binaryPath: null },
        isSecureContext: true,
        hasMediaDevices: true,
      }),
    ).toEqual({ available: false, reason: "missing" });
  });

  it("unavailable when not in secure context", () => {
    expect(
      resolveDictationCapability({
        server: { available: true, reason: null, modelLabel: "x", binaryPath: "/x" },
        isSecureContext: false,
        hasMediaDevices: true,
      }),
    ).toEqual({ available: false, reason: expect.stringMatching(/secure context|https/i) });
  });

  it("unavailable when no mediaDevices", () => {
    expect(
      resolveDictationCapability({
        server: { available: true, reason: null, modelLabel: "x", binaryPath: "/x" },
        isSecureContext: true,
        hasMediaDevices: false,
      }),
    ).toEqual({ available: false, reason: expect.stringMatching(/mediadevices|browser/i) });
  });

  it("available when all checks pass", () => {
    expect(
      resolveDictationCapability({
        server: { available: true, reason: null, modelLabel: "ggml-base.en", binaryPath: "/x" },
        isSecureContext: true,
        hasMediaDevices: true,
      }),
    ).toEqual({ available: true, reason: null, modelLabel: "ggml-base.en" });
  });
});
```

```ts
// apps/web/src/dictation/dictationCapability.ts
import type { DictationCapability as ServerDictationCapability } from "@t3tools/contracts";

export type ResolvedDictationCapability =
  | { available: true; reason: null; modelLabel: string }
  | { available: false; reason: string };

export interface ResolveCapabilityInput {
  server: ServerDictationCapability;
  isSecureContext: boolean;
  hasMediaDevices: boolean;
}

export function resolveDictationCapability(
  input: ResolveCapabilityInput,
): ResolvedDictationCapability {
  if (!input.server.available) {
    return { available: false, reason: input.server.reason ?? "Dictation unavailable on server." };
  }
  if (!input.isSecureContext) {
    return {
      available: false,
      reason:
        "Dictation requires a secure context (HTTPS). Try `tailscale serve` to expose the dev server over HTTPS.",
    };
  }
  if (!input.hasMediaDevices) {
    return {
      available: false,
      reason: "Browser does not expose mediaDevices.getUserMedia.",
    };
  }
  return {
    available: true,
    reason: null,
    modelLabel: input.server.modelLabel ?? "whisper.cpp",
  };
}
```

- [ ] **Step 11.2: Run, verify PASS**

- [ ] **Step 11.3: Store tests + impl**

The store is a state machine with these states: `idle | requesting-permission | recording | stopping | error`. Use Effect Atom (`Atom.make`, `Atom.keepAlive`, registered via `appAtomRegistry`) the same way `serverState.ts` does.

Test the legal transitions:
- `idle → requesting-permission → recording` (on user click + grant)
- `idle → error` (on permission deny)
- `recording → stopping → idle` (on user stop)
- `recording → error` (on backend `dictation.error` event)

```ts
// apps/web/src/dictation/dictationStore.test.ts
import { describe, expect, it } from "vitest";
import { createDictationStore } from "./dictationStore.ts";

describe("dictationStore", () => {
  it("starts in idle", () => {
    const store = createDictationStore();
    expect(store.read().state).toBe("idle");
  });

  it("idle -> requesting-permission -> recording on grant", () => {
    const store = createDictationStore();
    store.dispatch({ type: "request-start" });
    expect(store.read().state).toBe("requesting-permission");
    store.dispatch({ type: "session-started", sessionId: "s1", modelLabel: "x" });
    expect(store.read().state).toBe("recording");
    expect(store.read().sessionId).toBe("s1");
  });

  it("idle -> error on permission deny", () => {
    const store = createDictationStore();
    store.dispatch({ type: "request-start" });
    store.dispatch({ type: "permission-denied" });
    expect(store.read().state).toBe("error");
  });

  it("recording -> stopping -> idle on user stop", () => {
    const store = createDictationStore();
    store.dispatch({ type: "request-start" });
    store.dispatch({ type: "session-started", sessionId: "s1", modelLabel: "x" });
    store.dispatch({ type: "request-stop", reason: "user" });
    expect(store.read().state).toBe("stopping");
    store.dispatch({ type: "session-stopped" });
    expect(store.read().state).toBe("idle");
  });

  it("recording -> error on backend error", () => {
    const store = createDictationStore();
    store.dispatch({ type: "request-start" });
    store.dispatch({ type: "session-started", sessionId: "s1", modelLabel: "x" });
    store.dispatch({ type: "backend-error", code: "child-crashed", message: "bye" });
    expect(store.read().state).toBe("error");
  });

  it("ignores illegal transitions in idle", () => {
    const store = createDictationStore();
    store.dispatch({ type: "session-started", sessionId: "s1", modelLabel: "x" });
    expect(store.read().state).toBe("idle");
  });
});
```

```ts
// apps/web/src/dictation/dictationStore.ts
export type DictationState =
  | { state: "idle"; sessionId: null }
  | { state: "requesting-permission"; sessionId: null }
  | { state: "recording"; sessionId: string; modelLabel: string }
  | { state: "stopping"; sessionId: string }
  | { state: "error"; reason: string };

export type DictationEvent =
  | { type: "request-start" }
  | { type: "session-started"; sessionId: string; modelLabel: string }
  | { type: "permission-denied" }
  | { type: "request-stop"; reason: string }
  | { type: "session-stopped" }
  | { type: "backend-error"; code: string; message: string };

const INITIAL: DictationState = { state: "idle", sessionId: null };

export function reduce(state: DictationState, event: DictationEvent): DictationState {
  switch (event.type) {
    case "request-start":
      return state.state === "idle" || state.state === "error"
        ? { state: "requesting-permission", sessionId: null }
        : state;
    case "session-started":
      return state.state === "requesting-permission"
        ? {
            state: "recording",
            sessionId: event.sessionId,
            modelLabel: event.modelLabel,
          }
        : state;
    case "permission-denied":
      return state.state === "requesting-permission"
        ? { state: "error", reason: "Microphone permission denied." }
        : state;
    case "request-stop":
      return state.state === "recording"
        ? { state: "stopping", sessionId: state.sessionId }
        : state;
    case "session-stopped":
      return state.state === "stopping" ? INITIAL : state;
    case "backend-error":
      return { state: "error", reason: event.message };
  }
}

export interface DictationStore {
  read(): DictationState;
  dispatch(event: DictationEvent): void;
  subscribe(listener: (state: DictationState) => void): () => void;
}

export function createDictationStore(): DictationStore {
  let state: DictationState = INITIAL;
  const listeners = new Set<(s: DictationState) => void>();
  return {
    read: () => state,
    dispatch: (event) => {
      const next = reduce(state, event);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener(state);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

(Effect Atom integration: wrap the store in an `Atom.make` that mirrors `state` and exposes `dispatch` via a separate Atom action. Follow the pattern in `wsConnectionState.ts`.)

- [ ] **Step 11.4: Run, verify PASS**

- [ ] **Step 11.5: Commit**

```bash
git add apps/web/src/dictation/dictationCapability.ts \
        apps/web/src/dictation/dictationCapability.test.ts \
        apps/web/src/dictation/dictationStore.ts \
        apps/web/src/dictation/dictationStore.test.ts
git commit -m "feat(web): add dictation capability resolver and state store"
```

---

## Task 12: Lexical DictationPlugin

Anchor model:
1. On `started`, capture selection, insert a zero-width text node, remember its key.
2. On `partial`, replace the anchor node's text content with the partial.
3. On `commit`, promote the anchor to a normal text node (just clear the anchor key), insert a fresh zero-width anchor immediately after.
4. On `stopped`/`error`, drop the anchor node (no committed text loss).

All edits go through `editor.update(...)` calls tagged with `HISTORY_MERGE_TAG` so partial updates collapse into one undo entry.

Plugin exposes commands:
- `INSERT_DICTATION_PARTIAL_COMMAND(text: string)`
- `COMMIT_DICTATION_COMMAND(text: string)`
- `START_DICTATION_ANCHOR_COMMAND()`
- `DISCARD_DICTATION_ANCHOR_COMMAND()`

**Files:**
- Create: `apps/web/src/components/composer/DictationPlugin.tsx`
- Create: `apps/web/src/components/composer/DictationPlugin.test.tsx`

- [ ] **Step 12.1: Write the failing tests against a headless Lexical editor**

```tsx
// apps/web/src/components/composer/DictationPlugin.test.tsx
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { render, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  COMMIT_DICTATION_COMMAND,
  DictationPlugin,
  INSERT_DICTATION_PARTIAL_COMMAND,
  START_DICTATION_ANCHOR_COMMAND,
} from "./DictationPlugin.tsx";

function getEditorText(editor: import("lexical").LexicalEditor): string {
  return editor.getEditorState().read(() => editor.getRootElement()?.textContent ?? "");
}

let _capturedEditor: import("lexical").LexicalEditor | null = null;
function CaptureEditor() {
  const [editor] = useLexicalComposerContext();
  _capturedEditor = editor;
  return null;
}

function renderPlugin() {
  render(
    <LexicalComposer initialConfig={{ namespace: "test", onError: (e) => { throw e; } }}>
      <DictationPlugin />
      <CaptureEditor />
    </LexicalComposer>,
  );
  if (!_capturedEditor) throw new Error("editor not captured");
  return _capturedEditor;
}

describe("DictationPlugin", () => {
  it("inserts and replaces partial text at the anchor", () => {
    const editor = renderPlugin();
    act(() => {
      editor.dispatchCommand(START_DICTATION_ANCHOR_COMMAND, undefined);
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, "hel");
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, "hello");
    });
    expect(getEditorText(editor)).toBe("hello");
  });

  it("commit promotes anchor and creates a fresh anchor for next partials", () => {
    const editor = renderPlugin();
    act(() => {
      editor.dispatchCommand(START_DICTATION_ANCHOR_COMMAND, undefined);
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, "hello");
      editor.dispatchCommand(COMMIT_DICTATION_COMMAND, "hello world.");
      editor.dispatchCommand(INSERT_DICTATION_PARTIAL_COMMAND, " how");
    });
    expect(getEditorText(editor)).toBe("hello world. how");
  });
});
```

- [ ] **Step 12.2: Run, verify FAIL**

- [ ] **Step 12.3: Implement plugin**

Implementation note: The Lexical anchor node can be a regular `TextNode` whose key the plugin tracks, with content marked as "partial" via a private flag (or simply by tracking `editor.getEditorState()._nodeMap` for the node key). Each partial update calls `editor.update(() => { node.setTextContent(text) }, { tag: HISTORY_MERGE_TAG })`.

Sketch (the implementer fills in the precise Lexical APIs by reading `@lexical/react` docs and the existing `ComposerCommandKeyPlugin.tsx` for the registerCommand pattern):

```tsx
// apps/web/src/components/composer/DictationPlugin.tsx
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  createCommand,
  HISTORY_MERGE_TAG,
  type LexicalCommand,
} from "lexical";
import { useEffect, useRef } from "react";

export const START_DICTATION_ANCHOR_COMMAND: LexicalCommand<undefined> = createCommand(
  "START_DICTATION_ANCHOR",
);
export const INSERT_DICTATION_PARTIAL_COMMAND: LexicalCommand<string> = createCommand(
  "INSERT_DICTATION_PARTIAL",
);
export const COMMIT_DICTATION_COMMAND: LexicalCommand<string> = createCommand(
  "COMMIT_DICTATION",
);
export const DISCARD_DICTATION_ANCHOR_COMMAND: LexicalCommand<undefined> = createCommand(
  "DISCARD_DICTATION_ANCHOR",
);

export function DictationPlugin() {
  const [editor] = useLexicalComposerContext();
  const anchorKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const off1 = editor.registerCommand(
      START_DICTATION_ANCHOR_COMMAND,
      () => {
        editor.update(
          () => {
            const selection = $getSelection();
            const anchor = $createTextNode("");
            if ($isRangeSelection(selection)) {
              selection.insertNodes([anchor]);
            } else {
              $getRoot().append(anchor);
            }
            anchorKeyRef.current = anchor.getKey();
          },
          { tag: HISTORY_MERGE_TAG },
        );
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    const off2 = editor.registerCommand(
      INSERT_DICTATION_PARTIAL_COMMAND,
      (text: string) => {
        const key = anchorKeyRef.current;
        if (!key) return false;
        editor.update(
          () => {
            const node = editor.getEditorState()._nodeMap.get(key);
            if (node && node.getType() === "text") {
              (node as ReturnType<typeof $createTextNode>).setTextContent(text);
            }
          },
          { tag: HISTORY_MERGE_TAG },
        );
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    const off3 = editor.registerCommand(
      COMMIT_DICTATION_COMMAND,
      (text: string) => {
        editor.update(
          () => {
            const key = anchorKeyRef.current;
            const node = key ? editor.getEditorState()._nodeMap.get(key) : null;
            if (node && node.getType() === "text") {
              (node as ReturnType<typeof $createTextNode>).setTextContent(text);
            }
            const fresh = $createTextNode("");
            if (node) {
              (node as ReturnType<typeof $createTextNode>).insertAfter(fresh);
            } else {
              $getRoot().append(fresh);
            }
            anchorKeyRef.current = fresh.getKey();
          },
          { tag: HISTORY_MERGE_TAG },
        );
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    const off4 = editor.registerCommand(
      DISCARD_DICTATION_ANCHOR_COMMAND,
      () => {
        editor.update(
          () => {
            const key = anchorKeyRef.current;
            if (!key) return;
            const node = editor.getEditorState()._nodeMap.get(key);
            (node as ReturnType<typeof $createTextNode> | undefined)?.remove();
            anchorKeyRef.current = null;
          },
          { tag: HISTORY_MERGE_TAG },
        );
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );

    return () => {
      off1();
      off2();
      off3();
      off4();
    };
  }, [editor]);

  return null;
}
```

**Note on Lexical APIs used above:** `editor.getEditorState()._nodeMap` is internal/unstable. Replace with the documented `$getNodeByKey(key)` from `lexical` (already imported elsewhere in the codebase — grep for it). The pattern becomes:

```ts
import { $getNodeByKey } from "lexical";
// ...
const node = $getNodeByKey(key);
if (node && $isTextNode(node)) {
  node.setTextContent(text);
}
```

Use `$isTextNode` (also from `lexical`) for the type guard rather than the `getType() === "text"` string check.

- [ ] **Step 12.4: Mount the plugin in `ComposerPromptEditor.tsx`**

Add `<DictationPlugin />` alongside the other plugin components (after line ~1647 per the architecture digest).

- [ ] **Step 12.5: Run, verify PASS, commit**

```bash
git add apps/web/src/components/composer/DictationPlugin.tsx \
        apps/web/src/components/composer/DictationPlugin.test.tsx \
        apps/web/src/components/ComposerPromptEditor.tsx
git commit -m "feat(web): add Lexical DictationPlugin with anchor model"
```

---

## Task 13: Dictate button + composer integration + thread-switch auto-stop

Slot a `ComposerDictateButton` into `ComposerPrimaryActions`'s sibling space, subscribe `ChatComposer` to the dictation store, dispatch Lexical commands as events arrive, auto-stop on `activeThreadId` change, add the keybinding.

**Files:**
- Create: `apps/web/src/components/chat/ComposerDictateButton.tsx`
- Create: `apps/web/src/components/chat/ComposerDictateButton.test.tsx`
- Modify: `apps/web/src/components/chat/ChatComposer.tsx`
- Modify: `apps/web/src/components/chat/ComposerPrimaryActions.tsx`
- Modify: `apps/web/src/components/chat/CompactComposerControlsMenu.tsx` (verify pass-through, may not need edits)
- Modify: `packages/contracts/src/keybindings.ts`
- Modify: `packages/shared/src/keybindings/<defaults file>`
- Modify: `apps/web/src/keybindings.ts`

- [ ] **Step 13.1: Add the keybinding command to contracts**

In `packages/contracts/src/keybindings.ts`, append `"dictation.toggle"` to `STATIC_KEYBINDING_COMMANDS`. Add a roundtrip test in `keybindings.test.ts` decoding a `KeybindingCommand` literal `"dictation.toggle"`.

- [ ] **Step 13.2: Add default keybinding in `@t3tools/shared`**

```
grep -rn "DEFAULT_RESOLVED_KEYBINDINGS\|defaultKeybindings" packages/shared/src
```

Find the file. Append:

```ts
{ key: "M", command: "dictation.toggle", modKey: false, ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }
```

(or whatever shape that file uses).

- [ ] **Step 13.3: Wire web matcher in `apps/web/src/keybindings.ts`**

Extend `evaluateKeybindingCommand` (or its analog) to handle `"dictation.toggle"` by invoking `dictationStore.dispatch({ type: "request-start" })` when the state is idle/error, and `{ type: "request-stop", reason: "user" }` when recording. Tests in `keybindings.test.ts`.

- [ ] **Step 13.4: Build the dictate button component**

```tsx
// apps/web/src/components/chat/ComposerDictateButton.tsx
import { memo, type PointerEventHandler } from "react";
import { MicIcon } from "lucide-react";
import { cn } from "~/lib/utils";

export interface ComposerDictateButtonProps {
  state: "idle" | "requesting-permission" | "recording" | "stopping" | "error" | "unavailable-secure-context";
  preserveComposerFocusOnPointerDown?: boolean;
  unavailableTooltip?: string | null;
  onClick: () => void;
}

const preventPointerFocus: PointerEventHandler<HTMLElement> = (e) => e.preventDefault();

export const ComposerDictateButton = memo(function ComposerDictateButton({
  state,
  preserveComposerFocusOnPointerDown = true,
  unavailableTooltip,
  onClick,
}: ComposerDictateButtonProps) {
  const pointerProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;
  const isRecording = state === "recording";
  const isBusy = state === "requesting-permission" || state === "stopping";
  const isUnavailable = state === "unavailable-secure-context";
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8",
        isRecording && "bg-rose-500/90 text-white animate-pulse",
        !isRecording && "bg-muted text-muted-foreground hover:bg-muted/80",
        isUnavailable && "opacity-40 cursor-not-allowed",
      )}
      onClick={onClick}
      disabled={isBusy || isUnavailable}
      aria-label={
        isRecording ? "Stop dictation" :
        isBusy ? "Dictation busy" :
        isUnavailable ? (unavailableTooltip ?? "Dictation unavailable") :
        "Start dictation"
      }
      title={isUnavailable ? unavailableTooltip ?? undefined : undefined}
      {...pointerProps}
    >
      <MicIcon className="size-4" aria-hidden="true" />
    </button>
  );
});
```

Tests for each visual state branch.

- [ ] **Step 13.5: Slot the button into `ComposerPrimaryActions`'s sibling space**

The architecture digest puts the slot at `ChatComposer.tsx:2388-2395` inside `<div data-chat-composer-actions="right">`. Render `<ComposerDictateButton />` there, conditional on `dictationCapability.available`. The button is **not** inside `ComposerPrimaryActions` itself — that keeps `ComposerPrimaryActions` props clean.

- [ ] **Step 13.6: Subscribe `ChatComposer` to the dictation store**

`useEffect` at `ChatComposer.tsx`:

1. Subscribe to dictation events stream (`subscribeDictation` RPC) on mount; dispatch Lexical commands as events arrive:
   - `started` → `START_DICTATION_ANCHOR_COMMAND`
   - `partial` → `INSERT_DICTATION_PARTIAL_COMMAND`
   - `commit` → `COMMIT_DICTATION_COMMAND`
   - `stopped`, `error` → `DISCARD_DICTATION_ANCHOR_COMMAND` (when there's an uncommitted partial; on clean stop the trailing partial has already been committed by the server)
2. Drive button-click logic: idle → call `dictation.start` RPC + start audio capture + on each frame call `dictation.audioFrame`. Recording → stop audio capture + `dictation.stop` RPC.

- [ ] **Step 13.7: Auto-stop on thread switch**

Add a `useEffect(() => { ... return cleanup }, [activeThreadId])` near the existing line-1208 effect. On change, if dictation is recording, dispatch `{ type: "request-stop", reason: "thread-switch" }`.

- [ ] **Step 13.8: Auto-stop on `visibilitychange → hidden`**

Within the same recording lifecycle effect, attach `document.addEventListener("visibilitychange", ...)`.

- [ ] **Step 13.9: Run all web tests**

```
bun run test apps/web
```

- [ ] **Step 13.10: Commit**

```bash
git add apps/web/src/components/chat/ComposerDictateButton.tsx \
        apps/web/src/components/chat/ComposerDictateButton.test.tsx \
        apps/web/src/components/chat/ChatComposer.tsx \
        apps/web/src/components/chat/ComposerPrimaryActions.tsx \
        apps/web/src/components/chat/CompactComposerControlsMenu.tsx \
        apps/web/src/keybindings.ts \
        apps/web/src/keybindings.test.ts \
        packages/contracts/src/keybindings.ts \
        packages/contracts/src/keybindings.test.ts \
        packages/shared/src/keybindings
git commit -m "feat(web): integrate dictate button, store subscription, and Ctrl+Shift+M"
```

---

## Task 14: Settings page status block

Read-only "Dictation" section showing capability state, model label, binary path, install instructions link.

**Files:**
- Modify: settings page (find with `grep -rn "ServerSettings\|settings page\|<SettingsPage" apps/web/src/components`)

- [ ] **Step 14.1: Locate the settings page module and add a section**

```tsx
<DictationStatusBlock capability={serverCapability} />
```

Component renders:
- Status: ✓ Available / ✗ Unavailable
- Model label
- Binary path
- If unavailable: the `reason` string + a link to `https://github.com/ggerganov/whisper.cpp` (install instructions)

- [ ] **Step 14.2: Snapshot test for the two states**

- [ ] **Step 14.3: Commit**

```bash
git add <settings paths>
git commit -m "feat(web): add Dictation status block to settings"
```

---

## Task 15: Final verification

- [ ] **Step 15.1: Run the full pass bar**

```
bun fmt
bun lint
bun typecheck
bun run test
```

All four green.

- [ ] **Step 15.2: Manual smoke test against a local whisper.cpp**

If the workstation has whisper.cpp installed:

1. Set `WHISPER_MODEL=$HOME/.cache/whisper/ggml-base.en.bin`.
2. `bun run dev` (or whatever the dev command is — see `package.json`).
3. Open the web app over HTTPS (`tailscale serve` or equivalent).
4. Verify the dictate button appears, mic permission flows, partials stream into the composer, commits stick, stopping leaves text in the composer, switching threads auto-stops.
5. Verify acceptance criteria 1–12 from the spec.

If whisper.cpp is not installed on the workstation, document this skip in the spec's Notes section.

- [ ] **Step 15.3: Tick all spec checkboxes; write completion commit**

```
feat(dictation): streaming local dictation in thread composer [feature-complete]

Adds a microphone button to every thread composer that streams local-machine
speech-to-text using whisper.cpp on the server. Pipeline: AudioWorklet captures
mono Float32 → resamples to 16 kHz Int16 50 ms frames → fire-and-forget RPCs
over the existing WS → server spawns whisper.cpp in stream mode and pushes
parsed [partial]/[commit] events back through subscribeDictation → Lexical
DictationPlugin replaces partials and promotes commits at an anchor node, with
HISTORY_MERGE_TAG so all partials within one commit collapse to a single undo.

Capability is detected at server boot and exposed in the existing handshake;
the button auto-hides when whisper.cpp is missing or the browser is not in a
secure context.

Feature-Complete: true
Plan: .agents/plans/2026-05-06-1104-hyprwhspr-streaming-dictation.md
Implementation plan: .agents/plans/2026-05-06-1104-hyprwhspr-streaming-dictation-impl.md
```

- [ ] **Step 15.4: Push branch + open PR**

```bash
git push -u origin feat/hyprwhspr-streaming-dictation
gh pr create --title "feat: streaming local dictation in thread composer" \
  --body "Implements .agents/plans/2026-05-06-1104-hyprwhspr-streaming-dictation.md.

## Summary
- Browser AudioWorklet → 16 kHz Int16 PCM → server whisper.cpp → Lexical anchor model
- Capability auto-detected at server boot
- Single dictation session per WS, auto-stops on thread switch / tab hidden
- Ctrl+Shift+M toggle, configurable

## Test plan
- [ ] bun fmt / lint / typecheck / run test green
- [ ] Manual smoke: capability green → button visible → recording → stops with text intact
- [ ] Manual smoke: capability red → button hidden
- [ ] Manual smoke: secure-context false → button shows HTTPS-required state"
```

(Target branch: `staging` if it exists, else `main` — verify with `git remote show origin`.)

---

## Self-review notes (run before opening the PR)

- **Spec coverage.** Every checkbox in the spec's `## Plan` section maps to one of Tasks 1–14. Acceptance criteria 1–12 are covered by Tasks 13 (UI rendering) + 15 (manual smoke). The NOT-tested list (Spec line 231) is honored (no real-mic CI, no NeMo).
- **Type consistency check.** `DictationCapability` (contracts) and `ResolvedDictationCapability` (web) are intentionally distinct — server flag is a leaf value; web type folds in browser checks. `dictationStore`'s `state` literals match the spec's enumeration. Wire event `type` literal is `started | partial | commit | stopped | error` consistently.
- **No placeholders.** Each task has actual code in each step. The few spots flagged "implementer fills in" (Task 12 Lexical internal API swap, Task 14 settings page path) are bounded to a single line of code each and called out explicitly.
- **One open implementation choice flagged in Task 5:** the warm-pool runner-reuse path needs a runner-side event re-binding API. If that complicates the runner, drop the warm pool and document the deferral. Not an acceptance criterion.

---

## Execution Handoff

Plan complete and saved to `.agents/plans/2026-05-06-1104-hyprwhspr-streaming-dictation-impl.md`. Two execution options:

**1. Subagent-Driven (recommended for this plan)** — One fresh subagent per task, two-stage review between tasks. Good fit because tasks 1–11 are mostly independent modules with clean interfaces; the codebase is large enough that a fresh-context subagent per task avoids drift.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, with checkpoints at the end of each task.

**Which approach?**
