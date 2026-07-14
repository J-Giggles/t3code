import { describe, expect, it } from "vite-plus/test";

import { makePcmUtteranceDetector, requestPcmTranscription } from "./PcmSpeechRecognition.ts";

describe("On-the-Go PCM utterance detection", () => {
  it("OTG-UT-003/004: emits one bounded 16 kHz utterance after speech followed by silence", () => {
    const utterances = new Array<Int16Array>();
    const detector = makePcmUtteranceDetector({
      inputSampleRate: 48_000,
      silenceMs: 200,
      minimumSpeechMs: 100,
      onUtterance: (pcm) => utterances.push(pcm),
    });
    const frame = (amplitude: number) => Float32Array.from({ length: 4_800 }, () => amplitude);

    detector.push(frame(0));
    detector.push(frame(0.2));
    detector.push(frame(0.2));
    detector.push(frame(0));
    detector.push(frame(0));

    expect(utterances).toHaveLength(1);
    expect(utterances[0]!.length).toBeGreaterThanOrEqual(3_000);
    expect(Math.max(...utterances[0]!)).toBeGreaterThan(6_000);
  });

  it("OTG-UT-003/004: ignores silence and speech shorter than the safety minimum", () => {
    const utterances = new Array<Int16Array>();
    const detector = makePcmUtteranceDetector({
      inputSampleRate: 16_000,
      silenceMs: 200,
      minimumSpeechMs: 200,
      onUtterance: (pcm) => utterances.push(pcm),
    });

    detector.push(new Float32Array(1_600));
    detector.push(Float32Array.from({ length: 1_600 }, () => 0.2));
    detector.push(new Float32Array(3_200));

    expect(utterances).toEqual([]);
  });

  it("OTG-UT-003/019: converts unavailable and rejected environment requests into bounded failures", async () => {
    const input = {
      pcmBase64: "AQIDBA==",
      sampleRate: 16_000 as const,
      language: "en",
      model: {
        providerId: "system",
        modelId: "default-transcription",
        capability: "transcription" as const,
      },
    };
    await expect(
      requestPcmTranscription(
        {
          transcribe: async () => ({ status: "unavailable", reason: "model-unavailable" }),
        },
        input,
      ),
    ).resolves.toEqual({
      status: "failure",
      reason: "Transcription failed: selected local model is unavailable",
    });
    await expect(
      requestPcmTranscription(
        { transcribe: async () => Promise.reject(new Error("secret")) },
        input,
      ),
    ).resolves.toEqual({
      status: "failure",
      reason: "Transcription failed: active environment request was unavailable",
    });
  });
});
