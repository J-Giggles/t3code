# Agent / Worktree / Sub-agent Tree — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Branch:** `feat/agent-worktree-subagent-tree`
**Worktree:** `/home/jgigg/code/t3code-agent-worktree-tree`
**Spec:** `docs/superpowers/specs/2026-05-05-agent-worktree-subagent-tree-design.md`

**Goal:** Surface every git worktree of a project as a node in the t3code sidebar, grouped under its project, with thread rows nested under their respective worktree (including a synthetic "(repo root)" worktree for threads with no `worktreePath`).

**Architecture:** Add a `WorktreeDiscovery` service that polls `git worktree list --porcelain` per project, diffs against the last-known set, and pushes updates to the web client over a new WebSocket channel `project.worktreesUpdated`. The web app derives a `Project → Worktree → Thread[]` tree via a pure function (`sidebarWorktreeGrouping.ts`) and renders it with a new `SidebarWorktreeGroup` component inserted between the existing project section and thread row mapping in `Sidebar.tsx`. No new orchestration schema; worktrees are derived state, not events.

**Tech Stack:** Effect (server services + layers + streams), Vitest (`bun run test`), React 18 + TanStack Router (web), TypeScript, Bun. Tests are colocated `.test.ts(x)` next to source.

**Phasing:** Phase 1 of 4. Phase 2 (sub-agent thread kind + read-only view), Phase 3 (MCP server + cross-worktree spawn), Phase 4 (native sub-agent tool interception) follow as separate plans in their own worktrees.

**Acceptance criteria for Phase 1:**

- Every project in the sidebar shows a list of worktree nodes under it, including a synthetic root node ("(repo root)").
- Threads with `worktreePath !== null` render under their matching worktree node.
- Threads with `worktreePath === null` render under the synthetic root.
- Worktrees that exist on disk but have no threads still render (because the agent might just have created them).
- Errored threads on a worktree no longer present in `git worktree list` keep their worktree node visible (per the spec's visibility rule).
- Worktree nodes update within ~3s of an external `git worktree add` / `git worktree remove`.
- All four gates pass: `bun fmt && bun lint && bun typecheck && bun run test`.

---

## File structure

**New files (server):**

- `apps/server/src/orchestration/Services/WorktreeDiscovery.ts` — service interface + Context tag.
- `apps/server/src/orchestration/Layers/WorktreeDiscovery.ts` — Layer implementation (poller + diff + per-project subscription stream).
- `apps/server/src/orchestration/Layers/WorktreeDiscovery.test.ts` — unit tests.

**New files (web):**

- `apps/web/src/sidebarWorktreeGrouping.ts` — pure derivation function.
- `apps/web/src/sidebarWorktreeGrouping.test.ts` — unit tests.
- `apps/web/src/components/sidebar/SidebarWorktreeGroup.tsx` — UI component for one worktree node + its threads.

**Modified files:**

- `apps/server/src/vcs/GitVcsDriverCore.ts` — extract embedded worktree-list parsing in `listRefs` into a new top-level `listWorktrees(cwd)` driver method.
- `packages/contracts/src/vcs.ts` — audit `VcsWorktree` for completeness; add fields only if needed.
- `apps/server/src/orchestration/runtimeLayer.ts` — provide `WorktreeDiscovery` layer.
- `apps/server/src/wsServer.ts` — register `project.worktreesUpdated` push channel; subscribe to discovery streams when projects come online.
- `packages/contracts/src/ipc.ts` — declare the push schema and message type.
- `apps/web/src/rpc` (the WS client area) — handle the new push.
- `apps/web/src/store.ts` — add `worktreesByProjectId` map; reducer for the push.
- `apps/web/src/types.ts` — re-export `VcsWorktree` for web convenience (if not already accessible).
- `apps/web/src/components/Sidebar.tsx` — surgical insertion of `SidebarWorktreeGroup` between project section and thread rows. Factor the per-project render block into a helper to keep the file from growing further.

---

## Task 1 — Extract `listWorktrees` into a standalone driver method

**Files:**

- Modify: `apps/server/src/vcs/GitVcsDriverCore.ts` (currently embeds worktree parsing in `listRefs`, lines ~1732–1800)
- Modify: `packages/contracts/src/vcs.ts` (the `VcsDriver` shape — add `listWorktrees` to driver capabilities)
- Test: `apps/server/src/vcs/GitVcsDriverCore.test.ts` (extend existing)

This is a refactor with no behavior change. Existing callers of `listRefs` continue to work.

- [ ] **Step 1: Read the current parsing code** in `apps/server/src/vcs/GitVcsDriverCore.ts` lines 1732–1810. Note that the parser builds a `Map<branchName, worktreePath>`. We need the inverse — a list of `VcsWorktree` records with `{ path, headRef, branch, isDetached, isMain, isLocked }` — but we also need to keep the existing branch-keyed map view that `listRefs` consumes.

- [ ] **Step 2: Confirm `VcsWorktree` shape**. Run:

  ```bash
  grep -n "VcsWorktree" /home/jgigg/code/t3code-agent-worktree-tree/packages/contracts/src/vcs.ts
  ```

  Inspect the schema. Phase 1 needs: `path: string`, `branch: string | null`, `headRef: string | null`, `isMain: boolean` (whether this worktree is the repo's main checkout), `isLocked: boolean`. Add any missing fields to `VcsWorktree` with sensible defaults. Do not break existing callers.

- [ ] **Step 3: Write a failing test for `listWorktrees`**. In `apps/server/src/vcs/GitVcsDriverCore.test.ts`, add a test that:
  - Sets up a temporary git repo with two worktrees (main + one branch worktree).
  - Calls the new `driver.listWorktrees(cwd)`.
  - Asserts the returned array has exactly two items, with correct `path`, `branch`, `isMain` flags.

  ```ts
  it("listWorktrees returns one entry per git worktree", () =>
    Effect.gen(function* () {
      const driver = yield* GitVcsDriver;
      const result = yield* driver.listWorktrees(repoCwd);

      expect(result).toHaveLength(2);
      const main = result.find((w) => w.isMain);
      expect(main?.path).toBe(repoCwd);
      const feature = result.find((w) => !w.isMain);
      expect(feature?.branch).toBe("feat/test");
    }).pipe(Effect.provide(TestLayer), Effect.runPromise));
  ```

- [ ] **Step 4: Run the failing test**

  ```bash
  cd /home/jgigg/code/t3code-agent-worktree-tree && bun run test apps/server/src/vcs/GitVcsDriverCore.test.ts
  ```

  Expected: FAIL — `listWorktrees` is not a function.

- [ ] **Step 5: Add `listWorktrees` to the `GitVcsDriverShape` interface** (or whichever module declares the driver). Then implement it in `GitVcsDriverCore.ts` by extracting the existing `git worktree list --porcelain` invocation and parsing into a standalone Effect. Keep parsing pure and shared with `listRefs` — `listRefs` should now call the new `listWorktrees` method internally and convert the result into the branch→path map it needs.

  Sketch (full implementation follows existing `Effect.fn` patterns in the file):

  ```ts
  const listWorktrees: GitVcsDriverShape["listWorktrees"] = Effect.fn("listWorktrees")(function* (
    cwd: string,
  ) {
    const result = yield* executeGit(
      "GitVcsDriver.listWorktrees",
      cwd,
      ["worktree", "list", "--porcelain"],
      { fallbackErrorMessage: "git worktree list failed" },
    );
    return parseWorktreePorcelain(result.stdout);
  });
  ```

  Add a private `parseWorktreePorcelain(stdout: string): readonly VcsWorktree[]` helper exported from the module for testability.

- [ ] **Step 6: Refactor `listRefs` to use the new method**. Replace the inline parsing block with a call to `listWorktrees(cwd)`, then build the `worktreeMap` from the returned array.

- [ ] **Step 7: Run all VCS tests**

  ```bash
  bun run test apps/server/src/vcs/
  ```

  Expected: PASS — both new `listWorktrees` test and existing `listRefs` tests green.

- [ ] **Step 8: Commit**
  ```bash
  git add packages/contracts/src/vcs.ts apps/server/src/vcs/
  git commit -m "refactor(vcs): extract listWorktrees from listRefs into standalone driver method"
  ```

---

## Task 2 — Define `WorktreeDiscovery` service interface

**Files:**

- Create: `apps/server/src/orchestration/Services/WorktreeDiscovery.ts`

- [ ] **Step 1: Read a neighbouring service for pattern** — open `apps/server/src/orchestration/Services/ProjectionSnapshotQuery.ts`. Note the structure: JSDoc header, `Context.Service`-style tag, `XxxShape` interface, exported tag.

- [ ] **Step 2: Write the service file** following that exact pattern.

  ```ts
  /**
   * WorktreeDiscovery - Periodic per-project worktree poller.
   *
   * Tracks the set of git worktrees for each registered project, diffs
   * against the previously-observed set on each tick, and emits add/remove
   * updates as a Stream. Updates are also emitted synchronously when
   * t3code-initiated worktree creation/removal occurs (via invalidate()).
   *
   * @module WorktreeDiscovery
   */
  import type { ProjectId, VcsWorktree } from "@t3tools/contracts";
  import { Context } from "effect";
  import type { Effect, Stream } from "effect";

  import type { VcsDriverError } from "../../vcs/Errors.ts";

  export interface WorktreeStateSnapshot {
    readonly projectId: ProjectId;
    readonly worktrees: readonly VcsWorktree[];
  }

  export interface WorktreeDiscoveryShape {
    /**
     * Register a project for periodic discovery. Returns a stream of
     * worktree-state snapshots: an initial snapshot is emitted within one
     * tick, then a new snapshot whenever the worktree set changes.
     *
     * Subscribers are responsible for cleanup (close the stream / scope).
     */
    readonly subscribe: (
      projectId: ProjectId,
      cwd: string,
    ) => Stream.Stream<WorktreeStateSnapshot, VcsDriverError, never>;

    /**
     * Force an immediate re-poll for a project. Used by the VCS layer
     * after t3code-initiated createWorktree / removeWorktree so the new
     * state is visible without waiting for the next tick.
     */
    readonly invalidate: (projectId: ProjectId) => Effect.Effect<void>;
  }

  export class WorktreeDiscovery extends Context.Tag("WorktreeDiscovery")<
    WorktreeDiscovery,
    WorktreeDiscoveryShape
  >() {}
  ```

- [ ] **Step 3: Type-check** to confirm the file is syntactically valid.

  ```bash
  bun run typecheck
  ```

  Expected: PASS.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/src/orchestration/Services/WorktreeDiscovery.ts
  git commit -m "feat(orchestration): add WorktreeDiscovery service interface"
  ```

---

## Task 3 — Implement `WorktreeDiscovery` Layer (poller + diff)

**Files:**

- Create: `apps/server/src/orchestration/Layers/WorktreeDiscovery.ts`
- Create: `apps/server/src/orchestration/Layers/WorktreeDiscovery.test.ts`

The Layer holds per-project state: last-known worktree set + a `PubSub` (or `Hub`) that subscribers consume from. A scheduled fiber polls `GitVcsDriver.listWorktrees(cwd)` every 3s, diffs, and publishes a new snapshot only when the set has changed (by `path`).

- [x] **Step 1: Write the failing test for initial-snapshot emission**.

  ```ts
  it("subscribe emits an initial snapshot within one tick", () =>
    Effect.gen(function* () {
      const stub = yield* makeStubDriver([{ path: "/repo", branch: "main", isMain: true }]);
      const layer = WorktreeDiscoveryLive.pipe(Layer.provide(stub.layer));
      const discovery = yield* WorktreeDiscovery.pipe(Effect.provide(layer));
      const stream = discovery.subscribe(testProjectId, "/repo");
      const first = yield* Stream.runHead(Stream.take(stream, 1));

      expect(Option.isSome(first)).toBe(true);
      expect(Option.getOrThrow(first).worktrees).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.runPromise));
  ```

  Pattern after similar Stream-based service tests in the codebase (search `Stream.runHead` for examples).

- [x] **Step 2: Write the failing test for diff-on-add**.

  ```ts
  it("emits a new snapshot when listWorktrees adds a worktree", () =>
    Effect.gen(function* () {
      const stub = yield* makeStubDriver([{ path: "/repo", branch: "main", isMain: true }]);
      const layer = WorktreeDiscoveryLive.pipe(Layer.provide(stub.layer));
      const discovery = yield* WorktreeDiscovery.pipe(Effect.provide(layer));
      const fiber = yield* Effect.fork(
        Stream.runCollect(Stream.take(discovery.subscribe(testProjectId, "/repo"), 2)),
      );

      yield* Effect.sleep("100 millis");
      stub.set([
        { path: "/repo", branch: "main", isMain: true },
        { path: "/repo-feat", branch: "feat/x", isMain: false },
      ]);
      yield* discovery.invalidate(testProjectId);

      const collected = yield* Fiber.join(fiber);
      expect(Chunk.toReadonlyArray(collected)).toHaveLength(2);
      expect(Chunk.toReadonlyArray(collected)[1]?.worktrees).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.runPromise));
  ```

- [x] **Step 3: Write the failing test for no-change-no-emit**.

  ```ts
  it("does not emit a duplicate snapshot when listWorktrees returns the same set", () =>
    Effect.gen(function* () {
      const stub = yield* makeStubDriver([{ path: "/repo", branch: "main", isMain: true }]);
      const layer = WorktreeDiscoveryLive.pipe(Layer.provide(stub.layer));
      const discovery = yield* WorktreeDiscovery.pipe(Effect.provide(layer));

      const stream = discovery.subscribe(testProjectId, "/repo");
      // First snapshot
      yield* Stream.runHead(Stream.take(stream, 1));
      // Force two more polls with no change
      yield* discovery.invalidate(testProjectId);
      yield* discovery.invalidate(testProjectId);

      // Verify only one snapshot was ever emitted (no extras buffered)
      const next = yield* Effect.race(
        Stream.runHead(Stream.take(stream, 1)),
        Effect.delay(Effect.succeed(Option.none()), "200 millis"),
      );
      expect(Option.isNone(next)).toBe(true);
    }).pipe(Effect.scoped, Effect.runPromise));
  ```

- [x] **Step 4: Write the failing test for transient-error recovery**.

  ```ts
  it("recovers from transient listWorktrees failures", () =>
    Effect.gen(function* () {
      const stub = yield* makeStubDriver([{ path: "/repo", branch: "main", isMain: true }]);
      const layer = WorktreeDiscoveryLive.pipe(Layer.provide(stub.layer));
      const discovery = yield* WorktreeDiscovery.pipe(Effect.provide(layer));
      const stream = discovery.subscribe(testProjectId, "/repo");
      yield* Stream.runHead(Stream.take(stream, 1));

      stub.failNext(); // next call throws
      yield* discovery.invalidate(testProjectId); // poll happens, fails, logged
      stub.set([
        { path: "/repo", branch: "main", isMain: true },
        { path: "/repo-feat", branch: "feat/x", isMain: false },
      ]);
      yield* discovery.invalidate(testProjectId);

      const next = yield* Stream.runHead(Stream.take(stream, 1));
      expect(Option.getOrThrow(next).worktrees).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.runPromise));
  ```

- [x] **Step 5: Run the failing tests**

  ```bash
  bun run test apps/server/src/orchestration/Layers/WorktreeDiscovery.test.ts
  ```

  Expected: 4 FAILures (no implementation yet).

- [x] **Step 6: Implement the Layer**. Skeleton:

  ```ts
  /**
   * WorktreeDiscoveryLive - Live implementation of WorktreeDiscovery.
   *
   * Per-project: keeps a Ref<readonly VcsWorktree[]> of last-known set + a
   * PubSub<WorktreeStateSnapshot>. Spawns a polling fiber that ticks every
   * pollIntervalMs, calls GitVcsDriver.listWorktrees, diffs by path, and
   * publishes only when the set changed. invalidate() forces a tick.
   */
  import type { ProjectId, VcsWorktree } from "@t3tools/contracts";
  import { Context, Effect, Layer, PubSub, Ref, Schedule, Stream } from "effect";

  import { GitVcsDriver } from "../../vcs/Services/VcsDriver.ts";
  import { WorktreeDiscovery } from "../Services/WorktreeDiscovery.ts";
  import type { WorktreeDiscoveryShape } from "../Services/WorktreeDiscovery.ts";

  const POLL_INTERVAL_MS = 3000;

  // worktreeSetEqual: compare by sorted paths (set semantics by path).
  const worktreeSetEqual = (a: readonly VcsWorktree[], b: readonly VcsWorktree[]): boolean => {
    if (a.length !== b.length) return false;
    const aPaths = [...a].map((w) => w.path).sort();
    const bPaths = [...b].map((w) => w.path).sort();
    return aPaths.every((p, i) => p === bPaths[i]);
  };

  // ... per-project state map, polling fiber, subscribe(), invalidate()
  ```

  Implementation notes:
  - Per-project state lives in a `Ref<Map<ProjectId, ProjectState>>` where `ProjectState = { lastSet: Ref<readonly VcsWorktree[]>; pubsub: PubSub<WorktreeStateSnapshot>; tickFiber: Fiber }`.
  - On `subscribe(projectId, cwd)`: lazy-create the project state if absent, including a forked polling fiber that runs `tick()` on `Schedule.fixed(POLL_INTERVAL_MS)`. Return `Stream.fromPubSub(pubsub)`.
  - `tick()` calls `listWorktrees(cwd)`, compares against `lastSet`, and on mismatch updates `lastSet` and `pubsub.publish(snapshot)`. Errors are logged via `serverLogger.warn` and swallowed (so the fiber keeps polling).
  - `invalidate(projectId)`: looks up the project state and triggers a one-shot `tick()` immediately.
  - Use `Layer.scoped` so polling fibers are interrupted on Layer release.

- [x] **Step 7: Run the tests**

  ```bash
  bun run test apps/server/src/orchestration/Layers/WorktreeDiscovery.test.ts
  ```

  Expected: 4 PASS.

- [x] **Step 8: Run full server gates**

  ```bash
  bun run typecheck && bun run test apps/server
  ```

  Expected: PASS.

- [x] **Step 9: Commit**
  ```bash
  git add apps/server/src/orchestration/Layers/WorktreeDiscovery.ts apps/server/src/orchestration/Layers/WorktreeDiscovery.test.ts
  git commit -m "feat(orchestration): WorktreeDiscovery Live layer with polling and invalidation"
  ```

---

## Task 4 — Wire `WorktreeDiscovery` into the orchestration runtime layer

**Files:**

- Modify: `apps/server/src/orchestration/runtimeLayer.ts`

- [ ] **Step 1: Read the file to understand the current layer composition**.

  ```bash
  cat /home/jgigg/code/t3code-agent-worktree-tree/apps/server/src/orchestration/runtimeLayer.ts
  ```

- [ ] **Step 2: Add `WorktreeDiscoveryLive` to the merged `OrchestrationLayerLive`**. The new service depends on `GitVcsDriver`, so it must be provided after the VCS layer. Pattern:

  ```ts
  import { WorktreeDiscoveryLive } from "./Layers/WorktreeDiscovery.ts";

  // ... existing layers ...

  export const OrchestrationLayerLive = Layer.mergeAll(
    OrchestrationInfrastructureLayerLive,
    OrchestrationEngineLive.pipe(Layer.provide(OrchestrationInfrastructureLayerLive)),
    WorktreeDiscoveryLive, // GitVcsDriver provided one level up
  );
  ```

  If `GitVcsDriver` isn't already in scope of `OrchestrationLayerLive`, locate where the VCS layer is composed (search `GitVcsDriverLive`) and ensure both are merged at the same level so `WorktreeDiscoveryLive` can resolve its dependency.

- [ ] **Step 3: Run typecheck**

  ```bash
  bun run typecheck
  ```

  Expected: PASS. Any "missing service" errors mean the layer ordering needs adjustment.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/src/orchestration/runtimeLayer.ts
  git commit -m "feat(orchestration): wire WorktreeDiscovery into runtime layer"
  ```

---

## Task 5 — Add WebSocket push channel for worktree updates

**Files:**

- Modify: `packages/contracts/src/ipc.ts` (declare push schema)
- Modify: `apps/server/src/wsServer.ts` (register channel + subscribe to discovery streams when projects come online)

- [ ] **Step 1: Read `packages/contracts/src/ipc.ts`** to find the existing push channel registry. Look for the union of push messages (something like `WsPushMessage` or `OrchestrationDomainEvent`).

- [ ] **Step 2: Add a new push schema** for `project.worktreesUpdated`:

  ```ts
  // In ipc.ts, alongside existing push schemas:
  export const WsProjectWorktreesUpdatedPush = Schema.Struct({
    type: Schema.Literal("project.worktreesUpdated"),
    projectId: ProjectId,
    worktrees: Schema.Array(VcsWorktree),
  });
  export type WsProjectWorktreesUpdatedPush = typeof WsProjectWorktreesUpdatedPush.Type;
  ```

  Then add it to the `WsPushMessage` union (or wherever pushes are aggregated).

- [ ] **Step 3: Run typecheck**

  ```bash
  bun run typecheck
  ```

  Expected: PASS — schema additions only.

- [ ] **Step 4: Read `apps/server/src/wsServer.ts`** to find where projects are enumerated/subscribed. Search for `OrchestrationProject` or `projects` to locate the lifecycle hook.

- [ ] **Step 5: On each project that comes online, subscribe to `WorktreeDiscovery.subscribe(projectId, project.cwd)` and forward each emitted `WorktreeStateSnapshot` over the WS connection as a `project.worktreesUpdated` push**. The subscription scope should be tied to the project's online scope so it's torn down on project removal.

  Sketch:

  ```ts
  yield *
    Stream.runForEach(discovery.subscribe(project.id, project.cwd), (snapshot) =>
      Effect.sync(() => {
        sendPush({
          type: "project.worktreesUpdated",
          projectId: snapshot.projectId,
          worktrees: snapshot.worktrees,
        });
      }),
    ).pipe(Effect.forkScoped);
  ```

  This sends the **initial snapshot** when the project comes online (because `subscribe()` emits one immediately) and every subsequent change.

- [ ] **Step 6: Add a basic integration test** in `apps/server/src/wsServer.test.ts` (or wherever the WS server tests live):
  - Start the server, add a project, create a worktree externally, assert that a `project.worktreesUpdated` push arrives within ~5s containing the new worktree.

  Keep this lightweight — full integration suite expansion comes in Phase 3.

- [ ] **Step 7: Run server tests**

  ```bash
  bun run test apps/server
  ```

  Expected: PASS.

- [ ] **Step 8: Commit**
  ```bash
  git add packages/contracts/src/ipc.ts apps/server/src/wsServer.ts apps/server/src/wsServer.test.ts
  git commit -m "feat(server): push project.worktreesUpdated over WebSocket on discovery changes"
  ```

---

## Task 6 — Receive `project.worktreesUpdated` in the web store

**Files:**

- Modify: `apps/web/src/store.ts`
- Modify: `apps/web/src/types.ts` (re-export `VcsWorktree` if not already accessible)
- Modify: `apps/web/src/rpc/` (whichever file routes WS push messages — find it via grep)

- [ ] **Step 1: Locate the WS push handler in the web app**.

  ```bash
  grep -rn "orchestration.domainEvent\|push" /home/jgigg/code/t3code-agent-worktree-tree/apps/web/src/rpc/ /home/jgigg/code/t3code-agent-worktree-tree/apps/web/src/store.ts | head -30
  ```

- [ ] **Step 2: Add a slice to the store** for worktrees keyed by project:

  ```ts
  // In store.ts type/state:
  worktreesByProjectId: Map<ProjectId, readonly VcsWorktree[]>;

  // In initial state:
  worktreesByProjectId: new Map(),

  // Reducer / handler for the new push:
  case "project.worktreesUpdated": {
    const next = new Map(state.worktreesByProjectId);
    next.set(message.projectId, message.worktrees);
    return { ...state, worktreesByProjectId: next };
  }
  ```

  Match the existing store style — `useStore`, immer, zustand, signals — whichever the project uses.

- [ ] **Step 3: Add a selector**

  ```ts
  export const selectWorktreesForProject = (
    state: AppState,
    projectId: ProjectId,
  ): readonly VcsWorktree[] => state.worktreesByProjectId.get(projectId) ?? [];
  ```

  Place it in `apps/web/src/storeSelectors.ts` next to the existing selectors.

- [ ] **Step 4: Write a failing store test** in `apps/web/src/store.test.ts` for the new push handler:

  ```ts
  it("project.worktreesUpdated populates worktreesByProjectId", () => {
    const store = makeTestStore();
    store.handlePush({
      type: "project.worktreesUpdated",
      projectId: ProjectId.make("p1"),
      worktrees: [{ path: "/repo", branch: "main", isMain: true /* ...*/ }],
    });
    expect(store.getState().worktreesByProjectId.get(ProjectId.make("p1"))).toHaveLength(1);
  });
  ```

- [ ] **Step 5: Run failing test**

  ```bash
  bun run test apps/web/src/store.test.ts
  ```

  Expected: FAIL.

- [ ] **Step 6: Implement until the test passes**.

  ```bash
  bun run test apps/web/src/store.test.ts
  ```

  Expected: PASS.

- [ ] **Step 7: Commit**
  ```bash
  git add apps/web/src/store.ts apps/web/src/store.test.ts apps/web/src/storeSelectors.ts apps/web/src/types.ts apps/web/src/rpc
  git commit -m "feat(web): receive project.worktreesUpdated and store worktrees by project"
  ```

---

## Task 7 — Build `sidebarWorktreeGrouping.ts` (pure derivation + tests)

**Files:**

- Create: `apps/web/src/sidebarWorktreeGrouping.ts`
- Create: `apps/web/src/sidebarWorktreeGrouping.test.ts`

This is the heart of the visual model. **Tests first.**

- [ ] **Step 1: Define types and write failing tests**.

  ```ts
  // sidebarWorktreeGrouping.ts (just types initially):
  import type { ProjectId, VcsWorktree } from "@t3tools/contracts";
  import type { SidebarThreadSummary } from "./types";

  export const ROOT_WORKTREE_ID = "__root__" as const;
  export type WorktreeNodeId = string; // either a path, or ROOT_WORKTREE_ID

  export interface SidebarWorktreeNode {
    readonly id: WorktreeNodeId;
    readonly displayLabel: string; // e.g. "(repo root)" or "feat/pdf-export"
    readonly worktreePath: string | null; // null = synthetic root
    readonly branch: string | null;
    readonly isMain: boolean;
    readonly isSynthetic: boolean;
    readonly threads: readonly SidebarThreadSummary[];
  }

  export interface SidebarProjectWorktreeTree {
    readonly projectId: ProjectId;
    readonly nodes: readonly SidebarWorktreeNode[]; // root first, then by branch alpha
  }

  export interface BuildInput {
    readonly projectId: ProjectId;
    readonly projectCwd: string;
    readonly threads: readonly SidebarThreadSummary[];
    readonly worktrees: readonly VcsWorktree[];
  }

  export function buildProjectWorktreeTree(input: BuildInput): SidebarProjectWorktreeTree {
    throw new Error("not implemented");
  }
  ```

- [ ] **Step 2: Write the test cases**. In `sidebarWorktreeGrouping.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { buildProjectWorktreeTree, ROOT_WORKTREE_ID } from "./sidebarWorktreeGrouping";
  import { ProjectId } from "@t3tools/contracts";

  const project = (overrides: Partial<BuildInput> = {}) => ({
    projectId: ProjectId.make("p1"),
    projectCwd: "/repo",
    threads: [],
    worktrees: [],
    ...overrides,
  });

  describe("buildProjectWorktreeTree", () => {
    it("returns root node when no threads and no extra worktrees", () => {
      const tree = buildProjectWorktreeTree(project());
      expect(tree.nodes).toHaveLength(1);
      expect(tree.nodes[0]).toMatchObject({
        id: ROOT_WORKTREE_ID,
        isSynthetic: true,
        threads: [],
      });
    });

    it("places threads with worktreePath null under the synthetic root", () => {
      const tree = buildProjectWorktreeTree(
        project({ threads: [makeThread({ id: "t1", worktreePath: null })] }),
      );
      expect(tree.nodes).toHaveLength(1);
      expect(tree.nodes[0].threads).toHaveLength(1);
      expect(tree.nodes[0].threads[0].id).toBe("t1");
    });

    it("creates a node per worktree from listWorktrees output", () => {
      const tree = buildProjectWorktreeTree(
        project({
          worktrees: [
            { path: "/repo", branch: "main", isMain: true } as VcsWorktree,
            { path: "/repo-feat", branch: "feat/x", isMain: false } as VcsWorktree,
          ],
        }),
      );
      // Synthetic root + main worktree dedup: the main worktree path matches projectCwd,
      // so root node is folded into it (decision: synthetic root and main checkout share a node).
      // Plus one branch worktree.
      expect(tree.nodes).toHaveLength(2);
      expect(tree.nodes[0].id).toBe(ROOT_WORKTREE_ID);
      expect(tree.nodes[1].branch).toBe("feat/x");
    });

    it("groups threads under their matching worktree by path", () => {
      const tree = buildProjectWorktreeTree(
        project({
          worktrees: [
            { path: "/repo", branch: "main", isMain: true } as VcsWorktree,
            { path: "/repo-feat", branch: "feat/x", isMain: false } as VcsWorktree,
          ],
          threads: [
            makeThread({ id: "t-root", worktreePath: null }),
            makeThread({ id: "t-feat", worktreePath: "/repo-feat" }),
          ],
        }),
      );
      const root = tree.nodes.find((n) => n.id === ROOT_WORKTREE_ID)!;
      const feat = tree.nodes.find((n) => n.branch === "feat/x")!;
      expect(root.threads.map((t) => t.id)).toEqual(["t-root"]);
      expect(feat.threads.map((t) => t.id)).toEqual(["t-feat"]);
    });

    it("retains worktree node when it disappears from list but a thread still references it (visibility OR rule)", () => {
      const tree = buildProjectWorktreeTree(
        project({
          worktrees: [{ path: "/repo", branch: "main", isMain: true } as VcsWorktree],
          threads: [makeThread({ id: "t-orphan", worktreePath: "/repo-removed" })],
        }),
      );
      const orphan = tree.nodes.find((n) => n.worktreePath === "/repo-removed");
      expect(orphan).toBeDefined();
      expect(orphan!.threads).toHaveLength(1);
    });

    it("orders nodes: root first, then worktrees alpha by branch (null branches last)", () => {
      const tree = buildProjectWorktreeTree(
        project({
          worktrees: [
            { path: "/repo-zeta", branch: "feat/zeta", isMain: false } as VcsWorktree,
            { path: "/repo", branch: "main", isMain: true } as VcsWorktree,
            { path: "/repo-alpha", branch: "feat/alpha", isMain: false } as VcsWorktree,
            { path: "/repo-detached", branch: null, isMain: false } as VcsWorktree,
          ],
        }),
      );
      expect(tree.nodes.map((n) => n.id)).toEqual([
        ROOT_WORKTREE_ID,
        "/repo-alpha",
        "/repo-zeta",
        "/repo-detached",
      ]);
    });

    it("interleaves agents and sub-agents within a node by createdAt", () => {
      const tree = buildProjectWorktreeTree(
        project({
          threads: [
            makeThread({
              id: "a1",
              worktreePath: null,
              kind: "agent",
              createdAt: "2026-01-01T00:00:00Z",
            }),
            makeThread({
              id: "s1",
              worktreePath: null,
              kind: "subagent",
              createdAt: "2026-01-02T00:00:00Z",
            }),
            makeThread({
              id: "a2",
              worktreePath: null,
              kind: "agent",
              createdAt: "2026-01-03T00:00:00Z",
            }),
          ],
        }),
      );
      // Newest first within a node — match sidebar's existing thread ordering convention
      expect(tree.nodes[0].threads.map((t) => t.id)).toEqual(["a2", "s1", "a1"]);
    });
  });

  // Local helper:
  function makeThread(overrides: Partial<SidebarThreadSummary>): SidebarThreadSummary {
    return {
      id: "t" as ThreadId,
      projectId: ProjectId.make("p1"),
      title: "thread",
      worktreePath: null,
      branch: null,
      kind: "agent",
      parentThreadId: null,
      createdAt: "2026-01-01T00:00:00Z",
      // ... fill the rest of the SidebarThreadSummary minimal fields
      ...overrides,
    } as SidebarThreadSummary;
  }
  ```

  > **Note:** `kind` and `parentThreadId` arrive on `SidebarThreadSummary` in Phase 2. For Phase 1, treat them as optional/default `"agent"` / `null` if the type doesn't yet have them — the `interleaves agents and sub-agents` test should be marked `it.skip(...)` until Phase 2 lands. Keep the test in place as a scaffold so Phase 2 only un-skips and adjusts.

- [ ] **Step 3: Run failing tests**

  ```bash
  bun run test apps/web/src/sidebarWorktreeGrouping.test.ts
  ```

  Expected: FAIL — `not implemented`.

- [ ] **Step 4: Implement `buildProjectWorktreeTree`**.

  ```ts
  export function buildProjectWorktreeTree(input: BuildInput): SidebarProjectWorktreeTree {
    type WritableNode = SidebarWorktreeNode & { threads: SidebarThreadSummary[] };

    const nodesById = new Map<WorktreeNodeId, WritableNode>();

    // 1. Always insert the synthetic root node.
    //    If a main worktree matches projectCwd, fold its metadata in.
    const mainWorktree = input.worktrees.find((w) => w.isMain && w.path === input.projectCwd);
    nodesById.set(ROOT_WORKTREE_ID, {
      id: ROOT_WORKTREE_ID,
      displayLabel: mainWorktree?.branch ?? "(repo root)",
      worktreePath: mainWorktree?.path ?? null,
      branch: mainWorktree?.branch ?? null,
      isMain: mainWorktree !== undefined,
      isSynthetic: mainWorktree === undefined,
      threads: [],
    });

    // 2. Insert a node per non-main (or non-projectCwd) worktree.
    for (const w of input.worktrees) {
      if (w === mainWorktree) continue;
      nodesById.set(w.path, {
        id: w.path,
        displayLabel: w.branch ?? basename(w.path),
        worktreePath: w.path,
        branch: w.branch,
        isMain: w.isMain,
        isSynthetic: false,
        threads: [],
      });
    }

    // 3. Place threads under their worktree node, creating "removed" nodes
    //    for threads whose worktreePath is no longer in the live list.
    for (const thread of input.threads) {
      const path = thread.worktreePath;
      if (path === null || path === input.projectCwd) {
        nodesById.get(ROOT_WORKTREE_ID)!.threads.push(thread);
        continue;
      }
      let node = nodesById.get(path);
      if (!node) {
        node = {
          id: path,
          displayLabel: `${basename(path)} (removed)`,
          worktreePath: path,
          branch: null,
          isMain: false,
          isSynthetic: false,
          threads: [],
        };
        nodesById.set(path, node);
      }
      node.threads.push(thread);
    }

    // 4. Sort threads within each node by createdAt desc.
    for (const node of nodesById.values()) {
      node.threads.sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
      );
    }

    // 5. Order nodes: root first, then non-root by branch alpha (null branches last).
    const nonRoot = [...nodesById.values()].filter((n) => n.id !== ROOT_WORKTREE_ID);
    nonRoot.sort((a, b) => {
      if (a.branch === null && b.branch === null) return a.id.localeCompare(b.id);
      if (a.branch === null) return 1;
      if (b.branch === null) return -1;
      return a.branch.localeCompare(b.branch);
    });

    return {
      projectId: input.projectId,
      nodes: [nodesById.get(ROOT_WORKTREE_ID)!, ...nonRoot],
    };
  }

  function basename(p: string): string {
    const parts = p.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
    return parts[parts.length - 1] ?? p;
  }
  ```

  Keep the function pure — no I/O, no mutation of inputs.

- [ ] **Step 5: Run tests**

  ```bash
  bun run test apps/web/src/sidebarWorktreeGrouping.test.ts
  ```

  Expected: PASS (with `interleaves` test skipped pending Phase 2).

- [ ] **Step 6: Commit**
  ```bash
  git add apps/web/src/sidebarWorktreeGrouping.ts apps/web/src/sidebarWorktreeGrouping.test.ts
  git commit -m "feat(web): pure derivation buildProjectWorktreeTree with tests"
  ```

---

## Task 8 — Build `SidebarWorktreeGroup.tsx` component

**Files:**

- Create: `apps/web/src/components/sidebar/SidebarWorktreeGroup.tsx`

The component renders one worktree node: a header row (collapsible disclosure, label, branch + status, count badge) and the list of thread rows beneath it. Thread row rendering is delegated to whatever `Sidebar.tsx` uses today — we pass the threads through as a render-prop callback so we don't have to know thread-row details.

- [ ] **Step 1: Read the existing thread row markup** in `apps/web/src/components/Sidebar.tsx` to understand styling conventions and which CSS classes are in use.

- [ ] **Step 2: Implement the component**.

  ```tsx
  import * as React from "react";
  import type { SidebarWorktreeNode } from "../../sidebarWorktreeGrouping";
  import type { SidebarThreadSummary } from "../../types";

  export interface SidebarWorktreeGroupProps {
    node: SidebarWorktreeNode;
    initiallyOpen?: boolean;
    renderThreadRow: (thread: SidebarThreadSummary) => React.ReactNode;
  }

  export function SidebarWorktreeGroup({
    node,
    initiallyOpen = true,
    renderThreadRow,
  }: SidebarWorktreeGroupProps) {
    const [open, setOpen] = React.useState(initiallyOpen);

    return (
      <div data-worktree-id={node.id} className="sidebar-worktree-group">
        <button
          type="button"
          className="sidebar-worktree-group__header"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <Chevron open={open} />
          <span className="sidebar-worktree-group__label">{node.displayLabel}</span>
          {node.branch && node.branch !== node.displayLabel && (
            <span className="sidebar-worktree-group__branch">{node.branch}</span>
          )}
          {node.threads.length > 0 && (
            <span className="sidebar-worktree-group__count">{node.threads.length}</span>
          )}
        </button>
        {open && (
          <ul className="sidebar-worktree-group__threads">
            {node.threads.map((t) => (
              <li key={t.id}>{renderThreadRow(t)}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function Chevron({ open }: { open: boolean }) {
    return <span aria-hidden="true">{open ? "▾" : "▸"}</span>;
  }
  ```

  Match the project's existing CSS class naming convention (BEM-ish, kebab-case) — adjust if the project uses Tailwind / something else.

- [ ] **Step 3: Add a lightweight component test** (optional but recommended) — verify open/close toggle, count display, render-prop call.

- [ ] **Step 4: Run typecheck**

  ```bash
  bun run typecheck
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/components/sidebar/SidebarWorktreeGroup.tsx
  git commit -m "feat(web): SidebarWorktreeGroup component for collapsible worktree nodes"
  ```

---

## Task 9 — Surgical integration into `Sidebar.tsx`

**Files:**

- Modify: `apps/web/src/components/Sidebar.tsx` (3393 lines — minimize edits)

The goal: where the sidebar currently maps over a project's threads inline, instead build the worktree tree and render `SidebarWorktreeGroup` per node, passing the existing thread-row JSX as a render prop.

- [ ] **Step 1: Read the project section + thread mapping in `Sidebar.tsx`** to find the exact spot where threads are rendered for a project. Search for `memberProjects` / `threads.map` / where `SidebarThreadSummary` is consumed.

- [ ] **Step 2: Extract the per-thread row JSX into a stable `renderThreadRow` helper**, scoped to the current render so it has access to selection state, callbacks, etc. This is the only restructuring; keep state and selection logic where they are.

- [ ] **Step 3: Replace the inline `threads.map(...)`** with:

  ```tsx
  const tree = React.useMemo(
    () =>
      buildProjectWorktreeTree({
        projectId: project.id,
        projectCwd: project.cwd,
        threads: projectThreads,
        worktrees: worktreesForProject,
      }),
    [project.id, project.cwd, projectThreads, worktreesForProject],
  );

  return (
    <>
      {tree.nodes.map((node) => (
        <SidebarWorktreeGroup key={node.id} node={node} renderThreadRow={renderThreadRow} />
      ))}
    </>
  );
  ```

  `worktreesForProject` comes from `selectWorktreesForProject(state, project.id)`.

- [ ] **Step 4: Verify visual correctness manually**.

  ```bash
  cd /home/jgigg/code/t3code-agent-worktree-tree && bun install && bun run dev
  ```

  Open the web UI. Each project should show worktree nodes (at minimum the synthetic root) with threads grouped underneath.

- [ ] **Step 5: Run all gates**

  ```bash
  bun fmt && bun lint && bun run typecheck && bun run test
  ```

  Expected: PASS on all four. **AGENTS.md mandates these pass before claiming completion.**

- [ ] **Step 6: Commit**
  ```bash
  git add apps/web/src/components/Sidebar.tsx
  git commit -m "feat(web): group threads by worktree under each project in sidebar"
  ```

---

## Task 10 — Manual smoke + final verification

- [ ] **Step 1: Verify the manual smoke checklist for Phase 1** (subset of spec §9.4 manual smoke):
  1. Open the web UI. Each project shows a list of worktree nodes (including a "(repo root)" or branch-named root node), with threads grouped underneath.
  2. With the dev server running, in a separate terminal run `git worktree add ../t3code-test-smoke -b smoke/test` from the same project's path. Within ~3s the new worktree node should appear in the sidebar.
  3. Run `git worktree remove ../t3code-test-smoke` from the same project's path. Within ~3s the new node should disappear (assuming no threads are on it).
  4. Threads with `worktreePath === null` (a thread started without a worktree picker) appear under the root node.
  5. A thread whose `worktreePath` no longer exists in `git worktree list` keeps its sidebar parent (orphan node with "(removed)" suffix).

- [ ] **Step 2: Re-run all gates one last time**

  ```bash
  bun fmt && bun lint && bun run typecheck && bun run test
  ```

  Expected: PASS on all four.

- [ ] **Step 3: Tick all boxes in this plan file** — convert every `- [ ]` to `- [x]`. This rides along with the next commit.

- [ ] **Step 4: Make the feature-complete commit**

  ```bash
  git add .agents/plans/2026-05-05-1500-agent-worktree-subagent-tree-phase-1.md
  git commit -m "$(cat <<'EOF'
  feat(web): worktree-grouped sidebar [feature-complete]

  Phase 1 of the agent / worktree / sub-agent tree feature.

  Surfaces every git worktree of each project as a node in the sidebar,
  with threads grouped under their matching worktree (synthetic "(repo
  root)" node holds threads with no worktreePath). Worktrees are derived
  from `git worktree list --porcelain` per project, polled every 3s and
  refreshed synchronously after t3code-initiated create/remove. Web app
  receives WS pushes (project.worktreesUpdated) and renders via a new
  pure derivation (sidebarWorktreeGrouping) and SidebarWorktreeGroup
  component. No new orchestration schema.

  Phases 2-4 follow in their own plans.

  Feature-Complete: true
  Plan: .agents/plans/2026-05-05-1500-agent-worktree-subagent-tree-phase-1.md
  EOF
  )"
  ```

- [ ] **Step 5: Push the branch and open a PR targeting the testing branch** (the project flow per the user's CLAUDE.md is feature → staging if it exists, else main):

  ```bash
  git push -u origin feat/agent-worktree-subagent-tree
  gh pr create --title "feat(web): worktree-grouped sidebar (Phase 1 of agent tree feature)" --body "$(cat <<'EOF'
  ## Summary
  - Group threads by git worktree in the project sidebar.
  - New `WorktreeDiscovery` service polls `git worktree list --porcelain` per project; pushes updates over WS.
  - Pure derivation `sidebarWorktreeGrouping.ts` + new `SidebarWorktreeGroup` component.
  - No new orchestration schema; reuses `VcsWorktree` contract.

  Plan: `.agents/plans/2026-05-05-1500-agent-worktree-subagent-tree-phase-1.md`
  Spec: `docs/superpowers/specs/2026-05-05-agent-worktree-subagent-tree-design.md`

  ## Test plan
  - [ ] Worktree nodes appear under each project (incl. synthetic root).
  - [ ] External `git worktree add` reflected in sidebar within ~3s.
  - [ ] External `git worktree remove` reflected in sidebar within ~3s.
  - [ ] Threads with `worktreePath === null` appear under root.
  - [ ] Errored threads on removed worktrees keep their sidebar parent.
  - [ ] All four gates pass: `bun fmt && bun lint && bun run typecheck && bun run test`.
  EOF
  )"
  ```

---

## Out of scope for Phase 1 (deferred to later phases)

- `parentThreadId` / `kind` on threads (Phase 2)
- Sub-agent badge + read-only chrome + back button (Phase 2)
- `T3OrchestrationMcpServer`, `t3_spawn_agent`, `t3_create_worktree` tools (Phase 3)
- `SubagentRouter` with retries / timeouts / concurrency / cross-provider (Phase 3)
- Native Task interception per provider (Phase 4)

When Phase 1 lands and is merged, open a fresh worktree (`git worktree add ../t3code-phase-2 -b feat/agent-tree-phase-2-subagent-thread-kind`) and start Phase 2 in a fresh chat per the feature-momentum rule.
