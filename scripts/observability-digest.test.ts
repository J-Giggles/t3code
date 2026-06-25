import { describe, expect, it } from "vite-plus/test";

import { findWorktreeIdentityMismatches, summarizeMetricSeries } from "./observability-digest.ts";

describe("observability-digest", () => {
  it("detects stale inherited worktree roles from log metadata", () => {
    const mismatches = findWorktreeIdentityMismatches([
      {
        metric: {
          service_name: "t3-server",
          t3_worktree_role: "main",
          t3_git_branch: "staging",
          t3_dev_instance: "staging",
        },
        value: [0, "6"],
      },
    ]);

    expect(mismatches.join("\n")).toContain("role=main");
    expect(mismatches.join("\n")).toContain("staging");
  });

  it("summarizes metric series worktree label coverage", () => {
    expect(
      summarizeMetricSeries([
        { __name__: "t3_rpc_requests_total", service_name: "t3-server" },
        {
          __name__: "t3_rpc_requests_total",
          service_name: "t3-server",
          t3_worktree_role: "staging",
        },
      ]),
    ).toEqual({
      total: 2,
      withWorktreeRole: 1,
      withoutWorktreeRole: 1,
    });
  });
});
