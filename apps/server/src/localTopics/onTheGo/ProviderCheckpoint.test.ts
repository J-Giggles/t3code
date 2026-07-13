import { describe, expect, it } from "vite-plus/test";

import { classifyProviderActivity } from "./ProviderCheckpoint.ts";

describe("On-the-Go provider checkpoints", () => {
  it("OTG-UT-017/018: maps approvals, blockers, tests, and failures conservatively", () => {
    expect(
      classifyProviderActivity({ tone: "approval", kind: "request", summary: "Approve" }),
    ).toBe("approval");
    expect(
      classifyProviderActivity({ tone: "info", kind: "user-input", summary: "Question" }),
    ).toBe("blocked");
    expect(
      classifyProviderActivity({ tone: "tool", kind: "command", summary: "Tests passed" }),
    ).toBe("tests");
    expect(classifyProviderActivity({ tone: "error", kind: "provider", summary: "Failed" })).toBe(
      "failed",
    );
  });

  it("OTG-UT-017: keeps unknown raw provider events silent", () => {
    expect(
      classifyProviderActivity({ tone: "tool", kind: "custom-vendor-payload", summary: "tick" }),
    ).toBeNull();
  });
});
