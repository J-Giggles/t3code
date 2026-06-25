import { PROMPT_IDS, resolvePromptContent } from "@t3tools/shared/prompts";

export const CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS = resolvePromptContent(
  PROMPT_IDS.codexPlanDeveloperInstructions,
);

export const CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS = resolvePromptContent(
  PROMPT_IDS.codexDefaultDeveloperInstructions,
);
