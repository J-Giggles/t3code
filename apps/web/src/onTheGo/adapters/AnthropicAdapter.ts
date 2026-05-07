import type { Turn } from "../types";
import {
  InvalidApiKeyError,
  RateLimitError,
  type ComposePromptInput,
  type ReplyInput,
  type SummarizeInput,
  type SummaryAdapter,
} from "./SummaryAdapter";

export type AnthropicAdapterConfig = {
  apiKey: string;
  model?: string;
  endpoint?: string;
};

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

type AnthropicSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

type AnthropicMessageResponse = {
  content?: unknown;
};

const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 250;
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 500, 502, 503, 504, 529]);

const SUMMARIZE_SYSTEM_PROMPT =
  "You are a concise voice assistant summarizing a coding agent turn for a user who is on the go. Speak in 1-2 short sentences. No preamble.";

const REPLY_SYSTEM_PROMPT =
  "You are a concise voice assistant helping the user decide the next instruction for a coding agent. Keep replies to 1-2 short sentences and ask at most one question.";

export class AnthropicAdapter implements SummaryAdapter {
  constructor(private readonly config: AnthropicAdapterConfig) {}

  async summarize(input: SummarizeInput): Promise<string> {
    return this.complete({
      system: SUMMARIZE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            "The coding agent finished a turn.",
            "",
            "Agent message:",
            input.agentMessage,
            "",
            "User's last instruction:",
            input.userMessage,
            "",
            "Summarize what matters for the user while they are away from their keyboard.",
          ].join("\n"),
        },
      ],
    });
  }

  async reply(input: ReplyInput): Promise<string> {
    return this.complete({
      system: REPLY_SYSTEM_PROMPT,
      messages: [
        ...input.history.map(turnToAnthropicMessage),
        { role: "user", content: input.userTurn },
      ],
    });
  }

  async composePrompt(input: ComposePromptInput): Promise<string> {
    return this.complete({
      system: [
        {
          type: "text",
          text: input.skill,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            "Use this side-conversation transcript to write the optimized prompt for the main coding agent.",
            "",
            formatHistory(input.history),
          ].join("\n"),
        },
      ],
      temperature: 0,
    });
  }

  private async complete(args: {
    system: string | AnthropicSystemBlock[];
    messages: AnthropicMessage[];
    temperature?: number;
  }): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchCompletion(args);
      } catch (error) {
        if (!isRetryableError(error) || attempt === 1) {
          throw error;
        }

        await delay(RETRY_DELAY_MS);
      }
    }

    throw new Error("Anthropic request failed");
  }

  private async fetchCompletion(args: {
    system: string | AnthropicSystemBlock[];
    messages: AnthropicMessage[];
    temperature?: number;
  }): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(this.config.endpoint ?? DEFAULT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": ANTHROPIC_VERSION,
          "x-api-key": this.config.apiKey,
        },
        body: JSON.stringify({
          model: this.config.model ?? DEFAULT_MODEL,
          max_tokens: 1024,
          system: args.system,
          messages: args.messages,
          ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
        }),
        signal: controller.signal,
      });

      if (response.status === 401) {
        throw new InvalidApiKeyError("anthropic");
      }

      if (response.status === 403) {
        throw new AnthropicPermissionError();
      }

      if (response.status === 429) {
        throw new RateLimitError(parseRetryAfter(response.headers.get("retry-after")));
      }

      if (!response.ok) {
        throw new AnthropicHttpError(response.status);
      }

      const data = await readCompletionResponse(response);
      return readFirstTextContent(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

class AnthropicHttpError extends Error {
  constructor(readonly status: number) {
    super(`Anthropic request failed with status ${status}`);
    this.name = "AnthropicHttpError";
  }
}

class AnthropicCompletionContentError extends Error {
  constructor() {
    super("Anthropic completion response did not include text content");
    this.name = "AnthropicCompletionContentError";
  }
}

class AnthropicPermissionError extends Error {
  constructor() {
    super(
      "Anthropic permission/access denied with status 403. Check API key workspace and model access.",
    );
    this.name = "AnthropicPermissionError";
  }
}

function turnToAnthropicMessage(turn: Turn): AnthropicMessage {
  return {
    role: turn.role,
    content: turn.text,
  };
}

function formatHistory(history: Turn[]): string {
  if (history.length === 0) {
    return "(empty transcript)";
  }

  return history
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`)
    .join("\n");
}

async function readCompletionResponse(response: Response): Promise<AnthropicMessageResponse> {
  return (await response.json()) as AnthropicMessageResponse;
}

function readFirstTextContent(data: AnthropicMessageResponse): string {
  if (!Array.isArray(data.content)) {
    throw new AnthropicCompletionContentError();
  }

  const textContent = data.content.find((item) => isRecord(item) && item.type === "text");

  if (!isRecord(textContent) || typeof textContent.text !== "string") {
    throw new AnthropicCompletionContentError();
  }

  if (textContent.text.trim().length === 0) {
    throw new AnthropicCompletionContentError();
  }

  return textContent.text;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds;
  }

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) {
    return undefined;
  }

  const secondsUntilDate = Math.ceil((dateMs - Date.now()) / 1000);
  return secondsUntilDate > 0 ? secondsUntilDate : undefined;
}

function isRetryableError(error: unknown): boolean {
  if (
    error instanceof InvalidApiKeyError ||
    error instanceof RateLimitError ||
    error instanceof AnthropicCompletionContentError ||
    error instanceof AnthropicPermissionError ||
    error instanceof SyntaxError
  ) {
    return false;
  }

  if (error instanceof AnthropicHttpError) {
    return RETRYABLE_HTTP_STATUSES.has(error.status);
  }

  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  return error instanceof TypeError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
