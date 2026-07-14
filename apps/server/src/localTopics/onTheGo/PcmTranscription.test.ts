import { describe, expect, it } from "vite-plus/test";

import {
  encodePcm16Wav,
  makeOnTheGoPcmTranscriber,
  runLocalWhisperWithExecutable,
} from "./PcmTranscription.ts";

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

  it("OTG-UT-004/019: wraps captured PCM in a mono 16 kHz WAV for whisper-cli", () => {
    const wav = encodePcm16Wav(Uint8Array.from([1, 2, 3, 4]));
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4);
    expect([...wav.subarray(44)]).toEqual([1, 2, 3, 4]);
  });

  it("OTG-UT-004/019: reports an early whisper-cli exit without writing PCM to a closed stdin", async () => {
    await expect(
      runLocalWhisperWithExecutable(
        {
          pcm: Uint8Array.from([1, 2, 3, 4]),
          modelPath: "/models/ggml-base.en.bin",
          language: "en",
        },
        process.execPath,
      ),
    ).rejects.toThrow(/Local Whisper exited/);
  });
});
