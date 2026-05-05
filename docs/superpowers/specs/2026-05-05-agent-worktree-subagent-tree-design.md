# Agent / Worktree / Sub-agent Tree — Design

**Branch:** `feat/agent-worktree-subagent-tree`
**Worktree:** `/home/jgigg/code/t3code-agent-worktree-tree`
**Status:** Draft, pending user review
**Date:** 2026-05-05

---

## 1. Goal

Surface the relationship between projects, worktrees, agent threads, and sub-agent threads as a visible, navigable tree in the t3code sidebar. Specifically:

- Every git worktree of a project appears as a node under that project — including ones the agent itself just created.
- Each agent thread renders under the worktree it is running on.
- Each sub-agent renders as a peer of agents under its target worktree, marked with a "subagent" badge, with a "↑ Back to parent agent" affordance in its read-only view.
- A parent agent (which may be running at the project root with no worktree of its own) can create worktrees and spawn sub-agents into *different* worktrees than the parent's own.

The user-visible outcome: a sidebar that reads like a feature/branch graph rather than a flat thread list, with sub-agent activity legible at a glance.

## 2. Background and current state

t3code (`apps/server` Node.js + WebSocket; `apps/web` React/Vite) already models most of the data this feature needs:

- **Threads** carry `worktreePath` and `branch` fields (`packages/contracts/src/orchestration.ts`). The data is there; the sidebar just doesn't group by it.
- **Worktrees** are first-class to the VCS layer: `apps/server/src/vcs/GitVcsDriverCore.ts` already parses `git worktree list --porcelain` (inside `listRefs`) and exposes `createWorktree` / `removeWorktree`.
- **Sub-agent tool calls** (Claude's `Task`, Codex's equivalent, OpenCode's equivalent) are detected and classified as `collab_agent_tool_call` in all three adapters (`apps/server/src/provider/Layers/{Claude,Codex,OpenCode}Adapter.ts`), with prompt and `subagent_type` extracted.
- **Sidebar grouping** (`apps/web/src/sidebarProjectGrouping.ts`) groups projects by logical project key and environment. There is no worktree layer between project and threads today.
- **MCP awareness** exists in adapters as a *consumer* (we recognize MCP tool calls); we do not currently expose an MCP server to providers.
- **`parentThreadId`** does not exist anywhere — net new.

## 3. Approach

**Approach 2 ("Uniform")** is the chosen direction: every sub-agent — regardless of whether it originated from the native Task tool or from a new t3code-injected spawn tool — is a first-class `Thread` with `parentThreadId` set, surfaced in the sidebar identically.

Per-provider gymnastics are accepted. Where a provider's CLI cleanly supports disabling its native sub-agent tool and registering a replacement via MCP (Claude's `disallowedTools` + `mcpServers`), we genuinely intercept. Where a provider doesn't, the adapter falls back to **projection mode** for that provider — observing each native sub-agent tool call in the event stream and materializing a `parentThreadId`-tagged child Thread record from the captured prompt and result. UX stays uniform; wiring is honest.

## 4. Architecture

```
┌──────────────────────── apps/web (React) ────────────────────────┐
│                                                                  │
│  Sidebar.tsx ──reads──▶ ProjectWorktreeTree (NEW derivation)     │
│                            ├─ Project                            │
│                            │  └─ Worktree node (NEW)             │
│                            │     ├─ Agent thread row             │
│                            │     └─ Sub-agent row (badge)        │
│                                                                  │
│  ChatView.tsx ──when thread.kind === "subagent"──▶               │
│       SubagentReadOnlyChrome                                     │
│         (composer hidden + "↑ Back to parent agent" button)      │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │ WebSocket (existing)
                              │
┌──────────────────────── apps/server (Node) ─────────────────────┐
│                                                                  │
│  WorktreeDiscovery (NEW)                                         │
│    ├─ polls GitVcsDriver.listWorktrees() per project (~3s)       │
│    ├─ invalidated synchronously on createWorktree/removeWorktree │
│    └─ emits WorktreeAdded / WorktreeRemoved                      │
│                                                                  │
│  Orchestration                                                   │
│    ├─ Schemas.ts:    Thread.parentThreadId, Thread.kind          │
│    ├─ decider.ts:    SpawnSubagentCommand → ChildThreadCreated   │
│    ├─ projector.ts:  Thread projection includes parentThreadId   │
│    └─ Services/SubagentRouter.ts (NEW)                           │
│         ├─ receives spawn requests from MCP tool                 │
│         ├─ enforces concurrency limit (FIFO queue per project)   │
│         ├─ enforces timeout (default 10m, override per call)     │
│         ├─ enforces retry policy (default 3 attempts, sibling    │
│         │   threads per attempt)                                 │
│         ├─ creates child Thread(parentThreadId, kind="subagent") │
│         ├─ runs it via existing turn-lifecycle machinery         │
│         └─ returns final assistant text to caller                │
│                                                                  │
│  Provider adapters                                               │
│    ├─ ClaudeAdapter:   disallowedTools: ["Task"] + mcpServers:   │
│    │                       T3OrchestrationMcpServer              │
│    ├─ CodexAdapter:    provider-specific equivalent              │
│    ├─ OpenCodeAdapter: provider-specific equivalent              │
│    └─ Per-provider fallback to projection mode if native sub-    │
│       agent tool can't be disabled                               │
│                                                                  │
│  T3OrchestrationMcpServer (NEW, in-process, one per session)     │
│    ├─ Tool: t3_spawn_agent                                       │
│    │     ({ worktreePath, prompt, subagent_type?,                │
│    │        provider?, model?, timeoutMs?, maxAttempts? })       │
│    │     → SubagentRouter.spawn(...) → final assistant text      │
│    └─ Tool: t3_create_worktree({ branch, baseRef? })             │
│          → GitVcsDriver.createWorktree(...) → worktreePath       │
└──────────────────────────────────────────────────────────────────┘
```

### Architectural decisions (locked)

- **In-process MCP server**, one per provider session, lifetime tied to the session. Avoids cross-process IPC noise; spawn latency stays low.
- **Synchronous spawn semantics** at the parent's tool call site. Parent's `t3_spawn_agent` call blocks until the child completes (subject to timeout). Same contract the model already understands from native Task: input prompt, output result string.
- **Worktree nodes are derived, not stored.** Source of truth = `git worktree list --porcelain`. No new persistence; refresh is polling-based + synchronous on operations we initiate.
- **Sub-agent kind is a flag, not a separate type.** `Thread.parentThreadId: ThreadId | null` + `Thread.kind: "agent" | "subagent"`. Sub-agent threads use the same persistence, projection, and orchestration code paths as regular threads — only the UI treats them differently.
- **Worktree node visibility rule:** a worktree node renders if `git worktree list` shows it OR any thread (alive or in-error) has `worktreePath` equal to it. This keeps errored threads from becoming sidebar orphans when a worktree is removed externally.
- **Always-visible synthetic root node** per project (representing "no worktree / repo root"), even if no threads currently live there. The orchestrator agent commonly runs at root.

## 5. Components

### 5.1 New modules — server

| Module | Responsibility |
|---|---|
| `apps/server/src/mcp/T3OrchestrationMcpServer.ts` | In-process MCP server. Exposes `t3_spawn_agent` and `t3_create_worktree`. One instance per provider session. |
| `apps/server/src/orchestration/Services/SubagentRouter.ts` | Receives spawn requests. Enforces concurrency, timeout, retries. Creates child Thread aggregate. Drives turn lifecycle. Awaits "turn complete". Returns final assistant text. Handles cancellation. |
| `apps/server/src/orchestration/Services/WorktreeDiscovery.ts` | Per-project poller against `GitVcsDriver.listWorktrees()`. Diffs against last-known set. Emits add/remove events. Synchronous invalidation hook. |

### 5.2 Schema changes — contracts

`packages/contracts/src/orchestration.ts`:
- `Thread.parentThreadId: ThreadId | null` (default `null` for top-level agents)
- `Thread.kind: "agent" | "subagent"` (default `"agent"`)
- `Thread.subagentAttempt?: { ordinal: number; totalAllowed: number }` (only on retry-attempt threads)
- New command: `SpawnSubagentCommand` (`{ parentThreadId, worktreePath, prompt, subagentType?, provider?, model?, timeoutMs?, maxAttempts? }`)
- New event: `ChildThreadCreated` (`{ parentThreadId, childThreadId, attemptOrdinal }`)
- New event: `SubagentSlotQueued` / `SubagentSlotGranted` (concurrency-queue lifecycle)
- New event: `WorktreeAdded` / `WorktreeRemoved` (per project)
- New query result type: `ProjectWorktreesQueryResult`

`apps/server/src/orchestration/{Schemas,decider,projector}.ts` — wire the above through. Existing decider/projector tests get cases added; no structural rewrites.

### 5.3 Provider adapter changes — per-provider gymnastics

`apps/server/src/provider/Layers/ClaudeAdapter.ts`:
- Pass `disallowedTools: ["Task"]` to `query()`
- Pass `mcpServers: { t3: T3OrchestrationMcpServer }` to `query()`

`apps/server/src/provider/Layers/CodexAdapter.ts`:
- Codex app-server tool registration: TBD-during-impl per provider docs.
- If clean disable+inject is feasible, intercept. Otherwise: projection mode — observe `collab_agent_tool_call` events, materialize child Thread record from captured prompt/result on completion.

`apps/server/src/provider/Layers/OpenCodeAdapter.ts`:
- Same shape as Codex; OpenCode-specific mechanism.

Adapter init logs whether a given session is in **interception** or **projection** mode at startup, once per session.

### 5.4 New modules — web

| Module | Responsibility |
|---|---|
| `apps/web/src/sidebarWorktreeGrouping.ts` (+ `.test.ts`) | Pure derivation: `Project[] × Thread[] × Worktree[] → ProjectWorktreeTree`. Decides root-node placement, ordering, error-thread retention. |
| `apps/web/src/components/sidebar/WorktreeGroup.tsx` | Renders a worktree node header + thread rows beneath. Collapsible. |
| `apps/web/src/components/sidebar/SubagentBadge.tsx` | Small visual indicator on rows where `kind === "subagent"`. |
| `apps/web/src/components/SubagentReadOnlyChrome.tsx` | Wrapper around `ChatView` for sub-agent threads: hides composer, adds banner "Sub-agent of <parent title>", adds "↑ Back to parent agent" button (always navigates to `parentThreadId` — option A from §6.3). |

### 5.5 Modified modules — web

- `apps/web/src/types.ts` — add `parentThreadId`, `kind`, `subagentAttempt` to `Thread` and `SidebarThreadSummary`.
- `apps/web/src/components/Sidebar.tsx` (3393 lines) — insert `WorktreeGroup` between project and thread-row mapping. **Surgical**: factor the worktree-grouping render into its own component so this file does not bloat further. AGENTS.md prioritises long-term maintainability and explicitly invites restructuring; we take the targeted path here, not the big rewrite.
- `apps/web/src/components/Sidebar.logic.ts` — within a worktree group, sort threads by `createdAt` regardless of kind (badge differentiates them; simpler mental model than "agents above sub-agents"). Locked decision.
- `apps/web/src/components/ChatView.tsx` — when `thread.kind === "subagent"`, render via `SubagentReadOnlyChrome`.
- `apps/web/src/router.ts` + `apps/web/src/threadSelectionStore.ts` — support direct navigation to `parentThreadId` (back button always navigates explicitly, never relies on history — option A from §6.3).
- `apps/web/src/sidebarProjectGrouping.ts` — unchanged in shape; worktree grouping plugs in *under* the project layer it produces.

### 5.6 Touched but not restructured

- `apps/web/src/worktreeCleanup.ts` — already understands shared worktrees; we keep using its helpers.
- `apps/server/src/vcs/GitVcsDriverCore.ts` — extract the worktree-list parsing currently embedded in `listRefs` into a standalone exported `listWorktrees()` function, so `WorktreeDiscovery` can call it without going through full ref resolution.

## 6. Data flow

### 6.1 Spawn a sub-agent in a different worktree

```
Parent (Claude on /repo)         T3 MCP        SubagentRouter         Child thread
  │                                 │                 │                     │
  ├── t3_spawn_agent ──────────────▶│                 │                     │
  │   { worktreePath:               │                 │                     │
  │       /repo-feat-pdf,           │                 │                     │
  │     prompt: "...",              │                 │                     │
  │     subagent_type, timeoutMs?,  │                 │                     │
  │     maxAttempts?, provider?,    │                 │                     │
  │     model? }                    │                 │                     │
  │                                 ├── spawn() ─────▶│                     │
  │                                 │                 ├── concurrency check │
  │                                 │                 │   → queue if at cap │
  │                                 │                 ├── fresh validation: │
  │                                 │                 │   listWorktrees()   │
  │                                 │                 ├── create Thread ───▶│
  │                                 │                 │   parentThreadId=P  │
  │                                 │                 │   kind="subagent"   │
  │                                 │                 │   worktreePath=...  │
  │                                 │                 │   provider=parent's │
  │                                 │                 │     unless override │
  │                                 │                 ├── start session ───▶│
  │                                 │                 ├── send prompt ─────▶│
  │ ◀═════ child appears in sidebar immediately (Working pill) ═══════════ │
  │                                 │                 │                     │ (runs turns,
  │                                 │                 │                     │  may itself
  │                                 │                 │                     │  call
  │                                 │                 │                     │  t3_spawn_agent)
  │                                 │                 │◀── turn complete ───┤
  │                                 │                 │   (no pending tools)│
  │                                 │◀── final text ──┤                     │
  │ ◀── tool result: { text } ──────┤                                       │
```

Key semantics:
- Child appears in sidebar **immediately on creation**, not on completion.
- "Turn complete" matches the existing turn-lifecycle definition (final assistant message, no tool calls pending). This mirrors native Task semantics.
- Provider/model **inherit from parent by default**; tool args override if specified (validated against `providerInstances` and `providerModels` registries).
- Nested sub-agents allowed — recursion is natural; `parentThreadId` chains.

### 6.2 Parent agent creates a worktree

```
Parent          T3 MCP         GitVcsDriver         WorktreeDiscovery      Sidebar
  │               │                 │                     │                  │
  ├── t3_create  ▶│                 │                     │                  │
  │   _worktree   ├── create ─────▶│                     │                  │
  │               │                 ├── invalidate ──────▶│                  │
  │               │                 │                     ├── re-list ─────▶│
  │               │◀── { path } ────┤                     │                  │
  │ ◀── result ───┤                                                          │
```

The agent's typical flow becomes: `t3_create_worktree` → use returned path with `t3_spawn_agent`. Same outcome works if the parent runs raw `git worktree add` via bash — the polling loop catches it within ~3s.

### 6.3 User clicks a sub-agent in sidebar

1. Sidebar row click → router navigates to `/thread/<subagentThreadId>`.
2. `ChatView` mounts; sees `thread.kind === "subagent"`.
3. Renders inside `SubagentReadOnlyChrome`:
   - Composer hidden — sub-agents are not promptable.
   - Banner: "Sub-agent of <parent thread title>".
   - Button: "↑ Back to parent agent" → **always navigates explicitly to `parentThreadId`** (option A; never uses browser history).
4. Transcript (`MessagesTimeline`) renders normally, full sub-agent activity visible.

### 6.4 Lifecycle and cancellation

- **Parent thread deleted/cancelled while child running**: `SubagentRouter` propagates cancellation. Child enters error state `"parent thread cancelled"`. Child stays in sidebar (read-only) for review.
- **Sub-agent deleted manually while parent waiting**: parent's spawn call resolves with `SUBAGENT_CANCELLED`. Parent agent decides next step.
- **Provider session crash for child**: child enters error state. Parent's spawn call resolves with `SUBAGENT_FAILED` carrying child's threadId.
- **Native sub-agent tool call in projection-mode provider**: `SubagentRouter` materialises a child Thread record from the captured prompt + result on tool-call completion. `parentThreadId` set. Child appears in sidebar identically to interception-mode children. No live spawn semantics — it just mirrors what the provider already did.

## 7. Error handling

Two recipes applied uniformly:

- **Tool-result error** — synchronous failure inside an MCP tool call. Returns `{ ok: false, error: { code, message, ...details } }` to the parent's transcript.
- **Thread-error state** — child enters `error: <message>`. Sidebar pill shows the error. Parent's pending spawn call resolves with `SUBAGENT_FAILED` (or applicable code) plus `subagentThreadId`.

### Error catalogue

| Where | Cause | Code | Notes |
|---|---|---|---|
| `t3_create_worktree` | branch already exists | `BRANCH_CONFLICT` | non-retryable |
| `t3_create_worktree` | FS error / disk full | `WORKTREE_FS_ERROR` | non-retryable |
| `t3_create_worktree` | not a git repo | `NOT_A_REPO` | non-retryable |
| `t3_spawn_agent` | path not in `git worktree list` | `WORKTREE_NOT_FOUND` | validation against fresh list, not cache |
| `t3_spawn_agent` | malformed args | `INVALID_ARGS` | non-retryable |
| `t3_spawn_agent` | provider not authenticated/available | `PROVIDER_UNAVAILABLE` | retryable |
| `t3_spawn_agent` | model not in provider's list | `INVALID_ARGS` | non-retryable |
| sub-agent runtime | child errors mid-turn / provider crash | `SUBAGENT_FAILED` | retryable |
| sub-agent runtime | timeout expired | `SUBAGENT_TIMED_OUT` | non-retryable (don't burn more time) |
| coordination | parent cancelled while child running | `SUBAGENT_CANCELLED` | non-retryable |
| coordination | child deleted manually | `SUBAGENT_CANCELLED` | non-retryable |
| coordination | worktree removed externally | child enters `error: "worktree removed"`; node persists per visibility rule |  |
| concurrency | queue wait exceeded parent timeoutMs | `SUBAGENT_QUEUE_TIMEOUT` | non-retryable |
| concurrency | queue length cap exceeded | `CONCURRENCY_LIMIT_EXCEEDED` | non-retryable |
| MCP startup | adapter can't disable native sub-agent tool | warned at session start; falls back to projection mode for that provider |  |

### Retry semantics (formerly out-of-scope, now in v1)

- **Default:** up to 3 attempts (initial + 2 retries). Override via `t3_spawn_agent({ maxAttempts })`, range `[1, 10]`.
- **Backoff:** exponential `1s → 2s → 4s`, cap 30s.
- **Eligible:** `SUBAGENT_FAILED`, `PROVIDER_UNAVAILABLE`. **Ineligible:** `SUBAGENT_CANCELLED`, `SUBAGENT_TIMED_OUT`, `WORKTREE_NOT_FOUND`, `INVALID_ARGS`, all `t3_create_worktree` codes.
- **Each attempt is a separate child thread** with its own `subagentAttempt: { ordinal, totalAllowed }`. Visible as siblings under the worktree, suffixed `(retry 1/2)` etc., all sharing the same `parentThreadId`. Audit trail preserved.
- **Final failure:** parent's spawn call resolves with `SUBAGENT_FAILED_AFTER_RETRIES` plus the array of attempt thread IDs.

### Concurrency limits (formerly out-of-scope, now in v1)

- **Scope:** per project.
- **Default:** 4 concurrent live sub-agents. Configurable via project settings field `subagentConcurrencyLimit` (defaults to 4).
- **At cap:** new spawns enter a FIFO queue. Wait up to the parent's `timeoutMs` for a slot before failing with `SUBAGENT_QUEUE_TIMEOUT`.
- **Hard queue length cap: 16.** Beyond this, immediate `CONCURRENCY_LIMIT_EXCEEDED`.
- **Sidebar:** queued sub-agents appear with a new `Queued` status pill (added to the existing set). Their read-only view shows the prompt + "waiting for slot N of M" banner.

### Timeouts (formerly out-of-scope, now in v1)

- **Default:** 10 minutes per spawn.
- **Override:** `t3_spawn_agent({ timeoutMs })`, clamped `[60_000, 3_600_000]`.
- **On expiry:** child's running turn cancelled; child enters `error: "sub-agent timed out after Xm"`; parent's call resolves with `SUBAGENT_TIMED_OUT` plus `subagentThreadId`.
- **Recursion:** each spawn has its own clock; nested timeouts are independent.

### Observability

Existing `serverLogger` patterns (see `docs/observability.md`):
- `subagent.spawn`, `subagent.completed`, `subagent.failed`, `subagent.cancelled`, `subagent.timed_out`, `subagent.queued`, `subagent.slot_granted`, `subagent.retry_attempted`
- `worktree.added`, `worktree.removed`, `worktree.invalidated`
- All emit structured fields: `parentThreadId`, `childThreadId`, `worktreePath`, `provider`, `attemptOrdinal` where applicable.

## 8. Cross-provider sub-agent chains (formerly out-of-scope, now in v1)

`t3_spawn_agent` accepts optional `provider` and `model` args:

- `provider?: "claude" | "codex" | "opencode"` — defaults to inheriting parent's.
- `model?: string` — defaults to inheriting parent's. If specified, must be present in the chosen provider's model list.
- Validation at spawn time via existing `providerInstances` and `providerModels` registries. Failure → `PROVIDER_UNAVAILABLE` or `INVALID_ARGS`.
- Result contract unchanged — child returns final assistant text as a string.
- Integration test obligation: a "Claude parent → Codex child → OpenCode grandchild" chain in the integration suite (§9.2).

## 9. Testing

Per the existing project conventions: Vitest, colocated `.test.ts`, `bun fmt` / `bun lint` / `bun typecheck` / `bun run test` gates from AGENTS.md. TDD per superpowers — tests precede implementation.

### 9.1 Unit tests

**Web:**
- `sidebarWorktreeGrouping.test.ts`:
  - empty project → root node only
  - threads on multiple worktrees → grouped under their respective nodes
  - `worktreePath === null` → root node
  - errored thread on a worktree gone from `git worktree list` → node persists per visibility rule
  - shared worktree → multiple threads under same node, sorted by `createdAt`
  - sub-agents interleave with agents by `createdAt` (locked decision; badge differentiates)
- `SubagentReadOnlyChrome.test.tsx`:
  - composer hidden when `kind === "subagent"`
  - back button navigates explicitly to `parentThreadId`
  - banner shows parent thread title

**Server:**
- `SubagentRouter.test.ts`:
  - spawn creates child with correct `parentThreadId`, `kind`, `worktreePath`, inherited provider+model
  - awaits "turn complete"; returns final assistant text
  - parent cancellation propagates to child; child enters error state
  - recursive spawn (child spawns grandchild) — both threads exist with correct chain; cancellation cascades
  - validation calls fresh `listWorktrees()` per spawn, not cache (asserted via injected stub)
  - timeout: child cancelled after `timeoutMs`; parent gets `SUBAGENT_TIMED_OUT`
  - retry: separate sibling threads created per attempt; each carries `subagentAttempt`
  - retry exhaustion: parent gets `SUBAGENT_FAILED_AFTER_RETRIES` with attempt IDs
  - concurrency: 5th concurrent spawn at cap=4 enters queue; granted on first completion
  - queue length cap: 17th concurrent spawn at cap=4 with queue=16 → `CONCURRENCY_LIMIT_EXCEEDED`
  - cross-provider: spawn with `provider: "codex"` from a Claude parent creates a Codex-backed child
- `WorktreeDiscovery.test.ts`:
  - diff produces correct add/remove events
  - synchronous invalidation after `createWorktree` makes new worktree visible without polling delay
  - recovers from transient `git worktree list` failures
- `T3OrchestrationMcpServer.test.ts`:
  - `t3_spawn_agent` translates args correctly; surfaces `SubagentRouter` errors as tool-result errors with the right codes
  - `t3_create_worktree` similarly
  - malformed args → `INVALID_ARGS`

**Schemas / projector / decider:** add cases to existing `orchestration.test.ts`, `projector.test.ts`, `decider.*.test.ts` covering `parentThreadId` / `kind` round-trip, `SpawnSubagentCommand` → `ChildThreadCreated` event, queue-lifecycle events, retry-attempt event sequencing.

### 9.2 Integration tests

Following `provider-service-integration-tests.md` and `git-flows-integration-tests.md` patterns (`apps/server/test/integration/`):

- **Per-provider spawn happy path** — one suite each for Claude, Codex, OpenCode:
  - parent thread starts; calls `t3_spawn_agent`; child appears, runs in target worktree, returns text to parent
  - sidebar query reflects both threads with correct `parentThreadId` link
- **Per-provider create-worktree path** — `t3_create_worktree` followed by spawn into the new worktree succeeds without polling delay.
- **Native sub-agent tool interception path** — parent attempts native sub-agent call; assert the shadow tool fired and a real child thread was created (interception-mode providers).
- **Native sub-agent tool projection path** — for any provider in projection mode, assert the materialised child Thread record carries the right `parentThreadId` and prompt/result.
- **Cross-provider chain** — Claude parent → Codex child → OpenCode grandchild. Final text propagates correctly back through the chain.
- **Retry path** — fault-injected `SUBAGENT_FAILED` on first attempt; assert second attempt is a separate sibling thread; assert success returned to parent.
- **Concurrency queue** — saturate at cap; assert FIFO ordering and `Queued` pill visible on the queued child.
- **Cancellation** — parent deleted while child running; child enters error state; both remain in sidebar.
- **Worktree removed externally** — `git worktree remove` outside t3code while child runs; child errors; node persists until thread dismissed.

### 9.3 Performance / load tests (formerly out-of-scope, now in v1)

`apps/server/test/perf/subagent.bench.ts` (Vitest `bench`):

| Metric | Budget |
|---|---|
| Spawn latency (parent tool call → child first user message accepted) | p95 < 750ms, p99 < 1.5s |
| Steady state with 4 concurrent sub-agents per project, 5 min | server CPU < 60%, server RSS < 600MB |
| Worktree polling overhead, 20 worktrees | < 50ms per cycle |
| `sidebarWorktreeGrouping` derivation, 50 worktrees × 10 threads | < 5ms |

CI policy: benchmarks run in a separate workflow. Regressions surface as warnings on PR comments. **A regression of >20% from baseline promotes to PR-blocking.** Hard-gating PRs on absolute numbers is too noisy; gating on regressions catches real changes.

### 9.4 Manual smoke checklist (PR pre-merge)

1. Sidebar shows worktree nodes (including root) under each project; threads grouped underneath.
2. Parent agent at root runs `git worktree add` via plain bash → new node appears within ~3s.
3. Same parent calls `t3_spawn_agent` into the new worktree → sub-agent row appears under that worktree with badge; status pill streams.
4. Click sub-agent → composer hidden; banner + back button visible. Click back → on parent thread.
5. Trigger error case (kill child's provider mid-turn) → child shows error pill; parent's tool call resolves with `SUBAGENT_FAILED`.
6. Trigger retry — fault-inject one failure; second attempt sibling thread appears; eventually succeeds.
7. Trigger concurrency cap — start 5 spawns at cap=4; 5th shows `Queued` pill until first completes.
8. Trigger cross-provider — Claude parent spawns Codex child; both threads use correct providers.

## 10. Phasing / rollout

The full spec describes the v1 end state. Implementation lands in 4 sequential phases, each shippable independently:

1. **Worktree nodes in sidebar.** Pure UI grouping derived from existing data + new `WorktreeDiscovery` poller. No new schema.
2. **Sub-agent thread kind + read-only view.** Add `parentThreadId` / `kind`; surface native sub-agent tool calls via projection mode (no interception yet); `SubagentReadOnlyChrome` + back button.
3. **MCP server + cross-worktree spawn.** `T3OrchestrationMcpServer`, `SubagentRouter`, `t3_spawn_agent`, `t3_create_worktree`. Concurrency, timeout, retry policies. Cross-provider/model overrides. Bench suite scaffolded.
4. **Native sub-agent tool interception per provider.** Disable each provider's native sub-agent tool (Claude's `Task`, Codex's equivalent, OpenCode's equivalent) in adapters that support it; replace with shadow MCP tool. Per-provider gymnastics. Adapters that can't be cleanly intercepted stay in projection mode (Phase 2 fallback).

Each phase has an exit criterion = relevant tests green + manual smoke for that phase passing.

## 11. Acceptance criteria (v1)

- Sidebar groups threads by `Project → Worktree → Threads` with the synthetic root node always present per project.
- Worktree nodes update on git worktree add/remove (via t3code-initiated calls *or* external shell) within 3s.
- Threads with `kind === "subagent"` render in sidebar with a `subagent` badge regardless of origin (interception or projection).
- Sub-agent thread view hides the composer and shows a banner + working "↑ Back to parent agent" button that navigates explicitly to `parentThreadId`.
- A parent agent can call `t3_create_worktree` and immediately follow with `t3_spawn_agent` targeting that path, with no race.
- A parent agent on Claude can spawn a Codex sub-agent (and the chain can recurse to a third provider).
- Sub-agents respect timeout (default 10m, override range 1m–1h).
- Sub-agents retry on `SUBAGENT_FAILED` and `PROVIDER_UNAVAILABLE` per policy; retries materialise as sibling threads with `subagentAttempt`.
- Per-project concurrency cap of 4 (configurable) is enforced; queued sub-agents show `Queued` pill.
- All seven `bun fmt` / `bun lint` / `bun typecheck` / `bun run test` gates green.
- Performance budgets met or within 20% of baseline.

## 12. Open questions / future work

Not in v1, deliberately:

- **Provider/model overrides per spawn beyond what's specified.** No "model temperature" / "system prompt override" args yet. Add when a real use case shows up.
- **Sub-agent prompt-ability after completion.** Out of scope by user decision — sub-agents are read-only post-creation.
- **Cross-project sub-agents.** A sub-agent's worktree must belong to the same project as the parent. Cross-project spawning isn't modelled.
- **Persistent worktree metadata** (e.g., labels, owner). Worktrees are derived from `git worktree list` only; no t3code-side storage.
- **Granular retry budgets** (per-error-code retry counts). Single `maxAttempts` for now.
- **Observability dashboards** for sub-agent health. Current logging suffices for v1; dashboards are a follow-up.
