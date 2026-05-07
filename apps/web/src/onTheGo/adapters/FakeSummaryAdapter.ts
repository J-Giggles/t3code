import type {
  ComposePromptInput,
  ReplyInput,
  SummarizeInput,
  SummaryAdapter,
} from "./SummaryAdapter";

export type FakeSummaryAdapterConfig = {
  summary?: string;
  replies?: string[];
  composedPrompt?: string;
  failOn?: "summarize" | "reply" | "composePrompt";
  failError?: Error;
};

export class FakeSummaryAdapter implements SummaryAdapter {
  readonly summarizeCalls: SummarizeInput[] = [];
  readonly replyCalls: ReplyInput[] = [];
  readonly composeCalls: ComposePromptInput[] = [];

  private readonly summary: string;
  private readonly replies: string[];
  private readonly composedPrompt: string;
  private readonly failOn?: FakeSummaryAdapterConfig["failOn"];
  private readonly failError: Error;

  constructor(config: FakeSummaryAdapterConfig = {}) {
    this.summary = config.summary ?? "fake summary";
    this.replies = [...(config.replies ?? [])];
    this.composedPrompt = config.composedPrompt ?? "fake composed prompt";
    this.failOn = config.failOn;
    this.failError = config.failError ?? new Error("FakeSummaryAdapter failed");
  }

  async summarize(input: SummarizeInput): Promise<string> {
    this.summarizeCalls.push(input);
    this.throwIfConfigured("summarize");

    return this.summary;
  }

  async reply(input: ReplyInput): Promise<string> {
    this.replyCalls.push(input);
    this.throwIfConfigured("reply");

    return this.replies.shift() ?? "fake reply";
  }

  async composePrompt(input: ComposePromptInput): Promise<string> {
    this.composeCalls.push(input);
    this.throwIfConfigured("composePrompt");

    return this.composedPrompt;
  }

  private throwIfConfigured(method: NonNullable<FakeSummaryAdapterConfig["failOn"]>): void {
    if (this.failOn === method) {
      throw this.failError;
    }
  }
}
