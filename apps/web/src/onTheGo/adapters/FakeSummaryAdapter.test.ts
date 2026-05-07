import { describe, expect, it } from "vitest";

import { FakeSummaryAdapter } from "./FakeSummaryAdapter";
import type { SummaryAdapter } from "./SummaryAdapter";

const history = [
  {
    role: "user",
    text: "Can we ship this?",
    at: 1,
  },
] as const;

describe("FakeSummaryAdapter", () => {
  it("implements SummaryAdapter and returns the configured summary", async () => {
    const adapter: SummaryAdapter = new FakeSummaryAdapter({ summary: "Ready to review." });

    await expect(
      adapter.summarize({
        agentMessage: "Tests are passing.",
        userMessage: "Summarize the current state.",
      }),
    ).resolves.toBe("Ready to review.");
  });

  it("returns queued replies FIFO", async () => {
    const adapter = new FakeSummaryAdapter({ replies: ["First reply", "Second reply"] });

    await expect(adapter.reply({ history: [...history], userTurn: "Continue" })).resolves.toBe(
      "First reply",
    );
    await expect(adapter.reply({ history: [...history], userTurn: "Then what?" })).resolves.toBe(
      "Second reply",
    );
  });

  it("returns the configured composed prompt", async () => {
    const adapter = new FakeSummaryAdapter({ composedPrompt: "Implement the requested change." });

    await expect(
      adapter.composePrompt({
        history: [...history],
        skill: "optimize-prompt",
      }),
    ).resolves.toBe("Implement the requested change.");
  });

  it("returns useful non-empty defaults", async () => {
    const adapter = new FakeSummaryAdapter();

    await expect(adapter.summarize({ agentMessage: "", userMessage: "" })).resolves.toBe(
      "fake summary",
    );
    await expect(adapter.reply({ history: [], userTurn: "" })).resolves.toBe("fake reply");
    await expect(adapter.composePrompt({ history: [], skill: "" })).resolves.toBe(
      "fake composed prompt",
    );
  });

  it.each([
    [
      "summarize",
      () =>
        new FakeSummaryAdapter({ failOn: "summarize" }).summarize({
          agentMessage: "Status",
          userMessage: "Summary",
        }),
    ],
    [
      "reply",
      () =>
        new FakeSummaryAdapter({ failOn: "reply" }).reply({
          history: [...history],
          userTurn: "Continue",
        }),
    ],
    [
      "composePrompt",
      () =>
        new FakeSummaryAdapter({ failOn: "composePrompt" }).composePrompt({
          history: [...history],
          skill: "optimize-prompt",
        }),
    ],
  ] as const)("throws when %s is configured to fail", async (_method, call) => {
    await expect(call()).rejects.toThrow("FakeSummaryAdapter failed");
  });

  it("throws the configured failError", async () => {
    const error = new Error("custom failure");
    const adapter = new FakeSummaryAdapter({ failOn: "reply", failError: error });

    await expect(adapter.reply({ history: [], userTurn: "" })).rejects.toBe(error);
  });

  it("records public call inputs", async () => {
    const adapter = new FakeSummaryAdapter();
    const summarizeInput = {
      agentMessage: "Done",
      userMessage: "What changed?",
    };
    const replyInput = { history: [...history], userTurn: "What next?" };
    const composeInput = { history: [...history], skill: "optimize-prompt" };

    await adapter.summarize(summarizeInput);
    await adapter.reply(replyInput);
    await adapter.composePrompt(composeInput);

    expect(adapter.summarizeCalls).toEqual([summarizeInput]);
    expect(adapter.replyCalls).toEqual([replyInput]);
    expect(adapter.composeCalls).toEqual([composeInput]);
  });
});
