import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  DictationAudioFrameInput,
  DictationCapability,
  DictationStartInput,
  DictationStartResult,
  DictationStopInput,
  DictationStreamEvent,
} from "./dictation.ts";

describe("dictation schemas", () => {
  it("roundtrips DictationStartInput", () => {
    const decoded = Schema.decodeUnknownSync(DictationStartInput)({
      threadId: "thread_abc123",
      language: null,
    });
    expect(decoded.threadId).toBe("thread_abc123");
    expect(decoded.language).toBeNull();
  });

  it("roundtrips DictationAudioFrameInput with base64 PCM", () => {
    const decoded = Schema.decodeUnknownSync(DictationAudioFrameInput)({
      sessionId: "sess_1",
      seq: 0,
      pcm: "AAAA",
    });
    expect(decoded.seq).toBe(0);
  });

  it("roundtrips DictationStreamEvent partial", () => {
    const decoded = Schema.decodeUnknownSync(DictationStreamEvent)({
      type: "partial",
      sessionId: "sess_1",
      text: "hello",
    });
    expect(decoded.type).toBe("partial");
  });

  it("roundtrips DictationStreamEvent commit", () => {
    const decoded = Schema.decodeUnknownSync(DictationStreamEvent)({
      type: "commit",
      sessionId: "sess_1",
      text: "hello world.",
    });
    expect(decoded.type).toBe("commit");
  });

  it("DictationCapability available defaults", () => {
    const decoded = Schema.decodeUnknownSync(DictationCapability)({
      available: true,
      reason: null,
      modelLabel: "ggml-base.en",
      binaryPath: "/usr/bin/whisper-cli",
    });
    expect(decoded.available).toBe(true);
  });

  it("DictationStopInput accepts reason union", () => {
    const reasons = ["user", "thread-switch", "tab-hidden", "mic-disconnect"] as const;
    for (const reason of reasons) {
      const decoded = Schema.decodeUnknownSync(DictationStopInput)({
        sessionId: "sess_1",
        reason,
      });
      expect(decoded.reason).toBe(reason);
    }
  });

  it("DictationStartResult exposes sessionId and modelLabel", () => {
    const decoded = Schema.decodeUnknownSync(DictationStartResult)({
      sessionId: "sess_1",
      modelLabel: "ggml-base.en",
    });
    expect(decoded.sessionId).toBe("sess_1");
  });
});
