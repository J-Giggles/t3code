import { describe, expect, it } from "vite-plus/test";

import { makeT3ObservabilityResourceAttributesFromEnv } from "./observabilityResource.ts";

describe("observabilityResource", () => {
  it("builds stable t3 resource attributes from env and omits blank values", () => {
    expect(
      makeT3ObservabilityResourceAttributesFromEnv(
        {
          T3CODE_WORKTREE_ROLE: " staging ",
          T3CODE_WORKTREE_PATH: " /repo/staging ",
          T3CODE_GIT_BRANCH: " staging ",
          T3CODE_GIT_COMMIT: " abc123 ",
          T3CODE_DEV_INSTANCE: "",
          T3CODE_HOME: " /tmp/t3 ",
        },
        {
          serviceVersion: "1.2.3",
          runtimeMode: "desktop",
          providerInstanceId: "codex",
        },
      ),
    ).toEqual({
      "service.version": "1.2.3",
      "service.runtime": "desktop",
      "t3.runtime.mode": "desktop",
      "t3.worktree.role": "staging",
      "t3.worktree.path": "/repo/staging",
      "t3.git.branch": "staging",
      "t3.git.commit": "abc123",
      "t3.home": "/tmp/t3",
      "t3.provider.instance_id": "codex",
    });
  });
});
