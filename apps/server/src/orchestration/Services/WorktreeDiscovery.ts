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
import type { GitCommandError, ProjectId, VcsWorktree } from "@t3tools/contracts";
import { Context } from "effect";
import type { Effect, Stream } from "effect";

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
  ) => Stream.Stream<WorktreeStateSnapshot, GitCommandError, never>;

  /**
   * Force an immediate re-poll for a project. Used by the VCS layer
   * after t3code-initiated createWorktree / removeWorktree so the new
   * state is visible without waiting for the next tick.
   */
  readonly invalidate: (projectId: ProjectId) => Effect.Effect<void>;
}

export class WorktreeDiscovery extends Context.Service<WorktreeDiscovery, WorktreeDiscoveryShape>()(
  "t3/orchestration/Services/WorktreeDiscovery",
) {}
