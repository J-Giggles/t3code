import { describe, expect, it } from "vitest";

import { loadOptimizePromptSkill } from "./loadSkill";

describe("loadOptimizePromptSkill", () => {
  it("returns a non-empty string longer than 100 characters", () => {
    const skill = loadOptimizePromptSkill();

    expect(typeof skill).toBe("string");
    expect(skill.length).toBeGreaterThan(100);
  });

  it("contains the role line", () => {
    expect(loadOptimizePromptSkill()).toMatch(/prompt-rewriter for a coding agent/i);
  });
});
