/**
 * WorktreeDiscoveryLive - Live implementation of WorktreeDiscovery.
 *
 * Per-project: keeps a Ref<readonly VcsWorktree[]> of the last-known set
 * and a PubSub<WorktreeStateSnapshot> that subscribers consume from. On the
 * first subscribe() call for a project, a polling fiber is forked (tied to
 * the Layer scope) that ticks every POLL_INTERVAL_MS milliseconds. An
 * immediate initial tick is run synchronously so the first snapshot is
 * visible to subscribers before the polling loop starts.
 * invalidate() forces an immediate re-poll.
 *
 * @module WorktreeDiscoveryLive
 */
import type { ProjectId, VcsWorktree } from "@t3tools/contracts";
import { Cause, Effect, Exit, Layer, PubSub, Ref, Scope, Stream } from "effect";

import { GitVcsDriver } from "../../vcs/GitVcsDriver.ts";
import { WorktreeDiscovery } from "../Services/WorktreeDiscovery.ts";
import type {
  WorktreeDiscoveryShape,
  WorktreeStateSnapshot,
} from "../Services/WorktreeDiscovery.ts";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Per-project mutable state held in the service's state map. */
interface ProjectState {
  /** The project's working directory (supplied by the first subscriber). */
  readonly cwd: string;
  /** Last-known worktree set — compared on each tick to detect changes. */
  readonly lastSet: Ref.Ref<readonly VcsWorktree[]>;
  /** PubSub — all stream subscribers receive snapshots from here. */
  readonly pubsub: PubSub.PubSub<WorktreeStateSnapshot>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compare two worktree sets by sorted paths (set semantics — order ignored).
 */
const worktreeSetEqual = (a: readonly VcsWorktree[], b: readonly VcsWorktree[]): boolean => {
  if (a.length !== b.length) return false;
  const aPaths = [...a].map((w) => w.path).sort();
  const bPaths = [...b].map((w) => w.path).sort();
  return aPaths.every((p, i) => p === bPaths[i]);
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

/** How often (in ms) the background fiber re-polls git. */
const POLL_INTERVAL_MS = 3000;

const make = Effect.gen(function* () {
  const driver = yield* GitVcsDriver;

  // Acquire a Scope that lives as long as the Layer. All per-project polling
  // fibers are forked into this scope and are interrupted on Layer release.
  const layerScope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
    Scope.close(scope, Exit.void),
  );

  // Map<ProjectId, ProjectState> — per-project state lazily initialised on
  // the first subscribe() call.
  const stateMapRef = yield* Ref.make(new Map<ProjectId, ProjectState>());

  // ---------------------------------------------------------------------------
  // Per-tick logic
  // ---------------------------------------------------------------------------

  /**
   * Run a single poll for the given project state: call listWorktrees, diff
   * against lastSet, publish a new snapshot only when the set has changed.
   * Errors are logged and swallowed so the polling fiber keeps running.
   */
  const runTick = (projectId: ProjectId, state: ProjectState): Effect.Effect<void> =>
    Effect.gen(function* () {
      const next = yield* driver.listWorktrees(state.cwd);
      const last = yield* Ref.get(state.lastSet);
      if (!worktreeSetEqual(last, next)) {
        yield* Ref.set(state.lastSet, next);
        yield* PubSub.publish(state.pubsub, { projectId, worktrees: next }).pipe(Effect.asVoid);
      }
    }).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.interrupt;
        }
        return Effect.logWarning("WorktreeDiscovery: listWorktrees failed; will retry", {
          projectId,
          cwd: state.cwd,
          cause: Cause.pretty(cause),
        });
      }),
    );

  /**
   * Background polling loop — runs forever until interrupted.
   * Sleeps for POLL_INTERVAL_MS between each tick.
   */
  const pollLoop = (projectId: ProjectId, state: ProjectState): Effect.Effect<void> =>
    Effect.forever(Effect.sleep(POLL_INTERVAL_MS).pipe(Effect.andThen(runTick(projectId, state))));

  // ---------------------------------------------------------------------------
  // Lazy per-project state initialisation
  // ---------------------------------------------------------------------------

  /**
   * Initialise state for a project that has never been subscribed before.
   * Runs the first tick immediately so subscribers get the initial snapshot
   * within one tick, then forks the background polling loop into layerScope.
   */
  const createProjectState = (projectId: ProjectId, cwd: string): Effect.Effect<ProjectState> =>
    Effect.gen(function* () {
      const lastSet = yield* Ref.make<readonly VcsWorktree[]>([]);
      const pubsub = yield* PubSub.unbounded<WorktreeStateSnapshot>();

      const state: ProjectState = { cwd, lastSet, pubsub };

      // Run the initial tick to populate lastSet. subscribe() will prepend
      // the current lastSet value so new subscribers see the initial snapshot
      // without needing a live PubSub delivery (which would race).
      yield* runTick(projectId, state);

      // Fork the polling loop into the Layer scope so it lives for the
      // lifetime of the Layer, not just the current subscriber's scope.
      yield* Effect.forkIn(pollLoop(projectId, state), layerScope);

      yield* Ref.update(stateMapRef, (m) => {
        const next = new Map(m);
        next.set(projectId, state);
        return next;
      });

      return state;
    });

  /**
   * Retrieve existing state or lazily create it for the given project.
   * If state already exists, the supplied cwd is ignored (first caller wins).
   */
  const getOrCreateProjectState = (
    projectId: ProjectId,
    cwd: string,
  ): Effect.Effect<ProjectState> =>
    Ref.get(stateMapRef).pipe(
      Effect.flatMap((m) => {
        const existing = m.get(projectId);
        if (existing !== undefined) {
          return Effect.succeed(existing);
        }
        return createProjectState(projectId, cwd);
      }),
    );

  // ---------------------------------------------------------------------------
  // Service implementation
  // ---------------------------------------------------------------------------

  const subscribe: WorktreeDiscoveryShape["subscribe"] = (projectId, cwd) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const state = yield* getOrCreateProjectState(projectId, cwd);
        // Prepend the last-known snapshot so the subscriber immediately gets
        // the current state, followed by live updates from the PubSub.
        const current = yield* Ref.get(state.lastSet);
        const initialSnapshot: WorktreeStateSnapshot = { projectId, worktrees: current };
        return Stream.concat(Stream.make(initialSnapshot), Stream.fromPubSub(state.pubsub));
      }),
    );

  const invalidate: WorktreeDiscoveryShape["invalidate"] = (projectId) =>
    Effect.gen(function* () {
      const stateMap = yield* Ref.get(stateMapRef);
      const state = stateMap.get(projectId);
      if (state === undefined) {
        // Silent no-op — project has not been subscribed yet.
        return;
      }
      yield* runTick(projectId, state);
    });

  return {
    subscribe,
    invalidate,
  } satisfies WorktreeDiscoveryShape;
});

export const WorktreeDiscoveryLive = Layer.effect(WorktreeDiscovery, make);
