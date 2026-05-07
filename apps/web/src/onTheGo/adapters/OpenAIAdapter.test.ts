import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAIAdapter } from "./OpenAIAdapter";
import { InvalidApiKeyError, RateLimitError } from "./SummaryAdapter";

const originalFetch = globalThis.fetch;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 250;

describe("OpenAIAdapter", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("summarize calls chat completions with the default endpoint, bearer token, and configured model", async () => {
    mockJsonResponse({ choices: [{ message: { content: "tldr" } }] });

    const adapter = new OpenAIAdapter({ apiKey: "sk-x", model: "gpt-4o" });

    await expect(
      adapter.summarize({
        agentMessage: "Tests pass.",
        userMessage: "Summarize the current state.",
      }),
    ).resolves.toBe("tldr");

    const [url, init] = getFetchCall(0);
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sk-x",
      "Content-Type": "application/json",
    });
    expect(getJsonBody(init)).toMatchObject({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: expect.stringContaining("concise"),
        },
        {
          role: "user",
          content: expect.stringContaining("Tests pass."),
        },
      ],
    });
  });

  it("uses the default model when none is configured", async () => {
    mockJsonResponse({ choices: [{ message: { content: "tldr" } }] });

    await new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
      agentMessage: "Done.",
      userMessage: "What happened?",
    });

    expect(getJsonBody(getFetchCall(0)[1]).model).toBe("gpt-4o-mini");
  });

  it("composePrompt uses the skill as the system prompt and temperature 0", async () => {
    mockJsonResponse({ choices: [{ message: { content: "optimized" } }] });

    await new OpenAIAdapter({ apiKey: "sk-x" }).composePrompt({
      history: [{ role: "user", text: "keep the diff scoped", at: 1 }],
      skill: "SKILL TEXT",
    });

    const body = getJsonBody(getFetchCall(0)[1]);
    expect(body.temperature).toBe(0);
    expect(body.messages?.[0]).toEqual({ role: "system", content: "SKILL TEXT" });
  });

  it("reply maps conversation history before the user turn", async () => {
    mockJsonResponse({ choices: [{ message: { content: "bot reply" } }] });

    const result = await new OpenAIAdapter({ apiKey: "sk-x" }).reply({
      history: [
        { role: "user", text: "What changed?", at: 1 },
        { role: "assistant", text: "The adapter is next.", at: 2 },
      ],
      userTurn: "What should I ask the agent?",
    });

    expect(result).toBe("bot reply");
    expect(getJsonBody(getFetchCall(0)[1]).messages ?? []).toEqual([
      { role: "system", content: expect.stringContaining("coding agent") },
      { role: "user", content: "What changed?" },
      { role: "assistant", content: "The adapter is next." },
      { role: "user", content: "What should I ask the agent?" },
    ]);
  });

  it("uses an overridden endpoint", async () => {
    mockJsonResponse({ choices: [{ message: { content: "ok" } }] });

    await new OpenAIAdapter({
      apiKey: "sk-x",
      endpoint: "https://proxy.example.test/openai/chat",
    }).summarize({ agentMessage: "Done.", userMessage: "Summarize." });

    expect(getFetchCall(0)[0]).toBe("https://proxy.example.test/openai/chat");
  });

  it("throws InvalidApiKeyError for 401 and 403 without retrying", async () => {
    mockJsonResponse({ error: { message: "bad key" } }, 401);

    const invalidKeyError = await catchError(
      new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    );

    expect(invalidKeyError).toBeInstanceOf(InvalidApiKeyError);
    expect(invalidKeyError).toMatchObject({ provider: "openai" });
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    fetchMock().mockClear();
    mockJsonResponse({ error: { message: "forbidden" } }, 403);
    await expect(
      new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    ).rejects.toBeInstanceOf(InvalidApiKeyError);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("throws RateLimitError for 429 with retry-after seconds without retrying", async () => {
    mockJsonResponse({}, 429, { "retry-after": "30" });

    const rateLimitError = await catchError(
      new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    );

    expect(rateLimitError).toBeInstanceOf(RateLimitError);
    expect(rateLimitError).toMatchObject({ retryAfterSeconds: 30 });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("retries once on a network error and then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock().mockRejectedValueOnce(new Error("network"));
    mockJsonResponse({ choices: [{ message: { content: "ok" } }] });

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
      agentMessage: "",
      userMessage: "",
    });

    await advanceRetryDelay();
    await expect(summaryPromise).resolves.toBe("ok");
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("waits for the retry backoff before a second fetch", async () => {
    vi.useFakeTimers();
    fetchMock().mockRejectedValueOnce(new Error("network"));
    mockJsonResponse({ choices: [{ message: { content: "ok" } }] });

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
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
    fetchMock().mockRejectedValue(new Error("network"));

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
      agentMessage: "",
      userMessage: "",
    });
    const expectation = expect(summaryPromise).rejects.toThrow("network");

    await advanceRetryDelay();
    await expectation;
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("fails after retrying missing completion content", async () => {
    vi.useFakeTimers();
    mockJsonResponse({ choices: [] });
    mockJsonResponse({ choices: [] });

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
      agentMessage: "",
      userMessage: "",
    });
    const expectation = expect(summaryPromise).rejects.toThrow(
      "OpenAI completion response did not include content",
    );

    await advanceRetryDelay();
    await expectation;
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("fails after retrying non-string completion content", async () => {
    vi.useFakeTimers();
    mockJsonResponse({ choices: [{ message: { content: [{ text: "nope" }] } }] });
    mockJsonResponse({ choices: [{ message: { content: [{ text: "nope" }] } }] });

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
      agentMessage: "",
      userMessage: "",
    });
    const expectation = expect(summaryPromise).rejects.toThrow(
      "OpenAI completion response did not include content",
    );

    await advanceRetryDelay();
    await expectation;
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("fails after retrying blank completion content", async () => {
    vi.useFakeTimers();
    mockJsonResponse({ choices: [{ message: { content: "   \n\t" } }] });
    mockJsonResponse({ choices: [{ message: { content: "" } }] });

    const promptPromise = new OpenAIAdapter({ apiKey: "sk-x" }).composePrompt({
      history: [{ role: "user", text: "Ship it", at: 1 }],
      skill: "OPTIMIZE",
    });
    const expectation = expect(promptPromise).rejects.toThrow(
      "OpenAI completion response did not include content",
    );

    await advanceRetryDelay();
    await expectation;
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("fails after retrying JSON parse errors", async () => {
    vi.useFakeTimers();
    mockJsonParseError(new SyntaxError("bad json"));
    mockJsonParseError(new SyntaxError("bad json"));

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
      agentMessage: "",
      userMessage: "",
    });
    const expectation = expect(summaryPromise).rejects.toThrow("bad json");

    await advanceRetryDelay();
    await expectation;
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("retries response body AbortError once and then succeeds", async () => {
    vi.useFakeTimers();
    mockJsonParseError(new DOMException("The operation was aborted.", "AbortError"));
    mockJsonResponse({ choices: [{ message: { content: "ok after abort" } }] });

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
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
    mockJsonResponse({ choices: [{ message: { content: "ok after timeout" } }] });

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
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
      mockJsonResponse({ choices: [{ message: { content: "ok" } }] });

      const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
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

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
      agentMessage: "",
      userMessage: "",
    });
    const expectation = expect(summaryPromise).rejects.toThrow(
      "OpenAI request failed with status 503",
    );

    await advanceRetryDelay();
    await expectation;
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable 400-class HTTP statuses", async () => {
    mockJsonResponse({ error: { message: "bad request" } }, 400);

    await expect(
      new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    ).rejects.toThrow("OpenAI request failed with status 400");
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("parses retry-after HTTP dates into seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T10:00:00.000Z"));
    mockJsonResponse({}, 429, {
      "retry-after": "Thu, 07 May 2026 10:00:45 GMT",
    });

    const rateLimitError = await catchError(
      new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
        agentMessage: "",
        userMessage: "",
      }),
    );

    expect(rateLimitError).toBeInstanceOf(RateLimitError);
    expect(rateLimitError).toMatchObject({ retryAfterSeconds: 45 });
  });

  it("clears request timeout timers after successful and retried responses", async () => {
    vi.useFakeTimers();
    fetchMock().mockRejectedValueOnce(new Error("network"));
    mockJsonResponse({ choices: [{ message: { content: "ok" } }] });

    const summaryPromise = new OpenAIAdapter({ apiKey: "sk-x" }).summarize({
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
