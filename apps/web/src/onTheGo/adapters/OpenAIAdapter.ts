import type { Turn } from "../types";
import {
  InvalidApiKeyError,
  RateLimitError,
  type ComposePromptInput,
  type ReplyInput,
  type SummarizeInput,
  type SummaryAdapter,
} from "./SummaryAdapter";

export type OpenAIAdapterConfig = {
  apiKey: string;
  model?: string;
  endpoint?: string;
};

type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 250;
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 500, 502, 503, 504]);

const SUMMARIZE_SYSTEM_PROMPT =
  "You are a concise voice assistant summarizing a coding agent turn for a user who is on the go. Speak in 1-2 short sentences. No preamble.";

const REPLY_SYSTEM_PROMPT =
  "You are a concise voice assistant helping the user decide the next instruction for a coding agent. Keep replies to 1-2 short sentences and ask at most one question.";

export class OpenAIAdapter implements SummaryAdapter {
  constructor(private readonly config: OpenAIAdapterConfig) {}

  async summarize(input: SummarizeInput): Promise<string> {
    return this.complete([
      { role: "system", content: SUMMARIZE_SYSTEM_PROMPT },
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
    ]);
  }

  async reply(input: ReplyInput): Promise<string> {
    return this.complete([
      { role: "system", content: REPLY_SYSTEM_PROMPT },
      ...input.history.map(turnToChatMessage),
      { role: "user", content: input.userTurn },
    ]);
  }

  async composePrompt(input: ComposePromptInput): Promise<string> {
    return this.complete(
      [
        { role: "system", content: input.skill },
        {
          role: "user",
          content: [
            "Use this side-conversation transcript to write the optimized prompt for the main coding agent.",
            "",
            formatHistory(input.history),
          ].join("\n"),
        },
      ],
      { temperature: 0 },
    );
  }

  private async complete(
    messages: ChatMessage[],
    options: { temperature?: number } = {},
  ): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.fetchCompletion(messages, options);
      } catch (error) {
        if (!isRetryableError(error) || attempt === 1) {
          throw error;
        }

        await delay(RETRY_DELAY_MS);
      }
    }

    throw new Error("OpenAI request failed");
  }

  private async fetchCompletion(
    messages: ChatMessage[],
    options: { temperature?: number },
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(this.config.endpoint ?? DEFAULT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model ?? DEFAULT_MODEL,
          messages,
          ...options,
        }),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new InvalidApiKeyError("openai");
      }

      if (response.status === 429) {
        throw new RateLimitError(parseRetryAfter(response.headers.get("retry-after")));
      }

      if (!response.ok) {
        throw new OpenAIHttpError(response.status);
      }

      const data = await readCompletionResponse(response);
      const content = data.choices?.[0]?.message?.content;

      if (typeof content !== "string" || content.trim().length === 0) {
        throw new OpenAICompletionContentError();
      }

      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

class OpenAIHttpError extends Error {
  constructor(readonly status: number) {
    super(`OpenAI request failed with status ${status}`);
    this.name = "OpenAIHttpError";
  }
}

class OpenAICompletionContentError extends Error {
  constructor() {
    super("OpenAI completion response did not include content");
    this.name = "OpenAICompletionContentError";
  }
}

function turnToChatMessage(turn: Turn): ChatMessage {
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

async function readCompletionResponse(response: Response): Promise<ChatCompletionResponse> {
  return (await response.json()) as ChatCompletionResponse;
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
  if (error instanceof InvalidApiKeyError || error instanceof RateLimitError) {
    return false;
  }

  if (error instanceof OpenAIHttpError) {
    return RETRYABLE_HTTP_STATUSES.has(error.status);
  }

  return true;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
