# On-the-Go Mode — Phase 1: Foundation + Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the orchestration foundation for on-the-go mode — interfaces, stores, state machine, and concrete adapter implementations — with full test coverage and zero user-facing UI yet. By the end of Phase 1, the orchestrator can be driven from a test harness through every state transition.

**Architecture:** Isolated feature folder at `apps/web/src/onTheGo/` with two swappable interfaces (`VoiceAdapter`, `SummaryAdapter`), a hand-rolled state-machine orchestrator, two stores, and concrete adapter implementations. Hand-rolled FSM (no XState) keeps deps minimal. All orchestrator and store tests run with fake adapters — no browser, no network needed.

**Tech Stack:** React + TanStack Router + Vitest (unit + browser configs already present) + shadcn/Tailwind + Lucide. Browser `SpeechSynthesis` / `webkitSpeechRecognition` APIs (`BrowserVoiceAdapter`). User-supplied OpenAI / Anthropic API keys (`OpenAIAdapter`, `AnthropicAdapter`). Existing `effect-acp` / `effect-codex-app-server` for `MainAgentCliAdapter`.

**Spec:** `docs/superpowers/specs/2026-05-06-on-the-go-mode-design.md`

**Phase 1 acceptance:**

- All tasks below complete and committed.
- `apps/web/src/onTheGo/__tests__/` orchestrator FSM tests at 100% branch coverage.
- `NotificationsStore` and `PausedSessionsStore` tests at 100% branch coverage.
- All three `SummaryAdapter` impls have unit tests with mocked `fetch`/CLI.
- `BrowserVoiceAdapter` has browser-mode tests covering silence detection + interrupt + visibility.
- No UI files yet; Phase 2 will add them.

**Note on existing types:** T3 Code's `RuntimeThreadState` (`active | idle | archived | closed | compacted | error`) and `RuntimeSessionState` (which includes `waiting`) already exist in `packages/contracts/src/providerRuntime.ts`. Our `Notification.status` of `"awaiting" | "errored"` maps to the existing `idle`/`waiting` and `error` states respectively. The exact mapping is finalized in Task 11 (RPC subscription wiring).

---

## Task 1: Project scaffolding — directory + index files

**Files:**

- Create: `apps/web/src/onTheGo/index.ts`
- Create: `apps/web/src/onTheGo/types.ts`
- Create: `apps/web/src/onTheGo/__tests__/.gitkeep`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p apps/web/src/onTheGo/{components,hooks,state,flow,skills,voice,adapters,routes,settings,__tests__}
touch apps/web/src/onTheGo/__tests__/.gitkeep
```

- [ ] **Step 2: Create the feature barrel `index.ts`**

```ts
// apps/web/src/onTheGo/index.ts
// Public exports for the on-the-go feature. Add to this file as components and hooks become public.
export {};
```

- [ ] **Step 3: Create the shared types file**

```ts
// apps/web/src/onTheGo/types.ts
import type { ThreadId } from "@t3tools/contracts";

export type NotificationStatus = "awaiting" | "errored";

export type Notification = {
  threadId: ThreadId;
  threadTitle: string;
  status: NotificationStatus;
  agentLastMessage: string;
  userLastMessage: string;
  changeSummary?: string;
  branch?: string;
  updatedAt: number;
};

export type Turn = {
  role: "user" | "assistant";
  text: string;
  at: number;
};

export type PauseReason = "manual" | "idle-timeout";

export type PausedSession = {
  threadId: ThreadId;
  notification: Notification;
  history: Turn[];
  pendingDraft?: string;
  pausedAt: number;
  pauseReason: PauseReason;
};

export type FlowState =
  | "idle"
  | "entering"
  | "summarizing"
  | "conversing"
  | "composing"
  | "countdown"
  | "committing";
```

- [ ] **Step 4: Verify the directory structure compiles**

Run: `bun run --cwd apps/web typecheck`
Expected: PASS (no new TS errors).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/
git commit -m "feat(on-the-go): scaffold feature directory and shared types"
```

---

## Task 2: `AbortablePromise` utility

**Files:**

- Create: `apps/web/src/onTheGo/abortable.ts`
- Create: `apps/web/src/onTheGo/abortable.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/onTheGo/abortable.test.ts
import { describe, expect, it, vi } from "vitest";
import { abortable, AbortError } from "./abortable";

describe("AbortablePromise", () => {
  it("resolves with the value when not aborted", async () => {
    const p = abortable<number>((resolve) => resolve(42));
    expect(await p).toBe(42);
  });

  it("throws AbortError when aborted before resolution", async () => {
    const p = abortable<number>(() => {
      // never resolves
    });
    p.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it("calls the cleanup function on abort", () => {
    const cleanup = vi.fn();
    const p = abortable<number>(() => cleanup);
    p.abort();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("is idempotent on multiple abort calls", () => {
    const cleanup = vi.fn();
    const p = abortable<number>(() => cleanup);
    p.abort();
    p.abort();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test abortable`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the utility**

```ts
// apps/web/src/onTheGo/abortable.ts
export class AbortError extends Error {
  constructor() {
    super("Aborted");
    this.name = "AbortError";
  }
}

export type AbortablePromise<T> = Promise<T> & { abort: () => void };

type Executor<T> = (
  resolve: (value: T) => void,
  reject: (reason?: unknown) => void,
) => void | (() => void);

export function abortable<T>(executor: Executor<T>): AbortablePromise<T> {
  let aborted = false;
  let cleanup: (() => void) | void;
  let rejectExternal: (reason?: unknown) => void = () => {};

  const promise = new Promise<T>((resolve, reject) => {
    rejectExternal = reject;
    cleanup = executor(
      (value) => {
        if (!aborted) resolve(value);
      },
      (reason) => {
        if (!aborted) reject(reason);
      },
    );
  }) as AbortablePromise<T>;

  promise.abort = () => {
    if (aborted) return;
    aborted = true;
    if (cleanup) cleanup();
    rejectExternal(new AbortError());
  };

  return promise;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test abortable`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/abortable.ts apps/web/src/onTheGo/abortable.test.ts
git commit -m "feat(on-the-go): add AbortablePromise utility"
```

---

## Task 3: `VoiceAdapter` interface

**Files:**

- Create: `apps/web/src/onTheGo/voice/VoiceAdapter.ts`

- [ ] **Step 1: Write the interface (no test — interface-only file, tested via implementations)**

```ts
// apps/web/src/onTheGo/voice/VoiceAdapter.ts
import type { AbortablePromise } from "../abortable";

export type ListenOptions = {
  onPartial?: (text: string) => void;
  silenceTimeoutMs: number;
};

export type ListenResult = { finalText: string };

export type SpeakOptions = {
  onStart?: () => void;
  onEnd?: () => void;
};

export interface VoiceAdapter {
  speak(text: string, opts?: SpeakOptions): AbortablePromise<void>;
  listen(opts: ListenOptions): AbortablePromise<ListenResult>;
  interrupt(): void;
  destroy(): void;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `bun run --cwd apps/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/onTheGo/voice/VoiceAdapter.ts
git commit -m "feat(on-the-go): add VoiceAdapter interface"
```

---

## Task 4: `SummaryAdapter` interface

**Files:**

- Create: `apps/web/src/onTheGo/adapters/SummaryAdapter.ts`

- [ ] **Step 1: Write the interface**

```ts
// apps/web/src/onTheGo/adapters/SummaryAdapter.ts
import type { Turn } from "../types";

export type SummarizeInput = {
  agentMessage: string;
  userMessage: string;
};

export type ReplyInput = {
  history: Turn[];
  userTurn: string;
};

export type ComposePromptInput = {
  history: Turn[];
  skill: string;
};

export class InvalidApiKeyError extends Error {
  constructor(public provider: string) {
    super(`Invalid API key for ${provider}`);
    this.name = "InvalidApiKeyError";
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super(retryAfterSeconds ? `Rate limited; retry after ${retryAfterSeconds}s` : "Rate limited");
    this.name = "RateLimitError";
  }
}

export interface SummaryAdapter {
  summarize(input: SummarizeInput): Promise<string>;
  reply(input: ReplyInput): Promise<string>;
  composePrompt(input: ComposePromptInput): Promise<string>;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `bun run --cwd apps/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/onTheGo/adapters/SummaryAdapter.ts
git commit -m "feat(on-the-go): add SummaryAdapter interface and error types"
```

---

## Task 5: `FakeVoiceAdapter` — for orchestrator tests

**Files:**

- Create: `apps/web/src/onTheGo/voice/FakeVoiceAdapter.ts`
- Create: `apps/web/src/onTheGo/voice/FakeVoiceAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/onTheGo/voice/FakeVoiceAdapter.test.ts
import { describe, expect, it } from "vitest";
import { AbortError } from "../abortable";
import { FakeVoiceAdapter } from "./FakeVoiceAdapter";

describe("FakeVoiceAdapter", () => {
  it("records spoken text in order", async () => {
    const v = new FakeVoiceAdapter();
    await v.speak("hello");
    await v.speak("world");
    expect(v.spokenTexts).toEqual(["hello", "world"]);
  });

  it("returns queued listen responses in FIFO order", async () => {
    const v = new FakeVoiceAdapter();
    v.queueListen("first");
    v.queueListen("second");
    expect((await v.listen({ silenceTimeoutMs: 1500 })).finalText).toBe("first");
    expect((await v.listen({ silenceTimeoutMs: 1500 })).finalText).toBe("second");
  });

  it("rejects pending listen calls on interrupt", async () => {
    const v = new FakeVoiceAdapter();
    const p = v.listen({ silenceTimeoutMs: 1500 });
    v.interrupt();
    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(v.interruptCount).toBe(1);
  });

  it("rejects pending speak calls on interrupt", async () => {
    const v = new FakeVoiceAdapter();
    v.holdSpeak = true;
    const p = v.speak("hello");
    v.interrupt();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test FakeVoiceAdapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `FakeVoiceAdapter`**

```ts
// apps/web/src/onTheGo/voice/FakeVoiceAdapter.ts
import { abortable, type AbortablePromise } from "../abortable";
import type { ListenOptions, ListenResult, SpeakOptions, VoiceAdapter } from "./VoiceAdapter";

export class FakeVoiceAdapter implements VoiceAdapter {
  spokenTexts: string[] = [];
  interruptCount = 0;
  holdSpeak = false;

  private listenQueue: string[] = [];
  private pendingAborts: Array<() => void> = [];

  queueListen(text: string) {
    this.listenQueue.push(text);
  }

  speak(text: string, opts?: SpeakOptions): AbortablePromise<void> {
    this.spokenTexts.push(text);
    return abortable<void>((resolve, reject) => {
      let aborted = false;
      const finalize = () => {
        if (aborted) return;
        opts?.onStart?.();
        opts?.onEnd?.();
        resolve();
      };
      if (this.holdSpeak) {
        this.pendingAborts.push(() => {
          aborted = true;
          reject(new Error("aborted"));
        });
      } else {
        finalize();
      }
      return () => {
        aborted = true;
      };
    });
  }

  listen(opts: ListenOptions): AbortablePromise<ListenResult> {
    return abortable<ListenResult>((resolve, reject) => {
      let aborted = false;
      const next = this.listenQueue.shift();
      if (next !== undefined) {
        opts.onPartial?.(next);
        resolve({ finalText: next });
      } else {
        // No queued response: stay pending until interrupted.
        this.pendingAborts.push(() => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }
      return () => {
        aborted = true;
      };
    });
  }

  interrupt() {
    this.interruptCount++;
    const pending = this.pendingAborts;
    this.pendingAborts = [];
    for (const abort of pending) abort();
  }

  destroy() {
    this.interrupt();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test FakeVoiceAdapter`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/voice/FakeVoiceAdapter.ts apps/web/src/onTheGo/voice/FakeVoiceAdapter.test.ts
git commit -m "feat(on-the-go): add FakeVoiceAdapter for orchestrator tests"
```

---

## Task 6: `FakeSummaryAdapter` — for orchestrator tests

**Files:**

- Create: `apps/web/src/onTheGo/adapters/FakeSummaryAdapter.ts`
- Create: `apps/web/src/onTheGo/adapters/FakeSummaryAdapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/onTheGo/adapters/FakeSummaryAdapter.test.ts
import { describe, expect, it } from "vitest";
import { FakeSummaryAdapter } from "./FakeSummaryAdapter";

describe("FakeSummaryAdapter", () => {
  it("returns the configured summary for summarize", async () => {
    const a = new FakeSummaryAdapter({ summary: "fake tldr" });
    expect(await a.summarize({ agentMessage: "...", userMessage: "..." })).toBe("fake tldr");
  });

  it("returns queued replies in FIFO order", async () => {
    const a = new FakeSummaryAdapter({ replies: ["a", "b"] });
    expect(await a.reply({ history: [], userTurn: "x" })).toBe("a");
    expect(await a.reply({ history: [], userTurn: "y" })).toBe("b");
  });

  it("returns the configured composed prompt", async () => {
    const a = new FakeSummaryAdapter({ composedPrompt: "do the thing" });
    expect(await a.composePrompt({ history: [], skill: "skill text" })).toBe("do the thing");
  });

  it("throws on the configured failOn method", async () => {
    const a = new FakeSummaryAdapter({ failOn: "summarize" });
    await expect(a.summarize({ agentMessage: "", userMessage: "" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test FakeSummaryAdapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `FakeSummaryAdapter`**

```ts
// apps/web/src/onTheGo/adapters/FakeSummaryAdapter.ts
import type {
  ComposePromptInput,
  ReplyInput,
  SummarizeInput,
  SummaryAdapter,
} from "./SummaryAdapter";

export type FakeSummaryAdapterConfig = {
  summary?: string;
  replies?: string[];
  composedPrompt?: string;
  failOn?: "summarize" | "reply" | "composePrompt";
  failError?: Error;
};

export class FakeSummaryAdapter implements SummaryAdapter {
  summarizeCalls: SummarizeInput[] = [];
  replyCalls: ReplyInput[] = [];
  composeCalls: ComposePromptInput[] = [];

  private replies: string[];

  constructor(private config: FakeSummaryAdapterConfig = {}) {
    this.replies = [...(config.replies ?? [])];
  }

  async summarize(input: SummarizeInput): Promise<string> {
    this.summarizeCalls.push(input);
    if (this.config.failOn === "summarize")
      throw this.config.failError ?? new Error("summarize failed");
    return this.config.summary ?? "fake summary";
  }

  async reply(input: ReplyInput): Promise<string> {
    this.replyCalls.push(input);
    if (this.config.failOn === "reply") throw this.config.failError ?? new Error("reply failed");
    return this.replies.shift() ?? "fake reply";
  }

  async composePrompt(input: ComposePromptInput): Promise<string> {
    this.composeCalls.push(input);
    if (this.config.failOn === "composePrompt")
      throw this.config.failError ?? new Error("compose failed");
    return this.config.composedPrompt ?? "fake composed prompt";
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test FakeSummaryAdapter`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/adapters/FakeSummaryAdapter.ts apps/web/src/onTheGo/adapters/FakeSummaryAdapter.test.ts
git commit -m "feat(on-the-go): add FakeSummaryAdapter for orchestrator tests"
```

---

## Task 7: `optimize-prompt.md` skill file

**Files:**

- Create: `apps/web/src/onTheGo/skills/optimize-prompt.md`
- Create: `apps/web/src/onTheGo/skills/loadSkill.ts`
- Create: `apps/web/src/onTheGo/skills/loadSkill.test.ts`

- [ ] **Step 1: Write the skill file content**

```markdown
<!-- apps/web/src/onTheGo/skills/optimize-prompt.md -->

You are a prompt-rewriter for a coding agent. The user has just had a conversation
with you (a voice assistant) to figure out their next instruction for the agent.
Your job is to convert that conversation into a single concise prompt the agent
will read and act on.

# Style rules

- Terse. No preamble, no hedging, no explanations of what you're about to do.
- Action-oriented. Frame as direct instructions ("Add tests for X"), not questions
  ("Could you add tests for X?").
- Preserve specifics verbatim: file paths, identifiers, branch names, error
  messages, function names. Never paraphrase these.
- One paragraph or a tight bulleted list. No markdown headers. No code fences
  unless the user explicitly asked for code in their conversation.
- Output ONLY the prompt text. No "Here's the prompt:" preamble.

# Examples

## Example 1

Input conversation:

> User: it added the oauth callback handler. tests pass. should we wire up the redirect?
> Assistant: do you want a specific path for the redirect?
> User: yes after success go to /dashboard. and on error /auth/error
> Assistant: should i add a test for the error redirect too?
> User: yes please

Output:

> Wire up the post-OAuth redirect: success → /dashboard, error → /auth/error. Add tests for both paths including the error redirect.

## Example 2

Input conversation:

> User: it stopped because of a permission error on /etc/hosts
> Assistant: do you want to skip that step or grant the permission?
> User: skip it. and add a comment in the code saying we deliberately skipped it because we don't have permission to edit hosts in CI

Output:

> Skip the /etc/hosts modification step. Add a comment at that site noting the step is deliberately skipped because the CI environment lacks permission to edit /etc/hosts.

# Output format

Plain prompt text. No quotes around it. No surrounding markdown.
```

- [ ] **Step 2: Write the failing test for `loadSkill`**

```ts
// apps/web/src/onTheGo/skills/loadSkill.test.ts
import { describe, expect, it } from "vitest";
import { loadOptimizePromptSkill } from "./loadSkill";

describe("loadOptimizePromptSkill", () => {
  it("returns a non-empty string", () => {
    const skill = loadOptimizePromptSkill();
    expect(typeof skill).toBe("string");
    expect(skill.length).toBeGreaterThan(100);
  });

  it("contains the role line", () => {
    expect(loadOptimizePromptSkill()).toMatch(/prompt-rewriter for a coding agent/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run --cwd apps/web test loadSkill`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `loadSkill`**

```ts
// apps/web/src/onTheGo/skills/loadSkill.ts
// Vite supports importing files as raw strings via the `?raw` suffix.
import optimizePromptSkill from "./optimize-prompt.md?raw";

export function loadOptimizePromptSkill(): string {
  return optimizePromptSkill;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun run --cwd apps/web test loadSkill`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/onTheGo/skills/
git commit -m "feat(on-the-go): add optimize-prompt.md skill file and loader"
```

---

## Task 8: `Signal` utility (lightweight reactive primitive for stores)

**Files:**

- Create: `apps/web/src/onTheGo/state/signal.ts`
- Create: `apps/web/src/onTheGo/state/signal.test.ts`

> **Why a custom signal:** the orchestrator and stores need a tiny push-based reactive primitive that's testable without React. Existing T3 Code uses `@effect/atom-react` for app state, but tying our internal stores to that creates surface area we don't need yet. A 30-line `Signal<T>` keeps Phase 1 self-contained.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/onTheGo/state/signal.test.ts
import { describe, expect, it, vi } from "vitest";
import { createSignal } from "./signal";

describe("Signal", () => {
  it("returns the initial value via .value", () => {
    const s = createSignal(42);
    expect(s.value).toBe(42);
  });

  it("updates the value via .set", () => {
    const s = createSignal(0);
    s.set(7);
    expect(s.value).toBe(7);
  });

  it("notifies subscribers on change", () => {
    const s = createSignal("hello");
    const sub = vi.fn();
    s.subscribe(sub);
    s.set("world");
    expect(sub).toHaveBeenCalledWith("world");
  });

  it("does not notify if value is referentially equal", () => {
    const obj = { a: 1 };
    const s = createSignal(obj);
    const sub = vi.fn();
    s.subscribe(sub);
    s.set(obj);
    expect(sub).not.toHaveBeenCalled();
  });

  it("supports unsubscribing", () => {
    const s = createSignal(0);
    const sub = vi.fn();
    const unsub = s.subscribe(sub);
    unsub();
    s.set(1);
    expect(sub).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test signal`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `createSignal`**

```ts
// apps/web/src/onTheGo/state/signal.ts
export type Signal<T> = {
  readonly value: T;
  set: (next: T) => void;
  subscribe: (listener: (value: T) => void) => () => void;
};

export function createSignal<T>(initial: T): Signal<T> {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get value() {
      return current;
    },
    set(next: T) {
      if (Object.is(next, current)) return;
      current = next;
      for (const listener of listeners) listener(current);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test signal`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/state/signal.ts apps/web/src/onTheGo/state/signal.test.ts
git commit -m "feat(on-the-go): add Signal reactive primitive"
```

---

## Task 9: `NotificationsStore` — basic CRUD + dedupe + sort

**Files:**

- Create: `apps/web/src/onTheGo/state/notificationsStore.ts`
- Create: `apps/web/src/onTheGo/state/notificationsStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/onTheGo/state/notificationsStore.test.ts
import { describe, expect, it } from "vitest";
import type { Notification } from "../types";
import { createNotificationsStore } from "./notificationsStore";

const baseNotif = (overrides: Partial<Notification> = {}): Notification => ({
  threadId: "t1" as Notification["threadId"],
  threadTitle: "Test thread",
  status: "awaiting",
  agentLastMessage: "agent text",
  userLastMessage: "user text",
  updatedAt: 1000,
  ...overrides,
});

describe("NotificationsStore", () => {
  it("adds a notification", () => {
    const store = createNotificationsStore();
    store.add(baseNotif());
    expect(store.notifications.value).toHaveLength(1);
  });

  it("dedupes by threadId — last write wins", () => {
    const store = createNotificationsStore();
    store.add(baseNotif({ threadId: "t1" as any, agentLastMessage: "old", updatedAt: 1000 }));
    store.add(baseNotif({ threadId: "t1" as any, agentLastMessage: "new", updatedAt: 2000 }));
    expect(store.notifications.value).toHaveLength(1);
    expect(store.notifications.value[0]!.agentLastMessage).toBe("new");
  });

  it("sorts errored entries before awaiting entries", () => {
    const store = createNotificationsStore();
    store.add(baseNotif({ threadId: "t1" as any, status: "awaiting", updatedAt: 5000 }));
    store.add(baseNotif({ threadId: "t2" as any, status: "errored", updatedAt: 1000 }));
    expect(store.notifications.value.map((n) => n.threadId)).toEqual(["t2", "t1"]);
  });

  it("sorts within each status by newest first", () => {
    const store = createNotificationsStore();
    store.add(baseNotif({ threadId: "t1" as any, status: "awaiting", updatedAt: 1000 }));
    store.add(baseNotif({ threadId: "t2" as any, status: "awaiting", updatedAt: 3000 }));
    store.add(baseNotif({ threadId: "t3" as any, status: "awaiting", updatedAt: 2000 }));
    expect(store.notifications.value.map((n) => n.threadId)).toEqual(["t2", "t3", "t1"]);
  });

  it("dismiss removes the entry", () => {
    const store = createNotificationsStore();
    store.add(baseNotif({ threadId: "t1" as any }));
    store.dismiss("t1" as any);
    expect(store.notifications.value).toHaveLength(0);
  });

  it("count signal reflects current length", () => {
    const store = createNotificationsStore();
    expect(store.count.value).toBe(0);
    store.add(baseNotif({ threadId: "t1" as any }));
    expect(store.count.value).toBe(1);
    store.add(baseNotif({ threadId: "t2" as any }));
    expect(store.count.value).toBe(2);
    store.dismiss("t1" as any);
    expect(store.count.value).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test notificationsStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

```ts
// apps/web/src/onTheGo/state/notificationsStore.ts
import type { ThreadId } from "@t3tools/contracts";
import type { Notification } from "../types";
import { createSignal, type Signal } from "./signal";

export interface NotificationsStore {
  readonly notifications: Signal<Notification[]>;
  readonly count: Signal<number>;
  add(notification: Notification): void;
  dismiss(threadId: ThreadId): void;
}

function sortNotifications(list: Notification[]): Notification[] {
  return [...list].sort((a, b) => {
    if (a.status === "errored" && b.status !== "errored") return -1;
    if (a.status !== "errored" && b.status === "errored") return 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function createNotificationsStore(): NotificationsStore {
  const notifications = createSignal<Notification[]>([]);
  const count = createSignal(0);

  const setBoth = (next: Notification[]) => {
    notifications.set(next);
    count.set(next.length);
  };

  return {
    notifications,
    count,
    add(notification) {
      const without = notifications.value.filter((n) => n.threadId !== notification.threadId);
      setBoth(sortNotifications([...without, notification]));
    },
    dismiss(threadId) {
      setBoth(notifications.value.filter((n) => n.threadId !== threadId));
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test notificationsStore`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/state/notificationsStore.ts apps/web/src/onTheGo/state/notificationsStore.test.ts
git commit -m "feat(on-the-go): NotificationsStore with dedupe and sort"
```

---

## Task 10: `NotificationsStore` — Notification API integration

**Files:**

- Modify: `apps/web/src/onTheGo/state/notificationsStore.ts`
- Modify: `apps/web/src/onTheGo/state/notificationsStore.test.ts`

- [ ] **Step 1: Add the failing tests for the Notification API side-effect**

Append to `notificationsStore.test.ts`:

```ts
// (continue appending in notificationsStore.test.ts)
import { afterEach, beforeEach, vi } from "vitest";

describe("NotificationsStore — system Notification side-effect", () => {
  let originalNotification: typeof Notification | undefined;

  beforeEach(() => {
    originalNotification = (globalThis as any).Notification;
    const fake = vi.fn().mockImplementation(function (this: any, _title: string, opts: any) {
      this.title = _title;
      this.tag = opts?.tag;
      this.close = vi.fn();
    });
    (fake as any).permission = "granted";
    (globalThis as any).Notification = fake;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  });

  afterEach(() => {
    (globalThis as any).Notification = originalNotification;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  it("fires a system Notification when document is hidden and permission is granted", () => {
    const store = createNotificationsStore();
    store.add(baseNotif({ threadId: "t1" as any, threadTitle: "Hello" }));
    expect((globalThis as any).Notification).toHaveBeenCalledTimes(1);
    const [title, opts] = ((globalThis as any).Notification as any).mock.calls[0];
    expect(title).toContain("T3 Code");
    expect(opts.tag).toBe("t1");
    expect(opts.body).toContain("Hello");
  });

  it("does not fire when document is visible", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    const store = createNotificationsStore();
    store.add(baseNotif({ threadId: "t1" as any }));
    expect((globalThis as any).Notification).not.toHaveBeenCalled();
  });

  it("does not fire when permission is not granted", () => {
    ((globalThis as any).Notification as any).permission = "default";
    const store = createNotificationsStore();
    store.add(baseNotif({ threadId: "t1" as any }));
    expect((globalThis as any).Notification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test notificationsStore`
Expected: FAIL — Notification not called or guard not implemented.

- [ ] **Step 3: Add the side-effect to the store**

In `notificationsStore.ts`, modify `add` to fire the system notification after updating state:

```ts
// Inside createNotificationsStore() — replace `add` with:
add(notification) {
  const without = notifications.value.filter((n) => n.threadId !== notification.threadId);
  const next = sortNotifications([...without, notification]);
  setBoth(next);
  fireSystemNotificationIfHidden(notification);
},
```

Add this helper to the same file:

```ts
function fireSystemNotificationIfHidden(notification: Notification): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const NotificationCtor = (globalThis as any).Notification;
  if (!NotificationCtor) return;
  if (NotificationCtor.permission !== "granted") return;
  if (!document.hidden) return;
  // eslint-disable-next-line no-new -- intentional side-effect
  new NotificationCtor("T3 Code: Awaiting input", {
    body: `${notification.threadTitle} — ${notification.agentLastMessage.slice(0, 80)}`,
    tag: String(notification.threadId),
    data: { threadId: notification.threadId },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test notificationsStore`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/state/notificationsStore.ts apps/web/src/onTheGo/state/notificationsStore.test.ts
git commit -m "feat(on-the-go): fire system Notification when tab hidden and permission granted"
```

---

## Task 11: `NotificationsStore` — RPC subscription wiring

**Files:**

- Create: `apps/web/src/onTheGo/state/threadSubscription.ts`
- Create: `apps/web/src/onTheGo/state/threadSubscription.test.ts`

> **What this task does:** wraps the existing T3 Code RPC thread-state subscription and translates each event into `NotificationsStore.add` / `dismiss` calls. The mapping:
>
> - Thread enters state `idle` (per `RuntimeThreadState`) or session state `waiting` → `add` with status `awaiting`.
> - Thread enters state `error` → `add` with status `errored`.
> - Thread enters state `active` (running) → `dismiss` (it's running again, no longer awaiting).
> - Thread enters state `archived` / `closed` / `compacted` → `dismiss` (terminal, nothing to do).
>
> Per Q3 follow-up, dedupe is per `threadId` — handled by the store, not this layer.

- [ ] **Step 1: Write the failing test (with a fake RPC subscription source)**

```ts
// apps/web/src/onTheGo/state/threadSubscription.test.ts
import { describe, expect, it, vi } from "vitest";
import type { RuntimeThreadState } from "@t3tools/contracts";
import { createNotificationsStore } from "./notificationsStore";
import {
  bindNotificationsToThreadStream,
  type ThreadStateEvent,
  type ThreadStateStream,
} from "./threadSubscription";

function makeFakeStream(): ThreadStateStream & { emit(event: ThreadStateEvent): void } {
  const listeners = new Set<(e: ThreadStateEvent) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const l of listeners) l(event);
    },
  };
}

const baseEvent = (state: RuntimeThreadState, threadId = "t1"): ThreadStateEvent => ({
  threadId: threadId as any,
  threadTitle: "Test",
  state,
  agentLastMessage: "agent",
  userLastMessage: "user",
  updatedAt: Date.now(),
});

describe("bindNotificationsToThreadStream", () => {
  it("adds an awaiting notification when thread enters idle", () => {
    const stream = makeFakeStream();
    const store = createNotificationsStore();
    const unbind = bindNotificationsToThreadStream(stream, store);
    stream.emit(baseEvent("idle"));
    expect(store.notifications.value).toHaveLength(1);
    expect(store.notifications.value[0]!.status).toBe("awaiting");
    unbind();
  });

  it("adds an errored notification when thread enters error", () => {
    const stream = makeFakeStream();
    const store = createNotificationsStore();
    bindNotificationsToThreadStream(stream, store);
    stream.emit(baseEvent("error"));
    expect(store.notifications.value[0]!.status).toBe("errored");
  });

  it("dismisses when thread re-enters active", () => {
    const stream = makeFakeStream();
    const store = createNotificationsStore();
    bindNotificationsToThreadStream(stream, store);
    stream.emit(baseEvent("idle"));
    stream.emit(baseEvent("active"));
    expect(store.notifications.value).toHaveLength(0);
  });

  it("dismisses when thread enters terminal state (closed/archived/compacted)", () => {
    const stream = makeFakeStream();
    const store = createNotificationsStore();
    bindNotificationsToThreadStream(stream, store);
    stream.emit(baseEvent("idle"));
    stream.emit(baseEvent("archived"));
    expect(store.notifications.value).toHaveLength(0);
  });

  it("unsubscribes cleanly", () => {
    const unsubSpy = vi.fn();
    const stream: ThreadStateStream = {
      subscribe: () => unsubSpy,
    };
    const store = createNotificationsStore();
    const unbind = bindNotificationsToThreadStream(stream, store);
    unbind();
    expect(unsubSpy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test threadSubscription`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the binding**

```ts
// apps/web/src/onTheGo/state/threadSubscription.ts
import type { RuntimeThreadState, ThreadId } from "@t3tools/contracts";
import type { NotificationsStore } from "./notificationsStore";

export type ThreadStateEvent = {
  threadId: ThreadId;
  threadTitle: string;
  state: RuntimeThreadState;
  agentLastMessage: string;
  userLastMessage: string;
  changeSummary?: string;
  branch?: string;
  updatedAt: number;
};

export interface ThreadStateStream {
  subscribe(listener: (event: ThreadStateEvent) => void): () => void;
}

export function bindNotificationsToThreadStream(
  stream: ThreadStateStream,
  store: NotificationsStore,
): () => void {
  return stream.subscribe((event) => {
    if (event.state === "idle") {
      store.add({
        threadId: event.threadId,
        threadTitle: event.threadTitle,
        status: "awaiting",
        agentLastMessage: event.agentLastMessage,
        userLastMessage: event.userLastMessage,
        changeSummary: event.changeSummary,
        branch: event.branch,
        updatedAt: event.updatedAt,
      });
    } else if (event.state === "error") {
      store.add({
        threadId: event.threadId,
        threadTitle: event.threadTitle,
        status: "errored",
        agentLastMessage: event.agentLastMessage,
        userLastMessage: event.userLastMessage,
        changeSummary: event.changeSummary,
        branch: event.branch,
        updatedAt: event.updatedAt,
      });
    } else {
      // active, archived, closed, compacted — dismiss any existing entry
      store.dismiss(event.threadId);
    }
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test threadSubscription`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/state/threadSubscription.ts apps/web/src/onTheGo/state/threadSubscription.test.ts
git commit -m "feat(on-the-go): bind NotificationsStore to existing thread state stream"
```

> **Follow-up note for the engineer:** the actual concrete RPC stream implementation (the `ThreadStateStream` instance that gets passed in at app wire-up time) lives in Phase 2 Task 1 (route mount), where we adapt `apps/web/src/rpc/serverState.ts` (or whichever file exposes thread state events in the existing T3 Code RPC layer) to the `ThreadStateStream` interface defined here. Phase 1 only validates the binding logic.

---

## Task 12: `PausedSessionsStore` — in-memory + interface

**Files:**

- Create: `apps/web/src/onTheGo/state/pausedSessionsStore.ts`
- Create: `apps/web/src/onTheGo/state/pausedSessionsStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/onTheGo/state/pausedSessionsStore.test.ts
import { describe, expect, it } from "vitest";
import type { PausedSession } from "../types";
import { createInMemoryPausedSessionsStore, type PausedSessionsStore } from "./pausedSessionsStore";

const session = (threadId: string, history: PausedSession["history"] = []): PausedSession => ({
  threadId: threadId as any,
  notification: {
    threadId: threadId as any,
    threadTitle: "T",
    status: "awaiting",
    agentLastMessage: "a",
    userLastMessage: "u",
    updatedAt: 1,
  },
  history,
  pausedAt: 1,
  pauseReason: "manual",
});

describe("PausedSessionsStore (in-memory)", () => {
  let store: PausedSessionsStore;

  beforeEach(() => {
    store = createInMemoryPausedSessionsStore();
  });

  it("starts empty", () => {
    expect(store.list.value).toEqual([]);
  });

  it("save adds a session", async () => {
    await store.save(session("t1"));
    expect(store.list.value).toHaveLength(1);
  });

  it("save with same threadId overwrites", async () => {
    await store.save(session("t1", [{ role: "user", text: "old", at: 1 }]));
    await store.save(session("t1", [{ role: "user", text: "new", at: 2 }]));
    expect(store.list.value).toHaveLength(1);
    expect(store.list.value[0]!.history[0]!.text).toBe("new");
  });

  it("restore returns the saved session", async () => {
    const original = session("t1", [{ role: "user", text: "hi", at: 1 }]);
    await store.save(original);
    const restored = await store.restore("t1" as any);
    expect(restored.history).toEqual(original.history);
  });

  it("restore throws if threadId not found", async () => {
    await expect(store.restore("missing" as any)).rejects.toThrow();
  });

  it("drop removes the session", async () => {
    await store.save(session("t1"));
    await store.drop("t1" as any);
    expect(store.list.value).toHaveLength(0);
  });
});

import { beforeEach } from "vitest";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test pausedSessionsStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the in-memory store**

```ts
// apps/web/src/onTheGo/state/pausedSessionsStore.ts
import type { ThreadId } from "@t3tools/contracts";
import type { PausedSession } from "../types";
import { createSignal, type Signal } from "./signal";

export interface PausedSessionsStore {
  readonly list: Signal<PausedSession[]>;
  save(session: PausedSession): Promise<void>;
  restore(threadId: ThreadId): Promise<PausedSession>;
  drop(threadId: ThreadId): Promise<void>;
}

export function createInMemoryPausedSessionsStore(): PausedSessionsStore {
  const list = createSignal<PausedSession[]>([]);

  return {
    list,
    async save(session) {
      const without = list.value.filter((s) => s.threadId !== session.threadId);
      list.set([...without, session]);
    },
    async restore(threadId) {
      const found = list.value.find((s) => s.threadId === threadId);
      if (!found) throw new Error(`No paused session for threadId ${String(threadId)}`);
      return found;
    },
    async drop(threadId) {
      list.set(list.value.filter((s) => s.threadId !== threadId));
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test pausedSessionsStore`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/state/pausedSessionsStore.ts apps/web/src/onTheGo/state/pausedSessionsStore.test.ts
git commit -m "feat(on-the-go): in-memory PausedSessionsStore"
```

---

## Task 13: `PausedSessionsStore` — server-side persistence wiring

**Files:**

- Create: `apps/web/src/onTheGo/state/persistedPausedSessionsStore.ts`
- Create: `apps/web/src/onTheGo/state/persistedPausedSessionsStore.test.ts`

> **What this task does:** wraps the in-memory store with a write-through layer that persists to the existing T3 Code data layer. Read-back on construction restores the prior state. The persistence transport is left as a thin interface (`PausedSessionsTransport`) so this layer is testable with a fake; the real transport plugs in at app wire-up time (Phase 2).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/onTheGo/state/persistedPausedSessionsStore.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PausedSession } from "../types";
import {
  createPersistedPausedSessionsStore,
  type PausedSessionsTransport,
} from "./persistedPausedSessionsStore";

const session = (threadId: string): PausedSession => ({
  threadId: threadId as any,
  notification: {
    threadId: threadId as any,
    threadTitle: "T",
    status: "awaiting",
    agentLastMessage: "a",
    userLastMessage: "u",
    updatedAt: 1,
  },
  history: [],
  pausedAt: 1,
  pauseReason: "manual",
});

function makeFakeTransport(initial: PausedSession[] = []): PausedSessionsTransport {
  const data = new Map(initial.map((s) => [String(s.threadId), s]));
  return {
    async loadAll() {
      return [...data.values()];
    },
    async upsert(s) {
      data.set(String(s.threadId), s);
    },
    async remove(threadId) {
      data.delete(String(threadId));
    },
  };
}

describe("PersistedPausedSessionsStore", () => {
  it("hydrates from the transport on construction", async () => {
    const transport = makeFakeTransport([session("t1"), session("t2")]);
    const store = await createPersistedPausedSessionsStore(transport);
    expect(store.list.value).toHaveLength(2);
  });

  it("writes through on save", async () => {
    const transport = makeFakeTransport();
    const upsertSpy = vi.spyOn(transport, "upsert");
    const store = await createPersistedPausedSessionsStore(transport);
    await store.save(session("t1"));
    expect(upsertSpy).toHaveBeenCalledOnce();
    expect(store.list.value).toHaveLength(1);
  });

  it("writes through on drop", async () => {
    const transport = makeFakeTransport([session("t1")]);
    const removeSpy = vi.spyOn(transport, "remove");
    const store = await createPersistedPausedSessionsStore(transport);
    await store.drop("t1" as any);
    expect(removeSpy).toHaveBeenCalledWith("t1");
  });

  it("falls back to localStorage backup on transport save failure", async () => {
    const transport = makeFakeTransport();
    transport.upsert = vi.fn().mockRejectedValue(new Error("network down"));
    const store = await createPersistedPausedSessionsStore(transport);
    await store.save(session("t1"));
    // Save still updates the in-memory list
    expect(store.list.value).toHaveLength(1);
    // localStorage backup contains it
    const backup = JSON.parse(localStorage.getItem("on-the-go:paused-backup") ?? "{}");
    expect(backup.t1).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test persistedPausedSessionsStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the persisted store**

```ts
// apps/web/src/onTheGo/state/persistedPausedSessionsStore.ts
import type { ThreadId } from "@t3tools/contracts";
import type { PausedSession } from "../types";
import { createInMemoryPausedSessionsStore, type PausedSessionsStore } from "./pausedSessionsStore";

const BACKUP_KEY = "on-the-go:paused-backup";

export interface PausedSessionsTransport {
  loadAll(): Promise<PausedSession[]>;
  upsert(session: PausedSession): Promise<void>;
  remove(threadId: ThreadId): Promise<void>;
}

export async function createPersistedPausedSessionsStore(
  transport: PausedSessionsTransport,
): Promise<PausedSessionsStore> {
  const inMemory = createInMemoryPausedSessionsStore();

  // Hydrate from transport on construction.
  const initial = await transport.loadAll();
  for (const s of initial) {
    await inMemory.save(s);
  }

  return {
    list: inMemory.list,
    async save(session) {
      await inMemory.save(session);
      try {
        await transport.upsert(session);
      } catch {
        backupToLocalStorage(session);
      }
    },
    async restore(threadId) {
      return inMemory.restore(threadId);
    },
    async drop(threadId) {
      await inMemory.drop(threadId);
      try {
        await transport.remove(threadId);
      } catch {
        // Best-effort; the in-memory state is the source of truth for this session.
      }
    },
  };
}

function backupToLocalStorage(session: PausedSession): void {
  if (typeof localStorage === "undefined") return;
  const existing = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "{}");
  existing[String(session.threadId)] = session;
  localStorage.setItem(BACKUP_KEY, JSON.stringify(existing));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test persistedPausedSessionsStore`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/state/persistedPausedSessionsStore.ts apps/web/src/onTheGo/state/persistedPausedSessionsStore.test.ts
git commit -m "feat(on-the-go): persisted PausedSessionsStore with localStorage backup"
```

---

## Task 14: Orchestrator FSM — skeleton + state signal

**Files:**

- Create: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts`
- Create: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { FakeSummaryAdapter } from "../adapters/FakeSummaryAdapter";
import { createInMemoryPausedSessionsStore } from "../state/pausedSessionsStore";
import { createNotificationsStore } from "../state/notificationsStore";
import { FakeVoiceAdapter } from "../voice/FakeVoiceAdapter";
import { createOrchestrator, type OnTheGoFlowOrchestrator } from "./OnTheGoFlowOrchestrator";

describe("OnTheGoFlowOrchestrator — skeleton", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
    });
  });

  it("starts in idle state", () => {
    expect(orchestrator.state.value).toBe("idle");
  });

  it("history starts empty", () => {
    expect(orchestrator.history.value).toEqual([]);
  });

  it("caption starts empty", () => {
    expect(orchestrator.caption.value).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the skeleton**

```ts
// apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts
import type { SummaryAdapter } from "../adapters/SummaryAdapter";
import type { NotificationsStore } from "../state/notificationsStore";
import type { PausedSessionsStore } from "../state/pausedSessionsStore";
import { createSignal, type Signal } from "../state/signal";
import type { FlowState, Notification, PauseReason, Turn } from "../types";
import type { VoiceAdapter } from "../voice/VoiceAdapter";

export interface OnTheGoFlowOrchestrator {
  readonly state: Signal<FlowState>;
  readonly caption: Signal<string>;
  readonly history: Signal<Turn[]>;
  enter(notification: Notification): Promise<void>;
  resume(threadId: Notification["threadId"]): Promise<void>;
  pause(reason: PauseReason): Promise<void>;
  cancel(): Promise<void>;
  shipIt(): Promise<void>;
  cancelShip(): void;
  interruptBot(): void;
}

export type OrchestratorDeps = {
  voiceAdapter: VoiceAdapter;
  summaryAdapter: SummaryAdapter;
  notificationsStore: NotificationsStore;
  pausedSessionsStore: PausedSessionsStore;
  skill: string;
  silenceTimeoutMs?: number; // default 1500
  idleTimeoutMs?: number; // default 30000
  idleSecondPromptMs?: number; // default 15000
  countdownMs?: number; // default 3000
};

export function createOrchestrator(deps: OrchestratorDeps): OnTheGoFlowOrchestrator {
  const state = createSignal<FlowState>("idle");
  const caption = createSignal("");
  const history = createSignal<Turn[]>([]);

  // Subsequent tasks fill in the methods below.
  return {
    state,
    caption,
    history,
    async enter(_notification) {
      // implemented in Task 15
    },
    async resume(_threadId) {
      // implemented in Task 18
    },
    async pause(_reason) {
      // implemented in Task 18
    },
    async cancel() {
      // implemented in Task 19
    },
    async shipIt() {
      // implemented in Task 17
    },
    cancelShip() {
      // implemented in Task 17
    },
    interruptBot() {
      // implemented in Task 20
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts
git commit -m "feat(on-the-go): orchestrator skeleton + signals"
```

---

## Task 15: Orchestrator — `enter()` → summarizing → conversing entry

**Files:**

- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts`
- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to the test file:

```ts
// (continue in OnTheGoFlowOrchestrator.test.ts)
const sampleNotification = (): Notification => ({
  threadId: "t1" as any,
  threadTitle: "Test",
  status: "awaiting",
  agentLastMessage: "I added the OAuth callback. Tests pass.",
  userLastMessage: "add oauth callback",
  updatedAt: 1,
});

import type { Notification } from "../types";

describe("OnTheGoFlowOrchestrator — enter", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter({ summary: "TLDR: callback added, tests pass." });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
    });
  });

  it("transitions idle → entering → summarizing → conversing on enter", async () => {
    voice.queueListen(""); // first listen call gets parked here
    const states: FlowState[] = [];
    orchestrator.state.subscribe((s) => states.push(s));
    void orchestrator.enter(sampleNotification());
    // Allow promises to flush
    await Promise.resolve();
    await Promise.resolve();
    expect(states).toContain("entering");
    expect(states).toContain("summarizing");
    expect(states[states.length - 1]).toBe("conversing");
  });

  it("calls summaryAdapter.summarize with agent and user messages", async () => {
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    expect(summary.summarizeCalls).toHaveLength(1);
    expect(summary.summarizeCalls[0]!.agentMessage).toBe("I added the OAuth callback. Tests pass.");
    expect(summary.summarizeCalls[0]!.userMessage).toBe("add oauth callback");
  });

  it("speaks the summary", async () => {
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    expect(voice.spokenTexts[0]).toBe("TLDR: callback added, tests pass.");
  });

  it("rejects enter() if not in idle state", async () => {
    voice.queueListen("");
    void orchestrator.enter(sampleNotification());
    await Promise.resolve();
    await expect(orchestrator.enter(sampleNotification())).rejects.toThrow(/not in idle/i);
  });
});

import type { FlowState } from "../types";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: FAIL.

- [ ] **Step 3: Implement `enter` and the summarizing → conversing transition**

Inside `createOrchestrator`, add a private helper and replace the `enter` method:

```ts
// Inside createOrchestrator(deps):

let currentNotification: Notification | null = null;

const setCaption = (text: string) => caption.set(text);
const transitionTo = (next: FlowState) => state.set(next);

async function enterListenLoop(): Promise<void> {
  // Filled in by Task 16
}

return {
  state,
  caption,
  history,

  async enter(notification: Notification) {
    if (state.value !== "idle") {
      throw new Error(`Cannot enter — orchestrator is not in idle state (current: ${state.value})`);
    }
    currentNotification = notification;
    transitionTo("entering");
    transitionTo("summarizing");
    const summary = await deps.summaryAdapter.summarize({
      agentMessage: notification.agentLastMessage,
      userMessage: notification.userLastMessage,
    });
    setCaption(summary);
    history.set([{ role: "assistant", text: summary, at: Date.now() }]);
    await deps.voiceAdapter.speak(summary);
    transitionTo("conversing");
    await enterListenLoop();
  },

  // ... other methods stay as no-ops for now
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: PASS — all enter-tests + skeleton tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts
git commit -m "feat(on-the-go): orchestrator enter → summarizing → conversing"
```

---

## Task 16: Orchestrator — conversing turn-taking loop

**Files:**

- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts`
- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts`

- [ ] **Step 1: Add failing tests for the turn-taking loop**

```ts
describe("OnTheGoFlowOrchestrator — conversing loop", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter({
      summary: "summary",
      replies: ["bot reply 1", "bot reply 2"],
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
    });
  });

  it("appends user turn + bot turn to history when listen returns text", async () => {
    voice.queueListen("user turn 1");
    voice.queueListen(""); // park subsequent listen so test ends
    void orchestrator.enter(sampleNotification());
    // Drain microtasks so the listen and reply complete
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(orchestrator.history.value.map((t) => t.text)).toEqual([
      "summary",
      "user turn 1",
      "bot reply 1",
    ]);
  });

  it("does not exit conversing on each turn — stays in the loop", async () => {
    voice.queueListen("user turn 1");
    voice.queueListen(""); // park
    await orchestrator.enter(sampleNotification());
    expect(orchestrator.state.value).toBe("conversing");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: FAIL — history doesn't include user/bot turns.

- [ ] **Step 3: Implement `enterListenLoop`**

```ts
// Inside createOrchestrator, replace the empty enterListenLoop helper:

let listenAborted = false;

async function enterListenLoop(): Promise<void> {
  listenAborted = false;
  while (state.value === "conversing" && !listenAborted) {
    let userText: string;
    try {
      const result = await deps.voiceAdapter.listen({
        silenceTimeoutMs: deps.silenceTimeoutMs ?? 1500,
        onPartial: setCaption,
      });
      userText = result.finalText;
    } catch {
      // Aborted (interrupt, cancel, pause) — just exit the loop
      return;
    }
    if (!userText.trim()) continue;
    history.set([...history.value, { role: "user", text: userText, at: Date.now() }]);

    const reply = await deps.summaryAdapter.reply({
      history: history.value,
      userTurn: userText,
    });
    history.set([...history.value, { role: "assistant", text: reply, at: Date.now() }]);
    setCaption(reply);
    if (state.value !== "conversing") return;
    try {
      await deps.voiceAdapter.speak(reply);
    } catch {
      return;
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts
git commit -m "feat(on-the-go): orchestrator conversing turn-taking loop"
```

---

## Task 17: Orchestrator — `shipIt` → composing → countdown → committing

**Files:**

- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts`
- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts`

> **Sending to the main thread:** the orchestrator needs to inject the optimized prompt into the actual main thread. Since the existing RPC method for this lives in `apps/web/src/rpc/` and is wired up at app boot, we accept it as a dependency function `commitPrompt: (threadId: ThreadId, prompt: string) => Promise<void>`. Phase 2 will pass the real implementation; Phase 1 tests pass a fake.

- [ ] **Step 1: Extend `OrchestratorDeps` with `commitPrompt`**

In `OnTheGoFlowOrchestrator.ts`:

```ts
export type OrchestratorDeps = {
  voiceAdapter: VoiceAdapter;
  summaryAdapter: SummaryAdapter;
  notificationsStore: NotificationsStore;
  pausedSessionsStore: PausedSessionsStore;
  skill: string;
  commitPrompt: (threadId: Notification["threadId"], prompt: string) => Promise<void>;
  silenceTimeoutMs?: number;
  idleTimeoutMs?: number;
  idleSecondPromptMs?: number;
  countdownMs?: number;
};
```

Update existing tests to pass a `commitPrompt` (use `vi.fn().mockResolvedValue(undefined)`).

- [ ] **Step 2: Add failing tests**

```ts
describe("OnTheGoFlowOrchestrator — shipIt", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let commitPrompt: ReturnType<typeof vi.fn>;
  let notificationsStore: ReturnType<typeof createNotificationsStore>;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter({
      summary: "summary",
      replies: ["bot reply"],
      composedPrompt: "Wire up the OAuth redirect.",
    });
    commitPrompt = vi.fn().mockResolvedValue(undefined);
    notificationsStore = createNotificationsStore();
    notificationsStore.add(sampleNotification());
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore,
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 50, // fast for tests
    });
  });

  it("transitions conversing → composing → countdown → committing → idle", async () => {
    const states: FlowState[] = [];
    orchestrator.state.subscribe((s) => states.push(s));
    voice.queueListen("user turn");
    voice.queueListen("");
    void orchestrator.enter(sampleNotification());
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await orchestrator.shipIt();
    expect(states).toContain("composing");
    expect(states).toContain("countdown");
    expect(states).toContain("committing");
    expect(orchestrator.state.value).toBe("idle");
  });

  it("invokes summaryAdapter.composePrompt with current history and skill", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    await orchestrator.shipIt();
    expect(summary.composeCalls).toHaveLength(1);
    expect(summary.composeCalls[0]!.skill).toBe("skill text");
  });

  it("sends the composed prompt to commitPrompt", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    await orchestrator.shipIt();
    expect(commitPrompt).toHaveBeenCalledWith("t1", "Wire up the OAuth redirect.");
  });

  it("dismisses the notification after successful commit", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    await orchestrator.shipIt();
    expect(notificationsStore.notifications.value).toHaveLength(0);
  });

  it("cancelShip() during countdown returns to conversing without committing", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    voice.queueListen(""); // for next listen after cancel
    await orchestrator.enter(sampleNotification());
    const ship = orchestrator.shipIt();
    // Wait until we hit countdown
    await new Promise((r) => setTimeout(r, 10));
    orchestrator.cancelShip();
    await ship;
    expect(commitPrompt).not.toHaveBeenCalled();
    expect(orchestrator.state.value).toBe("conversing");
  });

  it("falls back to envelope-wrapped verbatim transcript when composePrompt fails", async () => {
    summary = new FakeSummaryAdapter({
      summary: "summary",
      replies: ["bot reply"],
      failOn: "composePrompt",
    });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore,
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt,
      countdownMs: 50,
    });
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    await orchestrator.shipIt();
    expect(commitPrompt).toHaveBeenCalledOnce();
    const sent = commitPrompt.mock.calls[0]![1] as string;
    expect(sent).toContain("On-the-go composer offline");
    expect(sent).toContain("user turn");
    expect(sent).toContain("bot reply");
  });
});

import { vi } from "vitest";
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: FAIL — `shipIt` not implemented.

- [ ] **Step 4: Implement `shipIt`, `cancelShip`, and the envelope fallback**

```ts
// Inside createOrchestrator:

let shipCancelToken: { cancelled: boolean } | null = null;

function buildVerbatimEnvelope(turns: Turn[]): string {
  const lines = turns.map((t) =>
    t.role === "user" ? `You: ${t.text}` : `On-the-go assistant: ${t.text}`,
  );
  return [
    "[On-the-go composer offline — sending raw side-conversation transcript.",
    "The user was drafting their next instruction. Please read the conversation,",
    "synthesize what they want, and proceed.]",
    "",
    ...lines,
  ].join("\n");
}

async function runCountdownAndCommit(prompt: string): Promise<void> {
  if (!currentNotification) return;
  transitionTo("countdown");
  shipCancelToken = { cancelled: false };
  setCaption(`Sending: ${prompt}`);
  // Speak the preview but don't await — the countdown timer is what matters.
  void deps.voiceAdapter.speak(`Sending: ${prompt}. Tap cancel to abort.`);
  const token = shipCancelToken;
  await new Promise<void>((resolve) => setTimeout(resolve, deps.countdownMs ?? 3000));
  if (token.cancelled) {
    deps.voiceAdapter.interrupt();
    transitionTo("conversing");
    await enterListenLoop();
    return;
  }
  transitionTo("committing");
  try {
    await deps.commitPrompt(currentNotification.threadId, prompt);
    deps.notificationsStore.dismiss(currentNotification.threadId);
    transitionTo("idle");
    currentNotification = null;
    history.set([]);
  } catch {
    transitionTo("conversing");
    setCaption("Couldn't deliver to main thread. Tap to retry or pause.");
    await enterListenLoop();
  }
}

return {
  // ...

  async shipIt() {
    if (state.value !== "conversing") return;
    deps.voiceAdapter.interrupt();
    transitionTo("composing");
    let prompt: string;
    try {
      prompt = await deps.summaryAdapter.composePrompt({
        history: history.value,
        skill: deps.skill,
      });
      if (!prompt.trim()) throw new Error("empty prompt");
    } catch {
      prompt = buildVerbatimEnvelope(history.value);
    }
    await runCountdownAndCommit(prompt);
  },

  cancelShip() {
    if (shipCancelToken && state.value === "countdown") {
      shipCancelToken.cancelled = true;
    }
  },

  // ...
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts
git commit -m "feat(on-the-go): orchestrator shipIt, countdown, commit, and envelope fallback"
```

---

## Task 18: Orchestrator — pause/resume

**Files:**

- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts`
- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe("OnTheGoFlowOrchestrator — pause/resume", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let pausedStore: ReturnType<typeof createInMemoryPausedSessionsStore>;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter({ summary: "summary", replies: ["bot reply"] });
    pausedStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: pausedStore,
      skill: "skill text",
      commitPrompt: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("pause() saves the session and returns to idle", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    await orchestrator.pause("manual");
    expect(orchestrator.state.value).toBe("idle");
    expect(pausedStore.list.value).toHaveLength(1);
    expect(pausedStore.list.value[0]!.history.length).toBeGreaterThan(0);
    expect(pausedStore.list.value[0]!.pauseReason).toBe("manual");
  });

  it("resume() restores history and re-enters conversing", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    await orchestrator.pause("manual");
    voice.queueListen(""); // park next listen
    await orchestrator.resume("t1" as any);
    expect(orchestrator.history.value.length).toBeGreaterThan(0);
    expect(orchestrator.state.value).toBe("conversing");
    expect(pausedStore.list.value).toHaveLength(0); // dropped after resume
  });

  it("resume() speaks a context-restore prompt", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    await orchestrator.pause("manual");
    voice.queueListen("");
    voice.spokenTexts.length = 0;
    await orchestrator.resume("t1" as any);
    expect(voice.spokenTexts[0]).toMatch(/welcome back/i);
  });

  it("pause() with no notification active is a no-op", async () => {
    await orchestrator.pause("manual");
    expect(pausedStore.list.value).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: FAIL.

- [ ] **Step 3: Implement `pause` and `resume`**

```ts
// Inside createOrchestrator:

async pause(reason) {
  if (!currentNotification || state.value === "idle") return;
  deps.voiceAdapter.interrupt();
  listenAborted = true;
  await deps.pausedSessionsStore.save({
    threadId: currentNotification.threadId,
    notification: currentNotification,
    history: history.value,
    pendingDraft: history.value[history.value.length - 1]?.text,
    pausedAt: Date.now(),
    pauseReason: reason,
  });
  transitionTo("idle");
  currentNotification = null;
  history.set([]);
  setCaption("");
},

async resume(threadId) {
  if (state.value !== "idle") {
    throw new Error(`Cannot resume — orchestrator is not in idle state (current: ${state.value})`);
  }
  const session = await deps.pausedSessionsStore.restore(threadId);
  currentNotification = session.notification;
  history.set(session.history);
  await deps.pausedSessionsStore.drop(threadId);
  transitionTo("conversing");
  const lastTurn = session.history[session.history.length - 1];
  const restorePrompt = lastTurn
    ? `Welcome back. Last we said: ${lastTurn.text}`
    : "Welcome back.";
  setCaption(restorePrompt);
  await deps.voiceAdapter.speak(restorePrompt);
  await enterListenLoop();
},
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts
git commit -m "feat(on-the-go): orchestrator pause/resume with context-restore prompt"
```

---

## Task 19: Orchestrator — universal `cancel()`

**Files:**

- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts`
- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe("OnTheGoFlowOrchestrator — cancel", () => {
  // Use the same beforeEach setup as previous describe blocks.
  // Variables are re-declared here for clarity.
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter({ summary: "summary", replies: ["bot reply"] });
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: createInMemoryPausedSessionsStore(),
      skill: "skill text",
      commitPrompt: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("cancel() during conversing returns to idle without saving paused", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    await orchestrator.cancel();
    expect(orchestrator.state.value).toBe("idle");
    expect(orchestrator.history.value).toEqual([]);
  });

  it("cancel() interrupts the voice adapter", async () => {
    voice.queueListen("user turn");
    voice.queueListen("");
    await orchestrator.enter(sampleNotification());
    const before = voice.interruptCount;
    await orchestrator.cancel();
    expect(voice.interruptCount).toBeGreaterThan(before);
  });

  it("cancel() from idle is a no-op", async () => {
    await orchestrator.cancel();
    expect(orchestrator.state.value).toBe("idle");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: FAIL.

- [ ] **Step 3: Implement `cancel`**

```ts
// Inside createOrchestrator:

async cancel() {
  if (state.value === "idle") return;
  deps.voiceAdapter.interrupt();
  listenAborted = true;
  if (shipCancelToken) shipCancelToken.cancelled = true;
  transitionTo("idle");
  currentNotification = null;
  history.set([]);
  setCaption("");
},
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts
git commit -m "feat(on-the-go): orchestrator universal cancel"
```

---

## Task 20: Orchestrator — bot interruption + idle timeout

**Files:**

- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts`
- Modify: `apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe("OnTheGoFlowOrchestrator — interrupt + idle timeout", () => {
  let voice: FakeVoiceAdapter;
  let summary: FakeSummaryAdapter;
  let pausedStore: ReturnType<typeof createInMemoryPausedSessionsStore>;
  let orchestrator: OnTheGoFlowOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers();
    voice = new FakeVoiceAdapter();
    summary = new FakeSummaryAdapter({ summary: "summary", replies: ["reply"] });
    pausedStore = createInMemoryPausedSessionsStore();
    orchestrator = createOrchestrator({
      voiceAdapter: voice,
      summaryAdapter: summary,
      notificationsStore: createNotificationsStore(),
      pausedSessionsStore: pausedStore,
      skill: "skill text",
      commitPrompt: vi.fn().mockResolvedValue(undefined),
      idleTimeoutMs: 1000,
      idleSecondPromptMs: 500,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("interruptBot() interrupts mid-TTS and re-enters listen", async () => {
    voice.holdSpeak = true;
    voice.queueListen("");
    void orchestrator.enter(sampleNotification());
    await Promise.resolve();
    const before = voice.interruptCount;
    orchestrator.interruptBot();
    expect(voice.interruptCount).toBeGreaterThan(before);
  });

  it("idle timeout — first elapse triggers 'still there?'", async () => {
    voice.queueListen(""); // park forever
    void orchestrator.enter(sampleNotification());
    for (let i = 0; i < 10; i++) await Promise.resolve();
    voice.spokenTexts.length = 0;
    await vi.advanceTimersByTimeAsync(1000);
    expect(voice.spokenTexts.some((t) => /still there/i.test(t))).toBe(true);
  });

  it("idle timeout — second elapse auto-pauses", async () => {
    voice.queueListen(""); // park
    await orchestrator.enter(sampleNotification());
    await vi.advanceTimersByTimeAsync(1000); // first
    await vi.advanceTimersByTimeAsync(500); // second
    expect(orchestrator.state.value).toBe("idle");
    expect(pausedStore.list.value).toHaveLength(1);
    expect(pausedStore.list.value[0]!.pauseReason).toBe("idle-timeout");
  });
});

import { afterEach } from "vitest";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: FAIL.

- [ ] **Step 3: Implement `interruptBot` + idle timeout in `enterListenLoop`**

Update `enterListenLoop` to handle idle timeout, and add the `interruptBot` method:

```ts
// Inside createOrchestrator:

async function enterListenLoop(): Promise<void> {
  listenAborted = false;
  while (state.value === "conversing" && !listenAborted) {
    let userText: string;
    try {
      const idleTimeout = deps.idleTimeoutMs ?? 30_000;
      const secondPromptMs = deps.idleSecondPromptMs ?? 15_000;

      // Wrap the listen call with an idle timer.
      const listenPromise = deps.voiceAdapter.listen({
        silenceTimeoutMs: deps.silenceTimeoutMs ?? 1500,
        onPartial: setCaption,
      });
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const idlePromise = new Promise<{ idle: true }>((resolve) => {
        idleTimer = setTimeout(() => resolve({ idle: true }), idleTimeout);
      });
      const result = await Promise.race([
        listenPromise.then((r) => ({ idle: false as const, finalText: r.finalText })),
        idlePromise,
      ]);
      if (idleTimer) clearTimeout(idleTimer);

      if (result.idle === true) {
        // First idle timeout — speak "still there?"
        listenPromise.abort();
        await deps.voiceAdapter.speak("Still there?");
        // Second listen with a shorter timeout
        const second = await Promise.race([
          deps.voiceAdapter
            .listen({ silenceTimeoutMs: deps.silenceTimeoutMs ?? 1500, onPartial: setCaption })
            .then((r) => ({ idle: false as const, finalText: r.finalText })),
          new Promise<{ idle: true }>((resolve) =>
            setTimeout(() => resolve({ idle: true }), secondPromptMs),
          ),
        ]);
        if (second.idle === true) {
          await this.pause("idle-timeout");
          return;
        }
        userText = second.finalText;
      } else {
        userText = result.finalText;
      }
    } catch {
      return;
    }
    if (!userText.trim()) continue;
    history.set([...history.value, { role: "user", text: userText, at: Date.now() }]);

    const reply = await deps.summaryAdapter.reply({
      history: history.value,
      userTurn: userText,
    });
    history.set([...history.value, { role: "assistant", text: reply, at: Date.now() }]);
    setCaption(reply);
    if (state.value !== "conversing") return;
    try {
      await deps.voiceAdapter.speak(reply);
    } catch {
      return;
    }
  }
}

return {
  // ...
  interruptBot() {
    if (state.value !== "conversing") return;
    deps.voiceAdapter.interrupt();
  },
  // ...
};
```

> **Note:** the `this.pause(...)` call inside the loop won't work as written because `this` doesn't refer to the orchestrator object inside the helper. Refactor: hoist a local `pause(reason)` function and call that instead. Adjust accordingly.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test OnTheGoFlowOrchestrator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.ts apps/web/src/onTheGo/flow/OnTheGoFlowOrchestrator.test.ts
git commit -m "feat(on-the-go): orchestrator interruptBot and idle timeout with auto-pause"
```

---

## Task 21: `BrowserVoiceAdapter` — TTS

**Files:**

- Create: `apps/web/src/onTheGo/voice/BrowserVoiceAdapter.ts`
- Create: `apps/web/src/onTheGo/voice/BrowserVoiceAdapter.browser.test.ts`

> **Browser-mode tests:** these use `vitest.browser.config.ts`. Tests mock `window.speechSynthesis` and `webkitSpeechRecognition` so they run deterministically.

- [ ] **Step 1: Write the failing test (TTS)**

```ts
// apps/web/src/onTheGo/voice/BrowserVoiceAdapter.browser.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserVoiceAdapter } from "./BrowserVoiceAdapter";

describe("BrowserVoiceAdapter — TTS", () => {
  let speakSpy: ReturnType<typeof vi.fn>;
  let cancelSpy: ReturnType<typeof vi.fn>;
  let utteranceListeners: Map<string, Function>;

  beforeEach(() => {
    utteranceListeners = new Map();
    speakSpy = vi.fn().mockImplementation((utt: any) => {
      // Auto-fire onend on next tick
      setTimeout(() => utteranceListeners.get("end")?.(), 0);
    });
    cancelSpy = vi.fn();
    (window as any).speechSynthesis = { speak: speakSpy, cancel: cancelSpy };
    (window as any).SpeechSynthesisUtterance = vi.fn().mockImplementation((text: string) => {
      const obj: any = { text };
      Object.defineProperty(obj, "onstart", {
        set(fn) {
          utteranceListeners.set("start", fn);
        },
      });
      Object.defineProperty(obj, "onend", {
        set(fn) {
          utteranceListeners.set("end", fn);
        },
      });
      return obj;
    });
  });

  afterEach(() => {
    delete (window as any).speechSynthesis;
    delete (window as any).SpeechSynthesisUtterance;
  });

  it("calls speechSynthesis.speak with the text", async () => {
    const v = new BrowserVoiceAdapter();
    await v.speak("hello world");
    expect(speakSpy).toHaveBeenCalledOnce();
    const utt = speakSpy.mock.calls[0]![0];
    expect(utt.text).toBe("hello world");
  });

  it("resolves after onend fires", async () => {
    const v = new BrowserVoiceAdapter();
    const p = v.speak("hi");
    await expect(p).resolves.toBeUndefined();
  });

  it("interrupt() cancels in-progress speech", () => {
    const v = new BrowserVoiceAdapter();
    void v.speak("long text");
    v.interrupt();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test:browser BrowserVoiceAdapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TTS half of `BrowserVoiceAdapter`**

```ts
// apps/web/src/onTheGo/voice/BrowserVoiceAdapter.ts
import { abortable, type AbortablePromise } from "../abortable";
import type { ListenOptions, ListenResult, SpeakOptions, VoiceAdapter } from "./VoiceAdapter";

export class BrowserVoiceAdapter implements VoiceAdapter {
  speak(text: string, opts?: SpeakOptions): AbortablePromise<void> {
    return abortable<void>((resolve, reject) => {
      const synth = (window as any).speechSynthesis;
      const Utterance = (window as any).SpeechSynthesisUtterance;
      if (!synth || !Utterance) {
        reject(new Error("SpeechSynthesis not supported"));
        return;
      }
      const utt = new Utterance(text);
      utt.onstart = () => opts?.onStart?.();
      utt.onend = () => {
        opts?.onEnd?.();
        resolve();
      };
      utt.onerror = (e: any) => reject(new Error(`speech error: ${e?.error ?? "unknown"}`));
      synth.speak(utt);
      return () => {
        synth.cancel();
      };
    });
  }

  listen(_opts: ListenOptions): AbortablePromise<ListenResult> {
    // Implemented in Task 22
    return abortable<ListenResult>(() => {});
  }

  interrupt(): void {
    if ((window as any).speechSynthesis) {
      (window as any).speechSynthesis.cancel();
    }
  }

  destroy(): void {
    this.interrupt();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test:browser BrowserVoiceAdapter`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/voice/BrowserVoiceAdapter.ts apps/web/src/onTheGo/voice/BrowserVoiceAdapter.browser.test.ts
git commit -m "feat(on-the-go): BrowserVoiceAdapter TTS implementation"
```

---

## Task 22: `BrowserVoiceAdapter` — STT + silence detection

**Files:**

- Modify: `apps/web/src/onTheGo/voice/BrowserVoiceAdapter.ts`
- Modify: `apps/web/src/onTheGo/voice/BrowserVoiceAdapter.browser.test.ts`

- [ ] **Step 1: Add failing tests for STT**

```ts
describe("BrowserVoiceAdapter — STT", () => {
  let recognition: any;

  beforeEach(() => {
    recognition = {
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    (window as any).webkitSpeechRecognition = vi.fn().mockReturnValue(recognition);
  });

  afterEach(() => {
    delete (window as any).webkitSpeechRecognition;
  });

  it("starts recognition on listen", () => {
    const v = new BrowserVoiceAdapter();
    void v.listen({ silenceTimeoutMs: 1500 });
    expect(recognition.start).toHaveBeenCalled();
  });

  it("resolves with finalText after silence timeout elapses post-partial", async () => {
    vi.useFakeTimers();
    const v = new BrowserVoiceAdapter();
    const p = v.listen({ silenceTimeoutMs: 1500 });
    // Simulate a partial result event
    const handler = (recognition.addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "result",
    )[1];
    handler({ results: [[{ transcript: "hello world", isFinal: false }]], resultIndex: 0 });
    vi.advanceTimersByTime(1500);
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.finalText).toBe("hello world");
    vi.useRealTimers();
  });

  it("interrupt() aborts recognition", () => {
    const v = new BrowserVoiceAdapter();
    void v.listen({ silenceTimeoutMs: 1500 });
    v.interrupt();
    expect(recognition.abort).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test:browser BrowserVoiceAdapter`
Expected: FAIL — `listen` not implemented.

- [ ] **Step 3: Implement STT in `BrowserVoiceAdapter`**

```ts
// Inside BrowserVoiceAdapter, replace listen():

private currentRecognition: any = null;

listen(opts: ListenOptions): AbortablePromise<ListenResult> {
  return abortable<ListenResult>((resolve, reject) => {
    const Recognition = (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      reject(new Error("SpeechRecognition not supported"));
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    this.currentRecognition = recognition;

    let lastText = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        recognition.stop();
        resolve({ finalText: lastText.trim() });
      }, opts.silenceTimeoutMs);
    };

    const onResult = (event: any) => {
      const transcripts: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcripts.push(event.results[i][0].transcript);
      }
      const text = transcripts.join(" ");
      lastText = text;
      opts.onPartial?.(text);
      resetSilenceTimer();
    };
    const onError = (event: any) => {
      reject(new Error(`recognition error: ${event?.error ?? "unknown"}`));
    };
    recognition.addEventListener("result", onResult);
    recognition.addEventListener("error", onError);
    recognition.start();

    return () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      recognition.removeEventListener("result", onResult);
      recognition.removeEventListener("error", onError);
      recognition.abort();
      this.currentRecognition = null;
    };
  });
}

interrupt(): void {
  if ((window as any).speechSynthesis) {
    (window as any).speechSynthesis.cancel();
  }
  if (this.currentRecognition) {
    this.currentRecognition.abort();
    this.currentRecognition = null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test:browser BrowserVoiceAdapter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/voice/BrowserVoiceAdapter.ts apps/web/src/onTheGo/voice/BrowserVoiceAdapter.browser.test.ts
git commit -m "feat(on-the-go): BrowserVoiceAdapter STT with silence detection"
```

---

## Task 23: `BrowserVoiceAdapter` — Page Visibility integration

**Files:**

- Modify: `apps/web/src/onTheGo/voice/BrowserVoiceAdapter.ts`
- Modify: `apps/web/src/onTheGo/voice/BrowserVoiceAdapter.browser.test.ts`

- [ ] **Step 1: Add failing test**

```ts
describe("BrowserVoiceAdapter — Page Visibility", () => {
  it("aborts in-flight listen when document becomes hidden", () => {
    const recognition = {
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    (window as any).webkitSpeechRecognition = vi.fn().mockReturnValue(recognition);
    const v = new BrowserVoiceAdapter();
    void v.listen({ silenceTimeoutMs: 1500 });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(recognition.abort).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --cwd apps/web test:browser BrowserVoiceAdapter`
Expected: FAIL.

- [ ] **Step 3: Add visibility listener in constructor**

```ts
// In BrowserVoiceAdapter:

constructor() {
  if (typeof document !== "undefined") {
    this.visibilityHandler = () => {
      if (document.hidden) this.interrupt();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }
}

private visibilityHandler?: () => void;

destroy(): void {
  this.interrupt();
  if (this.visibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.visibilityHandler = undefined;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --cwd apps/web test:browser BrowserVoiceAdapter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/voice/BrowserVoiceAdapter.ts apps/web/src/onTheGo/voice/BrowserVoiceAdapter.browser.test.ts
git commit -m "feat(on-the-go): BrowserVoiceAdapter aborts on visibility hidden"
```

---

## Task 24: `OpenAIAdapter`

**Files:**

- Create: `apps/web/src/onTheGo/adapters/OpenAIAdapter.ts`
- Create: `apps/web/src/onTheGo/adapters/OpenAIAdapter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/onTheGo/adapters/OpenAIAdapter.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidApiKeyError, RateLimitError } from "./SummaryAdapter";
import { OpenAIAdapter } from "./OpenAIAdapter";

describe("OpenAIAdapter", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockJsonResponse(body: any, status = 200) {
    (global.fetch as any).mockResolvedValueOnce({
      ok: status < 400,
      status,
      json: async () => body,
      headers: new Headers(),
    });
  }

  it("summarize calls /chat/completions with model and Authorization header", async () => {
    mockJsonResponse({ choices: [{ message: { content: "tldr" } }] });
    const a = new OpenAIAdapter({ apiKey: "sk-x", model: "gpt-4o-mini" });
    const result = await a.summarize({ agentMessage: "agent", userMessage: "user" });
    expect(result).toBe("tldr");
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toContain("/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-x");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("composePrompt uses the skill string as system prompt", async () => {
    mockJsonResponse({ choices: [{ message: { content: "optimized" } }] });
    const a = new OpenAIAdapter({ apiKey: "sk-x" });
    await a.composePrompt({ history: [{ role: "user", text: "hi", at: 1 }], skill: "SKILL TEXT" });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe("SKILL TEXT");
  });

  it("throws InvalidApiKeyError on 401", async () => {
    mockJsonResponse({ error: { message: "bad key" } }, 401);
    const a = new OpenAIAdapter({ apiKey: "sk-x" });
    await expect(a.summarize({ agentMessage: "", userMessage: "" })).rejects.toBeInstanceOf(
      InvalidApiKeyError,
    );
  });

  it("throws RateLimitError on 429", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
      headers: new Headers({ "retry-after": "30" }),
    });
    const a = new OpenAIAdapter({ apiKey: "sk-x" });
    await expect(a.summarize({ agentMessage: "", userMessage: "" })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });

  it("retries once on network error then succeeds", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("network"));
    mockJsonResponse({ choices: [{ message: { content: "ok" } }] });
    const a = new OpenAIAdapter({ apiKey: "sk-x" });
    const result = await a.summarize({ agentMessage: "", userMessage: "" });
    expect(result).toBe("ok");
    expect((global.fetch as any).mock.calls.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test OpenAIAdapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `OpenAIAdapter`**

```ts
// apps/web/src/onTheGo/adapters/OpenAIAdapter.ts
import type { Turn } from "../types";
import {
  InvalidApiKeyError,
  RateLimitError,
  type ComposePromptInput,
  type ReplyInput,
  type SummarizeInput,
  type SummaryAdapter,
} from "./SummaryAdapter";

export type OpenAIAdapterConfig = {
  apiKey: string;
  model?: string;
  endpoint?: string;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 15_000;

const SUMMARIZE_SYSTEM =
  "You are a concise voice assistant summarizing the output of a coding agent for a user who is on the go. Speak in 1-2 short sentences. No preamble.";
const REPLY_SYSTEM =
  "You are a friendly voice assistant helping the user formulate their next instruction for the coding agent. Keep replies short (1-2 sentences). Ask one question at a time.";

export class OpenAIAdapter implements SummaryAdapter {
  constructor(private config: OpenAIAdapterConfig) {}

  async summarize(input: SummarizeInput): Promise<string> {
    return this.completion([
      { role: "system", content: SUMMARIZE_SYSTEM },
      {
        role: "user",
        content: `The agent finished its turn. Agent's message:\n${input.agentMessage}\n\nUser's last instruction was:\n${input.userMessage}\n\nGive a TL;DR in 1-2 sentences and end with a single short clarifying question.`,
      },
    ]);
  }

  async reply(input: ReplyInput): Promise<string> {
    return this.completion([
      { role: "system", content: REPLY_SYSTEM },
      ...input.history.map((t) => ({
        role: t.role === "assistant" ? "assistant" : "user",
        content: t.text,
      })),
      { role: "user", content: input.userTurn },
    ]);
  }

  async composePrompt(input: ComposePromptInput): Promise<string> {
    return this.completion(
      [
        { role: "system", content: input.skill },
        {
          role: "user",
          content: `Side-conversation transcript:\n${formatHistory(input.history)}\n\nProduce the optimized prompt.`,
        },
      ],
      // Composing wants determinism; use temperature 0 for this call.
      { temperature: 0 },
    );
  }

  private async completion(
    messages: Array<{ role: string; content: string }>,
    extra: Record<string, any> = {},
  ): Promise<string> {
    let attempt = 0;
    while (true) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(this.config.endpoint ?? DEFAULT_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model ?? DEFAULT_MODEL,
            messages,
            ...extra,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.status === 401 || res.status === 403) {
          throw new InvalidApiKeyError("openai");
        }
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after")) || undefined;
          throw new RateLimitError(retryAfter);
        }
        if (!res.ok) {
          throw new Error(`OpenAI ${res.status}`);
        }
        const data: any = await res.json();
        return data.choices?.[0]?.message?.content ?? "";
      } catch (e) {
        if (e instanceof InvalidApiKeyError || e instanceof RateLimitError) throw e;
        if (attempt === 0) {
          attempt++;
          await new Promise((r) => setTimeout(r, 200 + Math.random() * 800));
          continue;
        }
        throw e;
      }
    }
  }
}

function formatHistory(history: Turn[]): string {
  return history.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test OpenAIAdapter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/adapters/OpenAIAdapter.ts apps/web/src/onTheGo/adapters/OpenAIAdapter.test.ts
git commit -m "feat(on-the-go): OpenAIAdapter with retry and error mapping"
```

---

## Task 25: `AnthropicAdapter` (with prompt caching)

**Files:**

- Create: `apps/web/src/onTheGo/adapters/AnthropicAdapter.ts`
- Create: `apps/web/src/onTheGo/adapters/AnthropicAdapter.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/onTheGo/adapters/AnthropicAdapter.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicAdapter } from "./AnthropicAdapter";
import { InvalidApiKeyError, RateLimitError } from "./SummaryAdapter";

describe("AnthropicAdapter", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockResponse(body: any, status = 200) {
    (global.fetch as any).mockResolvedValueOnce({
      ok: status < 400,
      status,
      json: async () => body,
      headers: new Headers(),
    });
  }

  it("summarize calls /messages with x-api-key header", async () => {
    mockResponse({ content: [{ type: "text", text: "tldr" }] });
    const a = new AnthropicAdapter({ apiKey: "sk-ant" });
    const result = await a.summarize({ agentMessage: "agent", userMessage: "user" });
    expect(result).toBe("tldr");
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toContain("/messages");
    expect(init.headers["x-api-key"]).toBe("sk-ant");
  });

  it("composePrompt sends skill as system block with cache_control: ephemeral", async () => {
    mockResponse({ content: [{ type: "text", text: "ok" }] });
    const a = new AnthropicAdapter({ apiKey: "sk-ant" });
    await a.composePrompt({ history: [{ role: "user", text: "hi", at: 1 }], skill: "SKILL" });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(Array.isArray(body.system)).toBe(true);
    expect(body.system[0].type).toBe("text");
    expect(body.system[0].text).toBe("SKILL");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("throws InvalidApiKeyError on 401", async () => {
    mockResponse({}, 401);
    const a = new AnthropicAdapter({ apiKey: "sk-ant" });
    await expect(a.summarize({ agentMessage: "", userMessage: "" })).rejects.toBeInstanceOf(
      InvalidApiKeyError,
    );
  });

  it("throws RateLimitError on 429", async () => {
    mockResponse({}, 429);
    const a = new AnthropicAdapter({ apiKey: "sk-ant" });
    await expect(a.summarize({ agentMessage: "", userMessage: "" })).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test AnthropicAdapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `AnthropicAdapter`**

```ts
// apps/web/src/onTheGo/adapters/AnthropicAdapter.ts
import type { Turn } from "../types";
import {
  InvalidApiKeyError,
  RateLimitError,
  type ComposePromptInput,
  type ReplyInput,
  type SummarizeInput,
  type SummaryAdapter,
} from "./SummaryAdapter";

export type AnthropicAdapterConfig = {
  apiKey: string;
  model?: string;
  endpoint?: string;
};

const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 15_000;

const SUMMARIZE_SYSTEM =
  "You are a concise voice assistant summarizing the output of a coding agent for a user who is on the go. Speak in 1-2 short sentences. No preamble.";
const REPLY_SYSTEM =
  "You are a friendly voice assistant helping the user formulate their next instruction for the coding agent. Keep replies short (1-2 sentences). Ask one question at a time.";

export class AnthropicAdapter implements SummaryAdapter {
  constructor(private config: AnthropicAdapterConfig) {}

  async summarize(input: SummarizeInput): Promise<string> {
    return this.message({
      system: SUMMARIZE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `The agent finished its turn. Agent's message:\n${input.agentMessage}\n\nUser's last instruction was:\n${input.userMessage}\n\nGive a TL;DR in 1-2 sentences and end with a single short clarifying question.`,
        },
      ],
    });
  }

  async reply(input: ReplyInput): Promise<string> {
    return this.message({
      system: REPLY_SYSTEM,
      messages: [
        ...input.history.map((t) => ({
          role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: t.text,
        })),
        { role: "user" as const, content: input.userTurn },
      ],
    });
  }

  async composePrompt(input: ComposePromptInput): Promise<string> {
    return this.message({
      system: { text: input.skill, cached: true },
      messages: [
        {
          role: "user",
          content: `Side-conversation transcript:\n${formatHistory(input.history)}\n\nProduce the optimized prompt.`,
        },
      ],
      temperature: 0,
    });
  }

  private async message(args: {
    system: string | { text: string; cached: boolean };
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    temperature?: number;
  }): Promise<string> {
    const systemBlock =
      typeof args.system === "string"
        ? args.system
        : [{ type: "text", text: args.system.text, cache_control: { type: "ephemeral" as const } }];

    let attempt = 0;
    while (true) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(this.config.endpoint ?? DEFAULT_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: this.config.model ?? DEFAULT_MODEL,
            max_tokens: 1024,
            system: systemBlock,
            messages: args.messages,
            ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.status === 401 || res.status === 403) throw new InvalidApiKeyError("anthropic");
        if (res.status === 429) throw new RateLimitError();
        if (!res.ok) throw new Error(`Anthropic ${res.status}`);
        const data: any = await res.json();
        return data.content?.[0]?.text ?? "";
      } catch (e) {
        if (e instanceof InvalidApiKeyError || e instanceof RateLimitError) throw e;
        if (attempt === 0) {
          attempt++;
          await new Promise((r) => setTimeout(r, 200 + Math.random() * 800));
          continue;
        }
        throw e;
      }
    }
  }
}

function formatHistory(history: Turn[]): string {
  return history.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test AnthropicAdapter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/adapters/AnthropicAdapter.ts apps/web/src/onTheGo/adapters/AnthropicAdapter.test.ts
git commit -m "feat(on-the-go): AnthropicAdapter with prompt caching on system block"
```

---

## Task 26: `MainAgentCliAdapter` (escape hatch)

**Files:**

- Create: `apps/web/src/onTheGo/adapters/MainAgentCliAdapter.ts`
- Create: `apps/web/src/onTheGo/adapters/MainAgentCliAdapter.test.ts`

> **Note for engineer:** the existing T3 Code RPC layer has methods for invoking the configured agent CLI (Codex/Claude/OpenCode). The exact RPC method to call depends on what the contracts package exposes — search `packages/contracts/src/` for methods that spawn an ephemeral session. Wrap that in a transport interface here so the test can use a fake. The Phase 2 wire-up will provide the real implementation.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/onTheGo/adapters/MainAgentCliAdapter.test.ts
import { describe, expect, it, vi } from "vitest";
import { MainAgentCliAdapter, type MainAgentCliTransport } from "./MainAgentCliAdapter";

function makeFakeTransport(response = "fake response"): MainAgentCliTransport {
  return {
    runEphemeral: vi.fn().mockResolvedValue(response),
  };
}

describe("MainAgentCliAdapter", () => {
  it("summarize calls runEphemeral with a summarize prompt", async () => {
    const transport = makeFakeTransport("the summary");
    const a = new MainAgentCliAdapter(transport);
    const result = await a.summarize({ agentMessage: "agent", userMessage: "user" });
    expect(result).toBe("the summary");
    expect(transport.runEphemeral).toHaveBeenCalledOnce();
    const arg = (transport.runEphemeral as any).mock.calls[0][0];
    expect(arg).toContain("agent");
    expect(arg).toContain("user");
  });

  it("composePrompt embeds the skill text", async () => {
    const transport = makeFakeTransport("optimized");
    const a = new MainAgentCliAdapter(transport);
    await a.composePrompt({ history: [{ role: "user", text: "hi", at: 1 }], skill: "SKILL TEXT" });
    const arg = (transport.runEphemeral as any).mock.calls[0][0];
    expect(arg).toContain("SKILL TEXT");
  });

  it("propagates transport errors", async () => {
    const transport: MainAgentCliTransport = {
      runEphemeral: vi.fn().mockRejectedValue(new Error("CLI down")),
    };
    const a = new MainAgentCliAdapter(transport);
    await expect(a.summarize({ agentMessage: "", userMessage: "" })).rejects.toThrow(/CLI down/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run --cwd apps/web test MainAgentCliAdapter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `MainAgentCliAdapter`**

```ts
// apps/web/src/onTheGo/adapters/MainAgentCliAdapter.ts
import type { Turn } from "../types";
import type {
  ComposePromptInput,
  ReplyInput,
  SummarizeInput,
  SummaryAdapter,
} from "./SummaryAdapter";

export interface MainAgentCliTransport {
  /**
   * Run a one-shot prompt through the user's configured agent CLI (Codex/Claude/OpenCode)
   * in an ephemeral session — no persistence to a thread, no tool use, just text response.
   * Implementation lives in Phase 2 and wraps the existing effect-acp / effect-codex-app-server infra.
   */
  runEphemeral(prompt: string): Promise<string>;
}

const SUMMARIZE_INSTRUCTION =
  "You are now a concise voice assistant. In 1-2 short sentences, summarize what the coding agent did and end with one short clarifying question. Do not write code or use tools — just speak.";
const REPLY_INSTRUCTION =
  "You are now a friendly voice assistant helping the user draft their next instruction. Reply in 1-2 sentences, ask one question at a time. Do not write code or use tools — just speak.";

export class MainAgentCliAdapter implements SummaryAdapter {
  constructor(private transport: MainAgentCliTransport) {}

  async summarize(input: SummarizeInput): Promise<string> {
    const prompt = `${SUMMARIZE_INSTRUCTION}

The agent's final message was:
${input.agentMessage}

The user's last instruction was:
${input.userMessage}

Now: speak the summary.`;
    return this.transport.runEphemeral(prompt);
  }

  async reply(input: ReplyInput): Promise<string> {
    const prompt = `${REPLY_INSTRUCTION}

Conversation so far:
${formatHistory(input.history)}

User just said: ${input.userTurn}

Now: speak your reply.`;
    return this.transport.runEphemeral(prompt);
  }

  async composePrompt(input: ComposePromptInput): Promise<string> {
    const prompt = `${input.skill}

Side-conversation transcript:
${formatHistory(input.history)}

Now: produce the optimized prompt and only the prompt.`;
    return this.transport.runEphemeral(prompt);
  }
}

function formatHistory(history: Turn[]): string {
  return history.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run --cwd apps/web test MainAgentCliAdapter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/onTheGo/adapters/MainAgentCliAdapter.ts apps/web/src/onTheGo/adapters/MainAgentCliAdapter.test.ts
git commit -m "feat(on-the-go): MainAgentCliAdapter escape hatch via existing CLI"
```

---

## Task 27: Phase 1 verification + branch coverage check

**Files:**

- (none new — verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun run --cwd apps/web test`
Expected: PASS — all on-the-go tests + all existing T3 Code tests.

- [ ] **Step 2: Verify branch coverage on FSM and stores**

Run: `bun run --cwd apps/web test --coverage onTheGo/flow onTheGo/state`
Expected: 100% branch coverage on `OnTheGoFlowOrchestrator.ts`, `notificationsStore.ts`, `pausedSessionsStore.ts`, `persistedPausedSessionsStore.ts`, `threadSubscription.ts`.

- [ ] **Step 3: Run typecheck**

Run: `bun run --cwd apps/web typecheck`
Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `bun run lint apps/web/src/onTheGo`
Expected: no issues.

- [ ] **Step 5: Update lifecycle plan checkbox + commit verification**

In `.agents/plans/2026-05-06-1442-on-the-go-mode.md`, tick `[ ] Phase 1 acceptance: ...` to `[x]`.

```bash
git add .agents/plans/2026-05-06-1442-on-the-go-mode.md
git commit -m "chore(plan): mark Phase 1 foundation acceptance complete"
```

Phase 1 done. Phase 2 (UI shell + voice flow) picks up next.

---

## Self-review

After writing this plan, re-read the spec at `docs/superpowers/specs/2026-05-06-on-the-go-mode-design.md` with fresh eyes. Verify:

1. **Spec coverage:** Every interface, store, adapter, and FSM transition described in the spec has a corresponding task here. Phase 2 covers the UI; Phase 3 covers onboarding/settings/polish.
2. **Placeholder scan:** No "TBD"/"TODO"/"implement later" anywhere. Each step shows the full code or full command.
3. **Type consistency:** `Notification`, `Turn`, `PausedSession`, `FlowState`, `VoiceAdapter`, `SummaryAdapter` are defined once in Tasks 1, 3, 4, and reused exactly in subsequent tasks. `OrchestratorDeps` extends with `commitPrompt` in Task 17.
4. **Scope:** Phase 1 produces a fully testable orchestration layer with no UI. Phase 2 builds the UI on top.

If issues are found, fix them inline.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-06-on-the-go-mode-phase1-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task with full context, two-stage review between tasks. Best for keeping context fresh across 27 tasks.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach? (Recommended: subagent-driven for a plan this size.)
