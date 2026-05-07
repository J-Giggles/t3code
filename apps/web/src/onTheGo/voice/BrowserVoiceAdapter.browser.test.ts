import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AbortError } from "../abortable";
import { BrowserVoiceAdapter } from "./BrowserVoiceAdapter";

type MockUtterance = {
  text: string;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onstart: (() => void) | null;
};

if (typeof window === "undefined") {
  describe.skip("BrowserVoiceAdapter", () => {});
} else {
  describe("BrowserVoiceAdapter", () => {
    const originalSpeechSynthesis = window.speechSynthesis;
    const originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    let spokenUtterances: MockUtterance[];
    let speak: ReturnType<typeof vi.fn>;
    let cancel: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      spokenUtterances = [];
      speak = vi.fn((utterance: MockUtterance) => {
        spokenUtterances.push(utterance);
        utterance.onstart?.();
      });
      cancel = vi.fn();

      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: { speak, cancel },
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: class SpeechSynthesisUtteranceMock {
          text: string;
          onend: (() => void) | null = null;
          onerror: ((event: { error: string }) => void) | null = null;
          onstart: (() => void) | null = null;

          constructor(text: string) {
            this.text = text;
          }
        },
      });
    });

    afterEach(() => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: originalSpeechSynthesis,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: originalSpeechSynthesisUtterance,
      });
      vi.restoreAllMocks();
    });

    it("speaks text with browser speech synthesis and resolves on end", async () => {
      const adapter = new BrowserVoiceAdapter();
      const onStart = vi.fn();
      const onEnd = vi.fn();

      const pending = adapter.speak("Review ready.", { onStart, onEnd });

      expect(speak).toHaveBeenCalledOnce();
      expect(spokenUtterances[0]?.text).toBe("Review ready.");
      expect(onStart).toHaveBeenCalledOnce();
      expect(onEnd).not.toHaveBeenCalled();

      spokenUtterances[0]?.onend?.();

      await expect(pending).resolves.toBeUndefined();
      expect(onEnd).toHaveBeenCalledOnce();
    });

    it("rejects when speech synthesis is unavailable", async () => {
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: undefined,
      });
      const adapter = new BrowserVoiceAdapter();

      await expect(adapter.speak("No voice here.")).rejects.toThrow("Speech synthesis");
      expect(speak).not.toHaveBeenCalled();
    });

    it("rejects when speech synthesis reports an error", async () => {
      const adapter = new BrowserVoiceAdapter();
      const onEnd = vi.fn();

      const pending = adapter.speak("This fails.", { onEnd });
      spokenUtterances[0]?.onerror?.({ error: "synthesis-failed" });

      await expect(pending).rejects.toThrow("synthesis-failed");
      expect(onEnd).toHaveBeenCalledOnce();
    });

    it("cancels and rejects in-progress speech when aborted", async () => {
      const adapter = new BrowserVoiceAdapter();
      const onEnd = vi.fn();

      const pending = adapter.speak("Stop me.", { onEnd });
      pending.abort();

      expect(cancel).toHaveBeenCalledOnce();
      expect(onEnd).toHaveBeenCalledOnce();
      await expect(pending).rejects.toBeInstanceOf(AbortError);
    });

    it("interrupt cancels in-progress speech", async () => {
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.speak("Interrupt me.");

      adapter.interrupt();

      expect(cancel).toHaveBeenCalledOnce();
      await expect(pending).rejects.toBeInstanceOf(AbortError);
    });

    it("starting a second speech cancels and rejects the first queued speech", async () => {
      const adapter = new BrowserVoiceAdapter();
      const first = adapter.speak("First.");
      const second = adapter.speak("Second.");

      expect(cancel).toHaveBeenCalledOnce();
      await expect(first).rejects.toBeInstanceOf(AbortError);

      spokenUtterances[1]?.onend?.();
      await expect(second).resolves.toBeUndefined();
    });

    it("settles speech from other adapter instances when global synthesis is canceled", async () => {
      const firstAdapter = new BrowserVoiceAdapter();
      const secondAdapter = new BrowserVoiceAdapter();
      const first = firstAdapter.speak("First adapter.");
      const second = secondAdapter.speak("Second adapter.");

      expect(cancel).toHaveBeenCalledOnce();
      await expect(first).rejects.toBeInstanceOf(AbortError);

      firstAdapter.interrupt();

      expect(cancel).toHaveBeenCalledTimes(2);
      await expect(second).rejects.toBeInstanceOf(AbortError);
    });

    it("interrupt from onStart cancels without reading an uninitialized promise", async () => {
      const adapter = new BrowserVoiceAdapter();

      const pending = adapter.speak("Interrupt on start.", {
        onStart: () => adapter.interrupt(),
      });

      expect(cancel).toHaveBeenCalledOnce();
      await expect(pending).rejects.toBeInstanceOf(AbortError);
    });

    it("settles even when callbacks throw", async () => {
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.speak("Callback failure.", {
        onEnd: () => {
          throw new Error("callback failed");
        },
        onStart: () => {
          throw new Error("callback failed");
        },
      });

      spokenUtterances[0]?.onend?.();

      await expect(pending).resolves.toBeUndefined();
    });

    it("continues canceling pending speech when an onEnd callback throws", async () => {
      const firstAdapter = new BrowserVoiceAdapter();
      const secondAdapter = new BrowserVoiceAdapter();
      const first = firstAdapter.speak("First adapter.", {
        onEnd: () => {
          throw new Error("callback failed");
        },
      });
      const second = secondAdapter.speak("Second adapter.");

      expect(cancel).toHaveBeenCalledOnce();
      await expect(first).rejects.toBeInstanceOf(AbortError);

      secondAdapter.interrupt();

      expect(cancel).toHaveBeenCalledTimes(2);
      await expect(second).rejects.toBeInstanceOf(AbortError);
    });

    it("listen rejects as not implemented without starting browser recognition", async () => {
      const adapter = new BrowserVoiceAdapter();

      await expect(adapter.listen({ silenceTimeoutMs: 1000 })).rejects.toThrow(
        "Speech recognition",
      );
    });

    it("destroy cancels in-progress speech", async () => {
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.speak("Cleanup.");

      adapter.destroy();

      expect(cancel).toHaveBeenCalledOnce();
      await expect(pending).rejects.toBeInstanceOf(AbortError);
    });
  });
}
