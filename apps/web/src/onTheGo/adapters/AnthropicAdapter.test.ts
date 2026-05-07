import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnthropicAdapter } from "./AnthropicAdapter";
import { InvalidApiKeyError, RateLimitError } from "./SummaryAdapter";

const originalFetch = globalThis.fetch;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 250;

describe("AnthropicAdapter", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("summarize calls messages with the default endpoint, x-api-key header, and configured model", async () => {
    mockJsonResponse({ content: [{ type: "text", text: "tldr" }] });

    const adapter = new AnthropicAdapter({ apiKey: "sk-ant", model: "claude-sonnet-4-5" });

    await expect(
      adapter.summarize({
        agentMessage: "Tests pass.",
        userMessage: "Summarize the current state.",
      }),
    ).resolves.toBe("tldr");

    const [url, init] = getFetchCall(0);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": "sk-ant",
    });
    expect(getJsonBody(init)).toMatchObject({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: expect.stringContaining("concise"),
      messages: [
        {
          role: "user",
          content: expect.stringContaining("Tests pass."),
        },
      ],
    });
  });

  it("uses the default model when none is configured", async () => {
    mockJsonResponse({ content: [{ type: "text", text: "tldr" }] });

    await new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "Done.",
      userMessage: "What happened?",
    });

    expect(getJsonBody(getFetchCall(0)[1]).model).toBe("claude-haiku-4-5");
  });

  it("uses an overridden endpoint", async () => {
    mockJsonResponse({ content: [{ type: "text", text: "ok" }] });

    await new AnthropicAdapter({
      apiKey: "sk-ant",
      endpoint: "https://proxy.example.test/anthropic/messages",
    }).summarize({ agentMessage: "Done.", userMessage: "Summarize." });

    expect(getFetchCall(0)[0]).toBe("https://proxy.example.test/anthropic/messages");
  });

  it("composePrompt sends the skill as a cached system text block with temperature 0", async () => {
    mockJsonResponse({ content: [{ type: "text", text: "optimized" }] });

    await new AnthropicAdapter({ apiKey: "sk-ant" }).composePrompt({
      history: [{ role: "user", text: "keep the diff scoped", at: 1 }],
      skill: "SKILL TEXT",
    });

    const body = getJsonBody(getFetchCall(0)[1]);
    expect(body.temperature).toBe(0);
    expect(body.system).toEqual([
      {
        type: "text",
        text: "SKILL TEXT",
        cache_control: { type: "ephemeral" },
      },
    ]);
    expect(body.messages?.[0]).toEqual({
      role: "user",
      content: expect.stringContaining("User: keep the diff scoped"),
    });
  });

  it("reply maps conversation history before the user turn", async () => {
    mockJsonResponse({ content: [{ type: "text", text: "bot reply" }] });

    const result = await new AnthropicAdapter({ apiKey: "sk-ant" }).reply({
      history: [
        { role: "user", text: "What changed?", at: 1 },
        { role: "assistant", text: "The adapter is next.", at: 2 },
      ],
      userTurn: "What should I ask the agent?",
    });

    expect(result).toBe("bot reply");
    expect(getJsonBody(getFetchCall(0)[1]).messages ?? []).toEqual([
      { role: "user", content: "What changed?" },
      { role: "assistant", content: "The adapter is next." },
      { role: "user", content: "What should I ask the agent?" },
    ]);
    expect(getJsonBody(getFetchCall(0)[1]).system).toEqual(expect.stringContaining("coding agent"));
  });

  it("throws InvalidApiKeyError for 401 without retrying", async () => {
    mockJsonResponse({ error: { message: "bad key" } }, 401);

    const invalidKeyError = await catchError(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    );

    expect(invalidKeyError).toBeInstanceOf(InvalidApiKeyError);
    expect(invalidKeyError).toMatchObject({ provider: "anthropic" });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("throws a non-retryable permission error for 403", async () => {
    mockJsonResponse({ error: { message: "forbidden" } }, 403);

    const permissionError = await catchError(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    );

    expect(permissionError).toBeInstanceOf(Error);
    expect(permissionError).not.toBeInstanceOf(InvalidApiKeyError);
    expect(permissionError).toMatchObject({
      message: expect.stringContaining("permission"),
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("throws RateLimitError for 429 with retry-after seconds without retrying", async () => {
    mockJsonResponse({}, 429, { "retry-after": "30" });

    const rateLimitError = await catchError(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    );

    expect(rateLimitError).toBeInstanceOf(RateLimitError);
    expect(rateLimitError).toMatchObject({ retryAfterSeconds: 30 });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("parses retry-after HTTP dates into seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T10:00:00.000Z"));
    mockJsonResponse({}, 429, {
      "retry-after": "Thu, 07 May 2026 10:00:45 GMT",
    });

    const rateLimitError = await catchError(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    );

    expect(rateLimitError).toBeInstanceOf(RateLimitError);
    expect(rateLimitError).toMatchObject({ retryAfterSeconds: 45 });
  });

  it("retries once on a network error and then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock().mockRejectedValueOnce(new TypeError("fetch failed"));
    mockJsonResponse({ content: [{ type: "text", text: "ok" }] });

    const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "",
      userMessage: "",
    });

    await advanceRetryDelay();
    await expect(summaryPromise).resolves.toBe("ok");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("waits for the retry backoff before a second fetch", async () => {
    vi.useFakeTimers();
    fetchMock().mockRejectedValueOnce(new TypeError("fetch failed"));
    mockJsonResponse({ content: [{ type: "text", text: "ok" }] });

    const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "",
      userMessage: "",
    });

    await Promise.resolve();
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(summaryPromise).resolves.toBe("ok");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("retries only once on repeated network errors", async () => {
    vi.useFakeTimers();
    fetchMock().mockRejectedValue(new TypeError("fetch failed"));

    const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "",
      userMessage: "",
    });
    const expectation = expect(summaryPromise).rejects.toThrow("fetch failed");

    await advanceRetryDelay();
    await expectation;
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("returns the first text content item", async () => {
    mockJsonResponse({
      content: [
        { type: "tool_use", id: "tool_1" },
        { type: "text", text: "first text" },
        { type: "text", text: "second text" },
      ],
    });

    await expect(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    ).resolves.toBe("first text");
  });

  it("fails fast for missing completion content", async () => {
    mockJsonResponse({ content: [] });

    await expect(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    ).rejects.toThrow("Anthropic completion response did not include text content");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("fails fast for non-string completion content", async () => {
    mockJsonResponse({ content: [{ type: "text", text: [{ value: "nope" }] }] });

    await expect(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    ).rejects.toThrow("Anthropic completion response did not include text content");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("fails fast for blank completion content", async () => {
    mockJsonResponse({ content: [{ type: "text", text: "   \n\t" }] });

    await expect(
      new AnthropicAdapter({ apiKey: "sk-ant" }).composePrompt({
        history: [{ role: "user", text: "Ship it", at: 1 }],
        skill: "OPTIMIZE",
      }),
    ).rejects.toThrow("Anthropic completion response did not include text content");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("fails fast for JSON parse errors", async () => {
    mockJsonParseError(new SyntaxError("bad json"));

    await expect(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    ).rejects.toThrow("bad json");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("retries Anthropic 529 overloaded_error once and then succeeds", async () => {
    vi.useFakeTimers();
    mockJsonResponse({ error: { type: "overloaded_error", message: "Overloaded" } }, 529);
    mockJsonResponse({ content: [{ type: "text", text: "ok after overload" }] });

    const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "",
      userMessage: "",
    });

    await advanceRetryDelay();
    await expect(summaryPromise).resolves.toBe("ok after overload");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("retries response body AbortError once and then succeeds", async () => {
    vi.useFakeTimers();
    mockJsonParseError(new DOMException("The operation was aborted.", "AbortError"));
    mockJsonResponse({ content: [{ type: "text", text: "ok after abort" }] });

    const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "",
      userMessage: "",
    });

    await advanceRetryDelay();
    await expect(summaryPromise).resolves.toBe("ok after abort");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("aborts a request after 15 seconds, waits for backoff, then retries", async () => {
    vi.useFakeTimers();
    mockAbortableFetchTimeout();
    mockJsonResponse({ content: [{ type: "text", text: "ok after timeout" }] });

    const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "",
      userMessage: "",
    });

    await Promise.resolve();
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(summaryPromise).resolves.toBe("ok after timeout");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it.each([408, 409, 500, 502, 503, 504])(
    "retries retryable HTTP status %s once and then succeeds",
    async (status) => {
      vi.useFakeTimers();
      mockJsonResponse({ error: { message: "retryable" } }, status);
      mockJsonResponse({ content: [{ type: "text", text: "ok" }] });

      const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      });

      await advanceRetryDelay();
      await expect(summaryPromise).resolves.toBe("ok");
      expect(fetchMock()).toHaveBeenCalledTimes(2);
    },
  );

  it("surfaces retryable HTTP errors after the retry also fails", async () => {
    vi.useFakeTimers();
    mockJsonResponse({ error: { message: "down" } }, 503);
    mockJsonResponse({ error: { message: "still down" } }, 503);

    const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "",
      userMessage: "",
    });
    const expectation = expect(summaryPromise).rejects.toThrow(
      "Anthropic request failed with status 503",
    );

    await advanceRetryDelay();
    await expectation;
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable 400-class HTTP statuses", async () => {
    mockJsonResponse({ error: { message: "bad request" } }, 400);

    await expect(
      new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    ).rejects.toThrow("Anthropic request failed with status 400");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("clears request timeout timers after successful and retried responses", async () => {
    vi.useFakeTimers();
    fetchMock().mockRejectedValueOnce(new TypeError("fetch failed"));
    mockJsonResponse({ content: [{ type: "text", text: "ok" }] });

    const summaryPromise = new AnthropicAdapter({ apiKey: "sk-ant" }).summarize({
      agentMessage: "",
      userMessage: "",
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
    await summaryPromise;

    expect(vi.getTimerCount()).toBe(0);
  });
});

function mockJsonResponse(body: unknown, status = 200, headers?: HeadersInit): void {
  fetchMock().mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    }),
  );
}

function mockJsonParseError(error: Error): void {
  fetchMock().mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({ "Content-Type": "application/json" }),
    json: vi.fn().mockRejectedValue(error),
  } as unknown as Response);
}

function mockAbortableFetchTimeout(): void {
  fetchMock().mockImplementationOnce(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("Expected request signal"));
          return;
        }

        signal.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted.", "AbortError")),
          { once: true },
        );
      }),
  );
}

async function advanceRetryDelay(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
}

function fetchMock(): ReturnType<typeof vi.fn> {
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

function getFetchCall(index: number): [string, RequestInit] {
  return fetchMock().mock.calls[index] as [string, RequestInit];
}

function getJsonBody(init: RequestInit): Record<string, unknown> & { messages?: unknown[] } {
  return JSON.parse(String(init.body));
}

async function catchError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }

  throw new Error("Expected promise to reject");
}
