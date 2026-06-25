import { describe, expect, it } from "vite-plus/test";

import {
  AGENT_HARNESS_MANIFEST_TEMPLATE,
  classifyAgentFilePath,
  getRecommendedAgentFileTemplates,
  instructionRuleDescription,
  isInstructionRulePath,
  normalizeAgentFilePath,
} from "./agentFiles.ts";

describe("agentFiles", () => {
  it("normalizes project-relative agent file paths", () => {
    expect(normalizeAgentFilePath("./.cursor\\rules\\project.mdc")).toBe(
      ".cursor/rules/project.mdc",
    );
    expect(normalizeAgentFilePath(".agents//memory/project-facts.md")).toBe(
      ".agents/memory/project-facts.md",
    );
  });

  it("classifies provider instruction and rule files", () => {
    expect(classifyAgentFilePath("AGENTS.md")).toMatchObject({
      providers: ["codex", "opencode"],
      kind: "instructions",
      autoLoaded: true,
      recommended: true,
    });
    expect(classifyAgentFilePath("packages/api/AGENTS.md")).toMatchObject({
      providers: ["codex", "opencode"],
      kind: "instructions",
      autoLoaded: true,
    });
    expect(classifyAgentFilePath("CLAUDE.md")).toMatchObject({
      providers: ["claude"],
      kind: "instructions",
    });
    expect(classifyAgentFilePath(".cursor/rules/frontend.mdc")).toMatchObject({
      providers: ["cursor"],
      kind: "provider-rule",
    });
    expect(classifyAgentFilePath(".github/instructions/react.instructions.md")).toMatchObject({
      providers: ["copilot"],
      kind: "instructions",
    });
    expect(classifyAgentFilePath("GEMINI.md")).toMatchObject({
      providers: ["gemini"],
      kind: "instructions",
    });
    expect(classifyAgentFilePath(".windsurfrules")).toMatchObject({
      providers: ["windsurf"],
      kind: "provider-rule",
    });
    expect(classifyAgentFilePath(".devin/rules/review.md")).toMatchObject({
      providers: ["devin"],
      kind: "provider-rule",
    });
    expect(classifyAgentFilePath(".codex/config.toml")).toMatchObject({
      providers: ["codex"],
      kind: "provider-settings",
    });
  });

  it("classifies T3 harness files by role", () => {
    expect(classifyAgentFilePath(".agents/harness.json")).toMatchObject({
      providers: ["t3"],
      kind: "harness-manifest",
      autoLoaded: true,
    });
    expect(classifyAgentFilePath(".agents/validation.md")).toMatchObject({
      providers: ["t3"],
      kind: "validation",
    });
    expect(classifyAgentFilePath(".agents/memory/project-facts.md")).toMatchObject({
      providers: ["t3"],
      kind: "memory",
    });
    expect(classifyAgentFilePath(".agents/loops/coding/README.md")).toMatchObject({
      providers: ["t3"],
      kind: "loop",
    });
    expect(classifyAgentFilePath(".agents/artifacts/signals/README.md")).toMatchObject({
      providers: ["t3"],
      kind: "artifact",
    });
    expect(classifyAgentFilePath(".agents/templates/task.template.md")).toMatchObject({
      providers: ["t3"],
      kind: "template",
    });
    expect(classifyAgentFilePath(".agents/skills/ui-review/SKILL.md")).toMatchObject({
      providers: ["t3"],
      kind: "skill",
    });
  });

  it("keeps composer rule detection backed by the shared classifier", () => {
    expect(isInstructionRulePath("AGENTS.md")).toBe(true);
    expect(isInstructionRulePath(".cursor/rules/frontend.mdc")).toBe(true);
    expect(isInstructionRulePath("../AGENTS.md")).toBe(false);
    expect(isInstructionRulePath("src/index.ts")).toBe(false);
    expect(instructionRuleDescription("AGENTS.md")).toContain("AGENTS.md instructions");
  });

  it("exposes recommended templates and project tool auth defaults", () => {
    expect(getRecommendedAgentFileTemplates().map((template) => template.relativePath)).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        ".agents/harness.json",
        ".agents/validation.md",
        ".agents/templates/task.template.md",
      ]),
    );
    expect(AGENT_HARNESS_MANIFEST_TEMPLATE).toContain('"toolAuth": {}');
  });
});
