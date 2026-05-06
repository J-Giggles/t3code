/**
 * WorktreeDiscovery Layer tests.
 *
 * Uses a stub GitVcsDriver to control what listWorktrees returns, and
 * verifies the Layer's snapshot emission, diff-on-add, no-change-no-emit,
 * and transient-error-recovery behaviours.
 *
 * Stubs are built with plain mutable JS variables rather than Effect Refs so
 * the layer can be fully defined at the outermost scope and provided via
 * `.pipe(Effect.provide(layer))` — keeping the Layer scope alive for the
 * entire test.
 */
import { Effect, Layer, Option, Queue, Stream } from "effect";
import { describe, expect, it } from "vitest";

import type { VcsWorktree } from "@t3tools/contracts";
import { GitCommandError, ProjectId } from "@t3tools/contracts";

import { GitVcsDriver } from "../../vcs/GitVcsDriver.ts";
import { WorktreeDiscovery } from "../Services/WorktreeDiscovery.ts";
import { WorktreeDiscoveryLive } from "./WorktreeDiscovery.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testProjectId = ProjectId.make("test-project");

function makeWorktree(path: string, branch: string, isMain: boolean): VcsWorktree {
  return { path, branch, headRef: null, isMain, isLocked: false };
}

/** Mutable stub state — plain JS so it can be captured in a layer closure. */
interface StubState {
  worktrees: VcsWorktree[];
  failNext: boolean;
}

/**
 * Build a WorktreeDiscovery layer whose GitVcsDriver reads from `state`.
 * The caller mutates `state` to control what listWorktrees returns.
 */
function makeLayerWithState(state: StubState): Layer.Layer<WorktreeDiscovery> {
  return WorktreeDiscoveryLive.pipe(
    Layer.provide(
      Layer.mock(GitVcsDriver)({
        listWorktrees: (_cwd: string) => {
          if (state.failNext) {
            state.failNext = false;
            return Effect.fail(
              new GitCommandError({
                operation: "git worktree list",
                command: "git worktree list --porcelain",
                cwd: "/repo",
                detail: "stub failure",
              }),
            );
          }
          return Effect.succeed([...state.worktrees]);
        },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WorktreeDiscovery", () => {
  it("subscribe emits an initial snapshot within one tick", () =>
    Effect.gen(function* () {
      const discovery = yield* WorktreeDiscovery;
      const stream = discovery.subscribe(testProjectId, "/repo");
      const first = yield* Stream.runHead(stream);
      expect(Option.isSome(first)).toBe(true);
      expect(Option.getOrThrow(first).worktrees).toHaveLength(1);
    }).pipe(
      Effect.provide(
        makeLayerWithState({ worktrees: [makeWorktree("/repo", "main", true)], failNext: false }),
      ),
      Effect.scoped,
      Effect.runPromise,
    ));

  it("emits a new snapshot when listWorktrees adds a worktree", () => {
    const state: StubState = {
      worktrees: [makeWorktree("/repo", "main", true)],
      failNext: false,
    };
    return Effect.gen(function* () {
      const discovery = yield* WorktreeDiscovery;
      // Collect items from the stream into a queue
      const queue = yield* Queue.unbounded<unknown>();
      // fork the stream drainer
      yield* Effect.forkScoped(
        Stream.runForEach(discovery.subscribe(testProjectId, "/repo"), (item) =>
          Queue.offer(queue, item),
        ),
      );
      // Wait for the initial item to land
      const first = yield* Queue.take(queue);
      expect((first as { worktrees: VcsWorktree[] }).worktrees).toHaveLength(1);
      // Update state and invalidate
      state.worktrees = [
        makeWorktree("/repo", "main", true),
        makeWorktree("/repo-feat", "feat/x", false),
      ];
      yield* discovery.invalidate(testProjectId);
      const second = yield* Queue.take(queue);
      expect((second as { worktrees: VcsWorktree[] }).worktrees).toHaveLength(2);
    }).pipe(Effect.provide(makeLayerWithState(state)), Effect.scoped, Effect.runPromise);
  });

  it("does not emit a duplicate snapshot when listWorktrees returns the same set", () =>
    Effect.gen(function* () {
      const discovery = yield* WorktreeDiscovery;
      // Collect items from the stream into a queue
      const queue = yield* Queue.unbounded<unknown>();
      yield* Effect.forkScoped(
        Stream.runForEach(discovery.subscribe(testProjectId, "/repo"), (item) =>
          Queue.offer(queue, item),
        ),
      );
      // Wait for the initial item
      yield* Queue.take(queue);
      // Trigger two no-change invalidations
      yield* discovery.invalidate(testProjectId);
      yield* discovery.invalidate(testProjectId);
      // Race: if a second item arrives within 200ms, that's a bug
      const maybeSecond = yield* Effect.race(
        Queue.take(queue).pipe(Effect.map(Option.some)),
        Effect.as(Effect.sleep("200 millis"), Option.none()),
      );
      expect(Option.isNone(maybeSecond)).toBe(true);
    }).pipe(
      Effect.provide(
        makeLayerWithState({ worktrees: [makeWorktree("/repo", "main", true)], failNext: false }),
      ),
      Effect.scoped,
      Effect.runPromise,
    ));

  it("recovers from transient listWorktrees failures", () => {
    const state: StubState = {
      worktrees: [makeWorktree("/repo", "main", true)],
      failNext: false,
    };
    return Effect.gen(function* () {
      const discovery = yield* WorktreeDiscovery;
      const queue = yield* Queue.unbounded<unknown>();
      yield* Effect.forkScoped(
        Stream.runForEach(discovery.subscribe(testProjectId, "/repo"), (item) =>
          Queue.offer(queue, item),
        ),
      );
      // Consume initial snapshot
      yield* Queue.take(queue);
      // Next call fails
      state.failNext = true;
      yield* discovery.invalidate(testProjectId);
      // Now succeeds with two worktrees
      state.worktrees = [
        makeWorktree("/repo", "main", true),
        makeWorktree("/repo-feat", "feat/x", false),
      ];
      yield* discovery.invalidate(testProjectId);
      const next = yield* Queue.take(queue);
      expect((next as { worktrees: VcsWorktree[] }).worktrees).toHaveLength(2);
    }).pipe(Effect.provide(makeLayerWithState(state)), Effect.scoped, Effect.runPromise);
  });
});
