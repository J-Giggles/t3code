import { ProviderDriverKind } from "@t3tools/contracts";
import { PROMPT_IDS, getPromptDefaultHash } from "@t3tools/shared/prompts";
import { describe, expect, it } from "vite-plus/test";

import { buildSlashComposerMenuItems } from "./composerSlashMenuItems";

const codexProvider = ProviderDriverKind.make("codex");

describe("buildSlashComposerMenuItems", () => {
  it("shows built-in commands, provider commands, skills, and message templates for bare slash", () => {
    const items = buildSlashComposerMenuItems({
      provider: codexProvider,
      providerStatus: {
        slashCommands: [
          {
            name: "review",
            description: "Review the current diff",
            input: { hint: "optional focus" },
          },
        ],
        skills: [
          {
            name: "frontend-design",
            description: "Design production-grade frontends",
            enabled: true,
            path: "/home/user/.agents/skills/frontend-design/SKILL.md",
          },
          {
            name: "legacy-review",
            description: "Disabled review helper",
            enabled: false,
            path: "/home/user/.agents/skills/legacy-review/SKILL.md",
          },
        ],
      },
      query: "",
    });

    expect(items.map((item) => item.id)).toEqual([
      "slash:model",
      "slash:plan",
      "slash:default",
      "provider-slash-command:codex:review",
      "skill:codex:frontend-design",
      "skill:codex:legacy-review",
      "message-template:fix-bug",
      "message-template:write-tests",
      "message-template:explain-code",
      "message-template:review",
    ]);
  });

  it("filters commands, skills, and message templates with one slash query", () => {
    const items = buildSlashComposerMenuItems({
      provider: codexProvider,
      providerStatus: {
        slashCommands: [
          {
            name: "review",
            description: "Review the current diff",
            input: { hint: "optional focus" },
          },
        ],
        skills: [
          {
            name: "frontend-design",
            shortDescription: "Polish web UI",
            enabled: true,
            path: "/home/user/.agents/skills/frontend-design/SKILL.md",
          },
        ],
      },
      query: "review",
    });

    expect(items.map((item) => item.id)).toEqual([
      "provider-slash-command:codex:review",
      "message-template:review",
    ]);
  });

  it("uses customized message template prompts", () => {
    const items = buildSlashComposerMenuItems({
      provider: codexProvider,
      providerStatus: null,
      query: "review",
      promptOverrides: {
        [PROMPT_IDS.composerReview]: {
          content: "Review this patch for concurrency bugs.",
          defaultHash: getPromptDefaultHash(PROMPT_IDS.composerReview),
        },
      },
    });

    const templateItem = items.find((item) => item.id === "message-template:review");
    expect(templateItem?.type).toBe("message-template");
    expect(templateItem?.type === "message-template" ? templateItem.template.body : null).toBe(
      "Review this patch for concurrency bugs.",
    );
  });
});
