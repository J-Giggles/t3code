import { ProviderDriverKind, type ServerProviderSkill } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { ComposerCommandItem } from "./ComposerCommandMenu";
import {
  buildVisibleComposerMenuItems,
  canonicalComposerMenuItemId,
  cloneComposerMenuItemForSection,
  estimateComposerContextTokens,
  getComposerMenuItemSectionId,
  instructionRuleDescription,
  isInstructionRulePath,
  rankComposerMenuLeafItems,
} from "./composerMenuNavigation";

const codexProvider = ProviderDriverKind.make("codex");

function skill(input: Partial<ServerProviderSkill> & Pick<ServerProviderSkill, "name">) {
  return {
    path: `/tmp/${input.name}/SKILL.md`,
    enabled: true,
    ...input,
  } satisfies ServerProviderSkill;
}

const leafItems: ComposerCommandItem[] = [
  {
    id: "slash:plan",
    type: "slash-command",
    command: "plan",
    label: "/plan",
    description: "Plan",
  },
  {
    id: "skill:codex:ui",
    type: "skill",
    provider: codexProvider,
    skill: skill({ name: "ui" }),
    label: "Ui",
    description: "UI helper",
  },
  {
    id: "skill:codex:disabled",
    type: "skill",
    provider: codexProvider,
    skill: skill({ name: "disabled", enabled: false }),
    label: "Disabled",
    description: "Disabled helper",
  },
  {
    id: "template:review",
    type: "message-template",
    template: {
      id: "review",
      label: "Review",
      description: "Review",
      body: "Please review",
    },
    label: "Review",
    description: "Review",
  },
];

describe("composer menu navigation", () => {
  it("builds mixed root section rows with counts", () => {
    const items = buildVisibleComposerMenuItems({
      leafItems,
      triggerKind: "slash-command",
      activeSectionId: null,
      query: "",
    });

    expect(
      items.map((item) => [item.id, item.type === "menu-section" ? item.count : null]),
    ).toEqual([
      ["menu-section:commands", 1],
      ["menu-section:skills", 1],
      ["menu-section:disabled-skills", 1],
      ["menu-section:templates", 1],
    ]);
  });

  it("returns direct matches plus sections when root query is non-empty", () => {
    const items = buildVisibleComposerMenuItems({
      leafItems,
      triggerKind: "slash-command",
      activeSectionId: null,
      query: "re",
    });

    expect(items[0]?.id).toBe("template:review");
    expect(items.some((item) => item.id === "menu-section:commands")).toBe(true);
  });

  it("dedupes memory clones from direct root matches", () => {
    const pinnedSkill = cloneComposerMenuItemForSection(leafItems[1]!, "pinned-items");
    const items = buildVisibleComposerMenuItems({
      leafItems: [pinnedSkill, ...leafItems],
      triggerKind: "slash-command",
      activeSectionId: null,
      query: "ui",
    });

    expect(
      items.filter((item) => canonicalComposerMenuItemId(item) === "skill:codex:ui"),
    ).toHaveLength(1);
    expect(items.some((item) => item.id === "menu-section:pinned-items")).toBe(true);
  });

  it("enters a section by filtering leaf items", () => {
    const items = buildVisibleComposerMenuItems({
      leafItems,
      triggerKind: "slash-command",
      activeSectionId: "disabled-skills",
      query: "",
    });

    expect(items.map((item) => item.id)).toEqual(["skill:codex:disabled"]);
    expect(getComposerMenuItemSectionId(items[0]!)).toBe("disabled-skills");
  });

  it("ranks pinned items first and recent items next", () => {
    const ranked = rankComposerMenuLeafItems({
      items: leafItems,
      pinnedItemIds: new Set(["template:review"]),
      recentItemIds: ["skill:codex:disabled"],
      query: "",
    });

    expect(ranked.map((item) => item.id).slice(0, 3)).toEqual([
      "template:review",
      "skill:codex:disabled",
      "slash:plan",
    ]);
  });

  it("maps memory clones into their virtual sections", () => {
    const pinned = cloneComposerMenuItemForSection(leafItems[0]!, "pinned-items");
    const recent = cloneComposerMenuItemForSection(leafItems[0]!, "recent-items");

    expect(getComposerMenuItemSectionId(pinned)).toBe("pinned-items");
    expect(getComposerMenuItemSectionId(recent)).toBe("recent-items");
    expect(canonicalComposerMenuItemId(pinned)).toBe("slash:plan");
  });

  it("detects known instruction/rule paths", () => {
    expect(isInstructionRulePath("AGENTS.md")).toBe(true);
    expect(isInstructionRulePath(".cursor/rules/frontend.mdc")).toBe(true);
    expect(isInstructionRulePath("src/index.ts")).toBe(false);
    expect(instructionRuleDescription("AGENTS.md")).toContain("AGENTS.md instructions");
  });

  it("estimates context size compactly", () => {
    expect(estimateComposerContextTokens("abcd")).toBe(1);
    expect(estimateComposerContextTokens("a".repeat(401))).toBe(101);
  });
});
