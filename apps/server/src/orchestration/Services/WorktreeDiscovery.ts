/**
 * WorktreeDiscovery module - Periodic per-project worktree poller.
 *
 * Tracks the set of git worktrees for each registered project, diffs
 * against the previously-observed set on each tick, and emits add/remove
 * updates as a Stream. Updates are also emitted synchronously when
 * t3code-initiated worktree creation/removal occurs (via invalidate()).
 *
 * @module WorktreeDiscovery
 */
import type { GitCommandError, ProjectId, VcsWorktree } from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect, Stream } from "effect";

/**
 * WorktreeStateSnapshot - Snapshot of the live worktree set for a project.
 */
export interface WorktreeStateSnapshot {
  readonly projectId: ProjectId;
  readonly worktrees: readonly VcsWorktree[];
}

/**
 * WorktreeDiscoveryShape - Service API for per-project worktree discovery.
 */
export interface WorktreeDiscoveryShape {
  /**
   * Register a project for periodic discovery. Returns a stream of
   * worktree-state snapshots: an initial snapshot is emitted within one
   * tick, then a new snapshot whenever the worktree set changes.
   *
   * Subscribers are responsible for cleanup (close the stream / scope).
   * The `cwd` parameter is required because the service does not maintain a project→cwd registry; callers are responsible for supplying the working directory.
   */
  readonly subscribe: (
    projectId: ProjectId,
    cwd: string,
  ) => Stream.Stream<WorktreeStateSnapshot, GitCommandError, never>;

  /**
   * Force an immediate re-poll for a project. Used by the VCS layer
   * after t3code-initiated createWorktree / removeWorktree so the new
   * state is visible without waiting for the next tick.
   * Silent no-op for projects that have not been subscribed yet.
   */
  readonly invalidate: (projectId: ProjectId) => Effect.Effect<void>;
}

/**
 * WorktreeDiscovery - Service tag for worktree discovery.
 */
export class WorktreeDiscovery extends Context.Service<WorktreeDiscovery, WorktreeDiscoveryShape>()(
  "t3/orchestration/Services/WorktreeDiscovery",
) {}
