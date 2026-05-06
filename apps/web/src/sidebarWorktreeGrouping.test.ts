import { describe, it, expect } from "vitest";
import {
  buildProjectWorktreeTree,
  ROOT_WORKTREE_ID,
  type BuildInput,
} from "./sidebarWorktreeGrouping";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import type { SidebarThreadSummary } from "./types";
import type { VcsWorktree } from "@t3tools/contracts";

const localEnvironmentId = EnvironmentId.make("environment-local");

const project = (overrides: Partial<BuildInput> = {}): BuildInput => ({
  projectId: ProjectId.make("p1"),
  projectCwd: "/repo",
  threads: [],
  worktrees: [],
  ...overrides,
});

function makeThread(
  overrides: Omit<Partial<SidebarThreadSummary>, "id"> & { id: string },
): SidebarThreadSummary {
  const { id, ...rest } = overrides;
  return {
    id: ThreadId.make(id),
    environmentId: localEnvironmentId,
    projectId: ProjectId.make("p1"),
    title: "thread",
    interactionMode: "default",
    session: null,
    createdAt: "2026-01-01T00:00:00Z",
    archivedAt: null,
    updatedAt: undefined,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...rest,
  };
}

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
    expect(tree.nodes[0]!.threads).toHaveLength(1);
    expect(tree.nodes[0]!.threads[0]!.id).toBe(ThreadId.make("t1"));
  });

  it("creates a node per worktree from listWorktrees output and folds main into root", () => {
    const tree = buildProjectWorktreeTree(
      project({
        worktrees: [
          {
            path: "/repo",
            branch: "main",
            headRef: null,
            isMain: true,
            isLocked: false,
          } as VcsWorktree,
          {
            path: "/repo-feat",
            branch: "feat/x",
            headRef: null,
            isMain: false,
            isLocked: false,
          } as VcsWorktree,
        ],
      }),
    );
    expect(tree.nodes).toHaveLength(2);
    expect(tree.nodes[0]!.id).toBe(ROOT_WORKTREE_ID);
    expect(tree.nodes[0]!.branch).toBe("main");
    expect(tree.nodes[0]!.isMain).toBe(true);
    expect(tree.nodes[0]!.isSynthetic).toBe(false);
    expect(tree.nodes[1]!.branch).toBe("feat/x");
  });

  it("groups threads under their matching worktree by path", () => {
    const tree = buildProjectWorktreeTree(
      project({
        worktrees: [
          {
            path: "/repo",
            branch: "main",
            headRef: null,
            isMain: true,
            isLocked: false,
          } as VcsWorktree,
          {
            path: "/repo-feat",
            branch: "feat/x",
            headRef: null,
            isMain: false,
            isLocked: false,
          } as VcsWorktree,
        ],
        threads: [
          makeThread({ id: "t-root", worktreePath: null }),
          makeThread({ id: "t-feat", worktreePath: "/repo-feat" }),
        ],
      }),
    );
    const root = tree.nodes.find((n) => n.id === ROOT_WORKTREE_ID)!;
    const feat = tree.nodes.find((n) => n.branch === "feat/x")!;
    expect(root.threads.map((t) => t.id)).toEqual([ThreadId.make("t-root")]);
    expect(feat.threads.map((t) => t.id)).toEqual([ThreadId.make("t-feat")]);
  });

  it("retains worktree node when it disappears from list but a thread still references it (visibility OR rule)", () => {
    const tree = buildProjectWorktreeTree(
      project({
        worktrees: [
          {
            path: "/repo",
            branch: "main",
            headRef: null,
            isMain: true,
            isLocked: false,
          } as VcsWorktree,
        ],
        threads: [makeThread({ id: "t-orphan", worktreePath: "/repo-removed" })],
      }),
    );
    const orphan = tree.nodes.find((n) => n.worktreePath === "/repo-removed");
    expect(orphan).toBeDefined();
    expect(orphan!.displayLabel).toContain("removed");
    expect(orphan!.threads).toHaveLength(1);
  });

  it("orders nodes: root first, then worktrees alpha by branch (null branches last)", () => {
    const tree = buildProjectWorktreeTree(
      project({
        worktrees: [
          {
            path: "/repo-zeta",
            branch: "feat/zeta",
            headRef: null,
            isMain: false,
            isLocked: false,
          } as VcsWorktree,
          {
            path: "/repo",
            branch: "main",
            headRef: null,
            isMain: true,
            isLocked: false,
          } as VcsWorktree,
          {
            path: "/repo-alpha",
            branch: "feat/alpha",
            headRef: null,
            isMain: false,
            isLocked: false,
          } as VcsWorktree,
          {
            path: "/repo-detached",
            branch: null,
            headRef: null,
            isMain: false,
            isLocked: false,
          } as VcsWorktree,
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

  it("sorts threads within a node by createdAt desc", () => {
    const tree = buildProjectWorktreeTree(
      project({
        threads: [
          makeThread({
            id: "older",
            worktreePath: null,
            createdAt: "2026-01-01T00:00:00Z",
          }),
          makeThread({
            id: "newer",
            worktreePath: null,
            createdAt: "2026-01-03T00:00:00Z",
          }),
          makeThread({
            id: "mid",
            worktreePath: null,
            createdAt: "2026-01-02T00:00:00Z",
          }),
        ],
      }),
    );
    const rootNode = tree.nodes[0];
    expect(rootNode).toBeDefined();
    expect(rootNode!.threads.map((t) => t.id)).toEqual([
      ThreadId.make("newer"),
      ThreadId.make("mid"),
      ThreadId.make("older"),
    ]);
  });
});
