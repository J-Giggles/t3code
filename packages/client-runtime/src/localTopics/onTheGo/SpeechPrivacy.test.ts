import { describe, expect, it } from "vite-plus/test";

import { renderOnTheGoDisplay, renderOnTheGoSpeech } from "./SpeechPrivacy.ts";

describe("On-the-Go speech privacy", () => {
  it("OTG-UT-009/020: removes code, stack traces, and credentials before speech or display", () => {
    const unsafe = [
      "Implemented authentication.",
      "```ts",
      "const token = 'raw';",
      "```",
      "api_key=do-not-speak",
      "at worker.ts:10:3",
      "Authorization: Bearer abc.def",
    ].join("\n");
    expect(renderOnTheGoSpeech(unsafe, "private")).toBe("Implemented authentication.");
    expect(renderOnTheGoDisplay(unsafe)).toBe("Implemented authentication.");
  });

  it("OTG-UT-020: bounds public output more tightly than private output", () => {
    const text = `${"A".repeat(300)}. ${"B".repeat(1_000)}`;
    expect(renderOnTheGoSpeech(text, "public").length).toBeLessThanOrEqual(241);
    expect(renderOnTheGoSpeech(text, "private").length).toBeGreaterThan(241);
  });
});
