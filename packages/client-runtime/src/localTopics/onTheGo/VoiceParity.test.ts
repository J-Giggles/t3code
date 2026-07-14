import { describe, expect, it } from "vite-plus/test";

import { normalizeRecognizedVoicePhrase } from "./Controller.ts";
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

  it("OTG-UT-005/021: accepts audited local Whisper variants only for low-risk read commands", () => {
    expect(normalizeRecognizedVoicePhrase("What changed in the follow chat?")).toBe(
      "what changed in the followed chat",
    );
    expect(normalizeRecognizedVoicePhrase("Inspect the OData.")).toBe("inspect theo data");
    for (const immutable of ON_THE_GO_IMMUTABLE_PHRASES) {
      expect(normalizeRecognizedVoicePhrase(immutable)).toBe(immutable.toLocaleLowerCase());
    }
  });
});
