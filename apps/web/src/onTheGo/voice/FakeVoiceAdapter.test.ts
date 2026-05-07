import { describe, expect, it, vi } from "vitest";

import { AbortError } from "../abortable";
import { FakeVoiceAdapter } from "./FakeVoiceAdapter";
import type { VoiceAdapter } from "./VoiceAdapter";

describe("FakeVoiceAdapter", () => {
  it("implements VoiceAdapter and records spoken text in order", async () => {
    const adapter: VoiceAdapter = new FakeVoiceAdapter();

    await adapter.speak("first");
    await adapter.speak("second");

    expect(adapter).toBeInstanceOf(FakeVoiceAdapter);
    expect((adapter as FakeVoiceAdapter).spokenTexts).toEqual(["first", "second"]);
  });

  it("returns queued listen responses FIFO", async () => {
    const adapter = new FakeVoiceAdapter();

    adapter.queueListen("first response");
    adapter.queueListen("second response");

    await expect(adapter.listen({ silenceTimeoutMs: 1000 })).resolves.toEqual({
      finalText: "first response",
    });
    await expect(adapter.listen({ silenceTimeoutMs: 1000 })).resolves.toEqual({
      finalText: "second response",
    });
  });

  it("rejects pending listen calls on interrupt with AbortError", async () => {
    const adapter = new FakeVoiceAdapter();
    const listen = adapter.listen({ silenceTimeoutMs: 1000 });

    adapter.interrupt();

    expect(adapter.interruptCount).toBe(1);
    await expect(listen).rejects.toBeInstanceOf(AbortError);
  });

  it("rejects pending speak calls on interrupt with AbortError", async () => {
    const adapter = new FakeVoiceAdapter();
    adapter.holdSpeak = true;
    const speak = adapter.speak("held text");

    adapter.interrupt();

    expect(adapter.spokenTexts).toEqual(["held text"]);
    expect(adapter.interruptCount).toBe(1);
    await expect(speak).rejects.toBeInstanceOf(AbortError);
  });

  it("fires onPartial when queueListen resolves a pending listen", async () => {
    const adapter = new FakeVoiceAdapter();
    const onPartial = vi.fn();
    const listen = adapter.listen({ silenceTimeoutMs: 1000, onPartial });

    adapter.queueListen("live response");

    await expect(listen).resolves.toEqual({ finalText: "live response" });
    expect(onPartial).toHaveBeenCalledWith("live response");
  });
});
