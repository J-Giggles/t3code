import { describe, expect, it } from "vite-plus/test";

import { makeOnTheGoPcmTranscriber } from "./PcmTranscription.ts";

describe("On-the-Go PCM transcription", () => {
  it("OTG-UT-004/019: sends bounded PCM to the selected local model and returns only text", async () => {
    const calls = new Array<{ readonly pcm: Uint8Array; readonly modelPath: string }>();
    const transcriber = makeOnTheGoPcmTranscriber({
      resolveModel: () => "/models/ggml-base.en.bin",
      run: async (input) => {
        calls.push({ pcm: input.pcm, modelPath: input.modelPath });
        return "  Hey Theo  \n";
      },
    });

    await expect(
      transcriber.transcribe({
        pcmBase64: "AQIDBA==",
        sampleRate: 16_000,
        language: "en",
        model: { providerId: "system", modelId: "default-transcription" },
      }),
    ).resolves.toEqual({ status: "success", text: "Hey Theo" });
    expect(calls).toEqual([
      { pcm: Uint8Array.from([1, 2, 3, 4]), modelPath: "/models/ggml-base.en.bin" },
    ]);
  });

  it("OTG-UT-004/019: refuses oversized or unavailable local transcription without retaining audio", async () => {
    let runs = 0;
    const transcriber = makeOnTheGoPcmTranscriber({
      maxPcmBytes: 4,
      resolveModel: () => null,
      run: async () => {
        runs += 1;
        return "unexpected";
      },
    });

    await expect(
      transcriber.transcribe({
        pcmBase64: "AQIDBAU=",
        sampleRate: 16_000,
        language: "en",
        model: { providerId: "system", modelId: "default-transcription" },
      }),
    ).resolves.toEqual({ status: "failure", reason: "audio-too-large" });
    await expect(
      transcriber.transcribe({
        pcmBase64: "AQIDBA==",
        sampleRate: 16_000,
        language: "en",
        model: { providerId: "system", modelId: "default-transcription" },
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "model-unavailable" });
    await expect(
      transcriber.transcribe({
        pcmBase64: "AQIDBA==",
        sampleRate: 16_000,
        language: "--help",
        model: { providerId: "system", modelId: "default-transcription" },
      }),
    ).resolves.toEqual({ status: "failure", reason: "audio-invalid" });
    expect(runs).toBe(0);
  });
});
