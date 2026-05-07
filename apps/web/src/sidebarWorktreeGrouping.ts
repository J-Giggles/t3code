import type { ProjectId, VcsWorktree } from "@t3tools/contracts";
import type { SidebarThreadSummary } from "./types";

export const ROOT_WORKTREE_ID = "__root__" as const;
export type WorktreeNodeId = string; // either a path, or ROOT_WORKTREE_ID

export interface SidebarWorktreeNode {
  readonly id: WorktreeNodeId;
  readonly displayLabel: string; // e.g. "main" or "(repo root)"
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

  // 3. Place threads under their worktree node.
  //    Create "removed" nodes for threads whose worktreePath is no longer
  //    in the live list (visibility OR rule from the spec).
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
