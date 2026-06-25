/**
 * Shared prompt builders for text generation providers.
 *
 * Extracts the prompt construction logic that is identical across
 * Codex, Claude, and any future CLI-based text generation backends.
 *
 * @module textGenerationPrompts
 */
import * as Schema from "effect/Schema";
import type { ChatAttachment, PromptOverrides } from "@t3tools/contracts";
import { PROMPT_IDS, renderPromptTemplate } from "@t3tools/shared/prompts";

import { limitSection } from "./TextGenerationUtils.ts";
import type { TextGenerationPolicy } from "./TextGenerationPolicy.ts";

function policyInstructionBetweenSections(instruction: string | undefined): string {
  const trimmed = instruction?.trim();
  return trimmed ? `\n\nAdditional instructions:\n${limitSection(trimmed, 4_000)}\n\n` : "\n\n";
}

function policyInstructionAfterMessage(instruction: string | undefined): string {
  const trimmed = instruction?.trim();
  return trimmed ? `\n\nAdditional instructions:\n${limitSection(trimmed, 4_000)}` : "";
}

// ---------------------------------------------------------------------------
// Commit message
// ---------------------------------------------------------------------------

export interface CommitMessagePromptInput {
  branch: string | null;
  stagedSummary: string;
  stagedPatch: string;
  includeBranch: boolean;
  policy?: TextGenerationPolicy | undefined;
  promptOverrides?: PromptOverrides | undefined;
}

export function buildCommitMessagePrompt(input: CommitMessagePromptInput) {
  const wantsBranch = input.includeBranch;

  const prompt = renderPromptTemplate(
    PROMPT_IDS.textGenerationCommitMessage,
    {
      branchOutputKey: wantsBranch ? ", branch" : "",
      branchRule: wantsBranch
        ? "- branch must be a short semantic git branch fragment for this change\n"
        : "",
      policyInstructions: policyInstructionBetweenSections(input.policy?.commitInstructions),
      branch: input.branch ?? "(detached)",
      stagedSummary: limitSection(input.stagedSummary, 6_000),
      stagedPatch: limitSection(input.stagedPatch, 40_000),
    },
    input.promptOverrides,
  );

  if (wantsBranch) {
    return {
      prompt,
      outputSchema: Schema.Struct({
        subject: Schema.String,
        body: Schema.String,
        branch: Schema.String,
      }),
    };
  }

  return {
    prompt,
    outputSchema: Schema.Struct({
      subject: Schema.String,
      body: Schema.String,
    }),
  };
}

// ---------------------------------------------------------------------------
// PR content
// ---------------------------------------------------------------------------

export interface PrContentPromptInput {
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
  policy?: TextGenerationPolicy | undefined;
  promptOverrides?: PromptOverrides | undefined;
}

export function buildPrContentPrompt(input: PrContentPromptInput) {
  const prompt = renderPromptTemplate(
    PROMPT_IDS.textGenerationPullRequest,
    {
      policyInstructions: policyInstructionBetweenSections(input.policy?.changeRequestInstructions),
      baseBranch: input.baseBranch,
      headBranch: input.headBranch,
      commitSummary: limitSection(input.commitSummary, 12_000),
      diffSummary: limitSection(input.diffSummary, 12_000),
      diffPatch: limitSection(input.diffPatch, 40_000),
    },
    input.promptOverrides,
  );

  const outputSchema = Schema.Struct({
    title: Schema.String,
    body: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Branch name
// ---------------------------------------------------------------------------

export interface BranchNamePromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  policy?: TextGenerationPolicy | undefined;
  promptOverrides?: PromptOverrides | undefined;
}

interface PromptFromMessageInput {
  instruction: string;
  responseShape: string;
  rules: ReadonlyArray<string>;
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  additionalInstructions?: string | undefined;
  promptOverrides?: PromptOverrides | undefined;
  promptId:
    | typeof PROMPT_IDS.textGenerationBranchName
    | typeof PROMPT_IDS.textGenerationThreadTitle;
}

function buildPromptFromMessage(input: PromptFromMessageInput): string {
  const attachmentLines = (input.attachments ?? []).map(
    (attachment) => `- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`,
  );
  const attachmentSection =
    attachmentLines.length > 0
      ? `\n\nAttachment metadata:\n${limitSection(attachmentLines.join("\n"), 4_000)}`
      : "";

  return renderPromptTemplate(
    input.promptId,
    {
      instruction: input.instruction,
      responseShape: input.responseShape,
      rules: input.rules.map((rule) => `- ${rule}`).join("\n"),
      message: limitSection(input.message, 8_000),
      policyInstructions: policyInstructionAfterMessage(input.additionalInstructions),
      attachmentSection,
    },
    input.promptOverrides,
  );
}

export function buildBranchNamePrompt(input: BranchNamePromptInput) {
  const prompt = buildPromptFromMessage({
    instruction: "You generate concise git branch names.",
    responseShape: "Return a JSON object with key: branch.",
    rules: [
      "Branch should describe the requested work from the user message.",
      "Keep it short and specific (2-6 words).",
      "Use plain words only, no issue prefixes and no punctuation-heavy text.",
      "If images are attached, use them as primary context for visual/UI issues.",
    ],
    message: input.message,
    attachments: input.attachments,
    additionalInstructions: input.policy?.branchInstructions,
    promptOverrides: input.promptOverrides,
    promptId: PROMPT_IDS.textGenerationBranchName,
  });
  const outputSchema = Schema.Struct({
    branch: Schema.String,
  });

  return { prompt, outputSchema };
}

// ---------------------------------------------------------------------------
// Thread title
// ---------------------------------------------------------------------------

export interface ThreadTitlePromptInput {
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  policy?: TextGenerationPolicy | undefined;
  promptOverrides?: PromptOverrides | undefined;
}

export function buildThreadTitlePrompt(input: ThreadTitlePromptInput) {
  const prompt = buildPromptFromMessage({
    instruction: "You write concise thread titles for coding conversations.",
    responseShape: "Return a JSON object with key: title.",
    rules: [
      "Title should summarize the user's request, not restate it verbatim.",
      "Keep it short and specific (3-8 words).",
      "Avoid quotes, filler, prefixes, and trailing punctuation.",
      "If images are attached, use them as primary context for visual/UI issues.",
    ],
    message: input.message,
    attachments: input.attachments,
    additionalInstructions: input.policy?.threadTitleInstructions,
    promptOverrides: input.promptOverrides,
    promptId: PROMPT_IDS.textGenerationThreadTitle,
  });
  const outputSchema = Schema.Struct({
    title: Schema.String,
  });

  return { prompt, outputSchema };
}
