import { describe, expect, it } from "vite-plus/test";

import {
  PROMPT_DEFINITIONS,
  PROMPT_IDS,
  getPromptDefaultHash,
  promptDefaultHash,
  renderPromptTemplate,
  resolvePromptContent,
} from "./prompts.ts";

describe("prompt registry", () => {
  it("has stable unique prompt ids", () => {
    const ids = PROMPT_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(PROMPT_IDS.codexPlanDeveloperInstructions);
    expect(ids).toContain(PROMPT_IDS.planImplementation);
  });

  it("calculates deterministic default hashes", () => {
    expect(promptDefaultHash("abc")).toBe(promptDefaultHash("abc"));
    expect(promptDefaultHash("abc")).not.toBe(promptDefaultHash("abcd"));
    expect(getPromptDefaultHash(PROMPT_IDS.composerFixBug)).toBe(
      promptDefaultHash("Please diagnose and fix this bug: "),
    );
  });

  it("resolves source defaults when there is no override", () => {
    expect(resolvePromptContent(PROMPT_IDS.composerReview)).toBe(
      "Please review these changes for bugs, regressions, and missing tests.",
    );
  });

  it("prefers override content when present", () => {
    expect(
      resolvePromptContent(PROMPT_IDS.composerReview, {
        [PROMPT_IDS.composerReview]: {
          content: "Custom review prompt.",
          defaultHash: getPromptDefaultHash(PROMPT_IDS.composerReview),
        },
      }),
    ).toBe("Custom review prompt.");
  });

  it("renders known placeholders and leaves unknown placeholders unchanged", () => {
    expect(
      renderPromptTemplate(
        PROMPT_IDS.planImplementation,
        { planMarkdown: "## Plan\n\n- ship" },
        {
          [PROMPT_IDS.planImplementation]: {
            content: "Implement:\n{{planMarkdown}}\n{{unknownPlaceholder}}",
            defaultHash: getPromptDefaultHash(PROMPT_IDS.planImplementation),
          },
        },
      ),
    ).toBe("Implement:\n## Plan\n\n- ship\n{{unknownPlaceholder}}");
  });
});
