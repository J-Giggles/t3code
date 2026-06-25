import type { PromptOverrides, ProviderDriverKind, ServerProvider } from "@t3tools/contracts";
import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";
import { PROMPT_IDS, resolvePromptContent } from "@t3tools/shared/prompts";

import type { ComposerCommandItem } from "./ComposerCommandMenu";
import { searchSlashCommandItems } from "./composerSlashCommandSearch";
import { formatProviderSkillDisplayName } from "../../providerSkillPresentation";
import { searchProviderSkills } from "../../providerSkillSearch";

export type ComposerMessageTemplate = {
  id: string;
  label: string;
  description: string;
  body: string;
};

const COMPOSER_MESSAGE_TEMPLATE_DEFINITIONS = [
  {
    id: "fix-bug",
    label: "Fix a bug",
    description: "Describe a bug and ask the agent to diagnose and fix it.",
    promptId: PROMPT_IDS.composerFixBug,
  },
  {
    id: "write-tests",
    label: "Write tests",
    description: "Ask for focused test coverage before implementation.",
    promptId: PROMPT_IDS.composerWriteTests,
  },
  {
    id: "explain-code",
    label: "Explain code",
    description: "Ask for a concise explanation of the relevant code path.",
    promptId: PROMPT_IDS.composerExplainCode,
  },
  {
    id: "review",
    label: "Review changes",
    description: "Ask for a code review focused on risks and regressions.",
    promptId: PROMPT_IDS.composerReview,
  },
] as const;

export function buildComposerMessageTemplates(
  promptOverrides?: PromptOverrides | undefined,
): ComposerMessageTemplate[] {
  return COMPOSER_MESSAGE_TEMPLATE_DEFINITIONS.map((template) => ({
    id: template.id,
    label: template.label,
    description: template.description,
    body: resolvePromptContent(template.promptId, promptOverrides),
  }));
}

export const composerMessageTemplates = buildComposerMessageTemplates();

const builtInSlashCommandItems = [
  {
    id: "slash:model",
    type: "slash-command",
    command: "model",
    label: "/model",
    description: "Switch response model for this thread",
  },
  {
    id: "slash:plan",
    type: "slash-command",
    command: "plan",
    label: "/plan",
    description: "Switch this thread into plan mode",
  },
  {
    id: "slash:default",
    type: "slash-command",
    command: "default",
    label: "/default",
    description: "Switch this thread back to normal build mode",
  },
] satisfies ReadonlyArray<Extract<ComposerCommandItem, { type: "slash-command" }>>;

function searchMessageTemplates(
  templates: ReadonlyArray<ComposerMessageTemplate>,
  query: string,
): ComposerMessageTemplate[] {
  const normalizedQuery = normalizeSearchQuery(query, { trimLeadingPattern: /^\/+/ });
  if (!normalizedQuery) {
    return [...templates];
  }

  const ranked: Array<{ item: ComposerMessageTemplate; score: number; tieBreaker: string }> = [];
  for (const template of templates) {
    const scores = [
      scoreQueryMatch({
        value: template.label.toLowerCase(),
        query: normalizedQuery,
        exactBase: 0,
        prefixBase: 2,
        boundaryBase: 4,
        includesBase: 6,
        fuzzyBase: 100,
      }),
      scoreQueryMatch({
        value: template.description.toLowerCase(),
        query: normalizedQuery,
        exactBase: 20,
        prefixBase: 22,
        boundaryBase: 24,
        includesBase: 26,
      }),
      scoreQueryMatch({
        value: template.id.toLowerCase(),
        query: normalizedQuery,
        exactBase: 1,
        prefixBase: 3,
        boundaryBase: 5,
        includesBase: 7,
        fuzzyBase: 110,
        boundaryMarkers: ["-"],
      }),
    ].filter((score): score is number => score !== null);
    if (scores.length === 0) {
      continue;
    }

    insertRankedSearchResult(
      ranked,
      {
        item: template,
        score: Math.min(...scores),
        tieBreaker: template.label.toLowerCase(),
      },
      Number.POSITIVE_INFINITY,
    );
  }
  return ranked.map((entry) => entry.item);
}

export function buildSlashComposerMenuItems(input: {
  provider: ProviderDriverKind;
  providerStatus: Pick<ServerProvider, "slashCommands" | "skills"> | null | undefined;
  query: string;
  promptOverrides?: PromptOverrides | undefined;
}): ComposerCommandItem[] {
  const providerSlashCommandItems = (input.providerStatus?.slashCommands ?? []).map((command) => ({
    id: `provider-slash-command:${input.provider}:${command.name}`,
    type: "provider-slash-command" as const,
    provider: input.provider,
    command,
    label: `/${command.name}`,
    description: command.description ?? command.input?.hint ?? "Run provider command",
  }));
  const slashCommandItems = [...builtInSlashCommandItems, ...providerSlashCommandItems];
  const matchingSlashCommandItems = searchSlashCommandItems(slashCommandItems, input.query);
  const matchingSkillItems = searchProviderSkills(
    input.providerStatus?.skills ?? [],
    input.query,
    Number.POSITIVE_INFINITY,
    { includeDisabled: true },
  ).map((skill) => ({
    id: `skill:${input.provider}:${skill.name}`,
    type: "skill" as const,
    provider: input.provider,
    skill,
    label: formatProviderSkillDisplayName(skill),
    description:
      (skill.enabled ? "" : "Disabled; select to enable. ") +
      (skill.shortDescription ??
        skill.description ??
        (skill.scope ? `${skill.scope} skill` : "Run provider skill")),
  }));
  const matchingTemplateItems = searchMessageTemplates(
    buildComposerMessageTemplates(input.promptOverrides),
    input.query,
  ).map((template) => ({
    id: `message-template:${template.id}`,
    type: "message-template" as const,
    template,
    label: template.label,
    description: template.description,
  }));

  return [...matchingSlashCommandItems, ...matchingSkillItems, ...matchingTemplateItems];
}
