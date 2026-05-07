import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { selectWorktreesForProject } from "./storeSelectors";
import type { AppState } from "./store";

function makeState(overrides: Partial<AppState> = {}): AppState {
  return {
    activeEnvironmentId: null,
    environmentStateById: {},
    worktreesByProjectId: new Map(),
    ...overrides,
  };
}

describe("selectWorktreesForProject", () => {
  it("returns a stable empty array when the project has no worktree snapshot", () => {
    const state = makeState();
    const projectId = ProjectId.make("project-without-worktrees");

    expect(selectWorktreesForProject(state, projectId)).toBe(
      selectWorktreesForProject(state, projectId),
    );
  });
});
