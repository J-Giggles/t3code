import { describe, expect, it } from "vite-plus/test";

import { parseCodexProviderReconnectRetry } from "./CodexAdapter.ts";

describe("parseCodexProviderReconnectRetry", () => {
  it("parses retryable Codex reconnect warnings", () => {
    expect(parseCodexProviderReconnectRetry("Reconnecting... 2/5", true)).toEqual({
      source: "codex",
      kind: "provider-reconnect",
      attempt: 2,
      maxAttempts: 5,
      willRetry: true,
    });
  });

  it("ignores non-retryable and unrelated warnings", () => {
    expect(parseCodexProviderReconnectRetry("Reconnecting... 2/5", false)).toBeUndefined();
    expect(parseCodexProviderReconnectRetry("Network warning", true)).toBeUndefined();
  });
});
