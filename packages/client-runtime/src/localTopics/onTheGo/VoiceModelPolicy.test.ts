import { DEFAULT_ON_THE_GO_SETTINGS } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveSupportedVoiceModel } from "./VoiceModelPolicy.ts";

describe("On-the-Go local voice model policy", () => {
  it("OTG-UT-019: uses an approved supported fallback and never silently invents one", () => {
    const settings = {
      ...DEFAULT_ON_THE_GO_SETTINGS,
      transcriptionModel: {
        providerId: "remote",
        modelId: "whisper",
        capability: "transcription" as const,
      },
      fallbackModels: {
        ...DEFAULT_ON_THE_GO_SETTINGS.fallbackModels,
        transcription: [
          {
            providerId: "system",
            modelId: "default-transcription",
            capability: "transcription" as const,
          },
        ],
      },
    };
    expect(
      resolveSupportedVoiceModel({
        settings,
        capability: "transcription",
        supported: [{ providerId: "system", modelId: "default-transcription" }],
      }),
    ).toMatchObject({
      selected: { providerId: "system", modelId: "default-transcription" },
      fallback: true,
      reason: null,
    });
    expect(
      resolveSupportedVoiceModel({
        settings: { ...settings, fallbackModels: DEFAULT_ON_THE_GO_SETTINGS.fallbackModels },
        capability: "transcription",
        supported: [{ providerId: "system", modelId: "default-transcription" }],
      }),
    ).toMatchObject({ selected: null, fallback: false });
  });
});
