import type { Turn } from "../types";

export type SummarizeInput = {
  agentMessage: string;
  userMessage: string;
};

export type ReplyInput = {
  history: Turn[];
  userTurn: string;
};

export type ComposePromptInput = {
  history: Turn[];
  skill: string;
};

export class InvalidApiKeyError extends Error {
  constructor(public provider: string) {
    super(`Invalid API key for ${provider}`);
    this.name = "InvalidApiKeyError";
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds?: number) {
    super(retryAfterSeconds ? `Rate limited; retry after ${retryAfterSeconds}s` : "Rate limited");
    this.name = "RateLimitError";
  }
}

export interface SummaryAdapter {
  summarize(input: SummarizeInput): Promise<string>;
  reply(input: ReplyInput): Promise<string>;
  composePrompt(input: ComposePromptInput): Promise<string>;
}
