import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  DICTATION_WS_METHODS,
  DictationAudioFrameInput,
  DictationCapability,
  DictationError,
  DictationStartInput,
  DictationStartResult,
  DictationStopInput,
  DictationStreamEvent,
  WsDictationRescanRpc,
} from "./dictation.ts";

function decodes<S extends Schema.Top>(schema: S, input: unknown): boolean {
  try {
    Schema.decodeUnknownSync(schema as never)(input);
    return true;
  } catch {
    return false;
  }
}

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
      modelPath: "/home/user/.cache/whisper/ggml-base.en.bin",
      binaryPath: "/usr/bin/whisper-cli",
    });
    expect(decoded.available).toBe(true);
    expect(decoded.modelPath).toBe("/home/user/.cache/whisper/ggml-base.en.bin");
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

describe("dictation schema constraints", () => {
  it("rejects DictationAudioFrameInput.seq < 0", () => {
    expect(decodes(DictationAudioFrameInput, { sessionId: "s", seq: -1, pcm: "AAAA" })).toBe(false);
  });

  it("rejects DictationAudioFrameInput.seq non-integer", () => {
    expect(decodes(DictationAudioFrameInput, { sessionId: "s", seq: 1.5, pcm: "AAAA" })).toBe(
      false,
    );
  });

  it("rejects DictationAudioFrameInput.pcm > 8192 chars", () => {
    const tooBig = "A".repeat(8193);
    expect(decodes(DictationAudioFrameInput, { sessionId: "s", seq: 0, pcm: tooBig })).toBe(false);
  });

  it("rejects DictationAudioFrameInput.pcm with non-base64 chars", () => {
    expect(decodes(DictationAudioFrameInput, { sessionId: "s", seq: 0, pcm: "not base64!" })).toBe(
      false,
    );
  });

  it("rejects DictationAudioFrameInput.pcm empty string", () => {
    expect(decodes(DictationAudioFrameInput, { sessionId: "s", seq: 0, pcm: "" })).toBe(false);
  });

  it("rejects DictationStartInput.threadId empty/whitespace", () => {
    expect(decodes(DictationStartInput, { threadId: "", language: null })).toBe(false);
    expect(decodes(DictationStartInput, { threadId: "   ", language: null })).toBe(false);
  });

  it("rejects DictationStopInput unknown reason", () => {
    expect(decodes(DictationStopInput, { sessionId: "s", reason: "nope" })).toBe(false);
  });

  it("rejects DictationStreamEvent unknown type", () => {
    expect(decodes(DictationStreamEvent, { type: "bogus", sessionId: "s", text: "hi" })).toBe(
      false,
    );
  });

  it("rejects DictationError unknown code", () => {
    expect(
      () =>
        new DictationError({
          code: "not-a-code" as never,
          message: "x",
          sessionId: null,
        }),
    ).toThrow();
  });
});

describe("dictation event variants", () => {
  it("roundtrips DictationStreamEvent started", () => {
    const decoded = Schema.decodeUnknownSync(DictationStreamEvent)({
      type: "started",
      sessionId: "s",
      modelLabel: "ggml-base.en",
    });
    expect(decoded.type).toBe("started");
  });

  it("roundtrips DictationStreamEvent stopped", () => {
    const decoded = Schema.decodeUnknownSync(DictationStreamEvent)({
      type: "stopped",
      sessionId: "s",
      reason: "client-stop",
    });
    expect(decoded.type).toBe("stopped");
  });

  it("roundtrips DictationStreamEvent error", () => {
    const decoded = Schema.decodeUnknownSync(DictationStreamEvent)({
      type: "error",
      sessionId: null,
      code: "internal",
      message: "boom",
    });
    expect(decoded.type).toBe("error");
  });
});

describe("dictation rescan RPC", () => {
  it("uses the dictation.rescan tag", () => {
    expect(DICTATION_WS_METHODS.rescan).toBe("dictation.rescan");
    expect(WsDictationRescanRpc._tag).toBe(DICTATION_WS_METHODS.rescan);
  });

  it("decodes an empty payload and a DictationCapability success", () => {
    const payload = Schema.decodeUnknownSync(WsDictationRescanRpc.payloadSchema)({});
    expect(payload).toEqual({});

    const success = Schema.decodeUnknownSync(WsDictationRescanRpc.successSchema)({
      available: true,
      reason: null,
      modelLabel: "ggml-base.en",
      modelPath: "/home/user/.cache/whisper/ggml-base.en.bin",
      binaryPath: "/usr/bin/whisper-cli",
    });
    expect(success.available).toBe(true);
    expect(success.modelLabel).toBe("ggml-base.en");
  });
});
