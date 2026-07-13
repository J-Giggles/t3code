import { describe, expect, it } from "vite-plus/test";

import { ON_THE_GO_IMMUTABLE_PHRASES, ON_THE_GO_VOICE_PARITY_CATALOG } from "./VoiceParity.ts";

describe("On-the-Go voice parity audit", () => {
  it("OTG-UT-005/006/021: every command family is captioned and has a reciprocal control", () => {
    const phrases = ON_THE_GO_VOICE_PARITY_CATALOG.flatMap((entry) => entry.phrases);
    expect(new Set(ON_THE_GO_VOICE_PARITY_CATALOG.map((entry) => entry.feature)).size).toBe(
      ON_THE_GO_VOICE_PARITY_CATALOG.length,
    );
    expect(
      ON_THE_GO_VOICE_PARITY_CATALOG.every(
        (entry) =>
          entry.captioned && entry.reciprocalControl.length > 0 && entry.phrases.length > 0,
      ),
    ).toBe(true);
    for (const immutable of ON_THE_GO_IMMUTABLE_PHRASES) expect(phrases).toContain(immutable);
  });
});
