import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AbortError } from "../abortable";
import { BrowserVoiceAdapter } from "./BrowserVoiceAdapter";

type MockUtterance = {
  text: string;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onstart: (() => void) | null;
};

type MockRecognitionEvent = {
  resultIndex?: number;
  results: Array<Array<{ transcript: string }> & { isFinal?: boolean }>;
};

type MockRecognitionErrorEvent = {
  error?: string;
  message?: string;
};

type MockRecognitionListener = (event?: MockRecognitionErrorEvent | MockRecognitionEvent) => void;

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];
  static startImplementation: (() => void) | undefined;

  continuous = false;
  interimResults = false;
  start = vi.fn(() => {
    MockSpeechRecognition.startImplementation?.();
  });
  stop = vi.fn();
  abort = vi.fn();
  addEventListener = vi.fn(
    (type: "end" | "error" | "result", listener: MockRecognitionListener) => {
      this.listeners[type].add(listener);
    },
  );
  removeEventListener = vi.fn(
    (type: "end" | "error" | "result", listener: MockRecognitionListener) => {
      this.listeners[type].delete(listener);
    },
  );
  private readonly listeners = {
    end: new Set<MockRecognitionListener>(),
    error: new Set<MockRecognitionListener>(),
    result: new Set<MockRecognitionListener>(),
  };

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  emitResult(transcripts: string | string[], options?: { resultIndex?: number }): void {
    const transcriptList = Array.isArray(transcripts) ? transcripts : [transcripts];
    const results = transcriptList.map((transcript) =>
      Object.assign([{ transcript }], { isFinal: false }),
    );
    for (const listener of this.listeners.result) {
      listener({ resultIndex: options?.resultIndex ?? 0, results });
    }
  }

  emitError(error: MockRecognitionErrorEvent): void {
    for (const listener of this.listeners.error) {
      listener(error);
    }
  }

  emitEnd(): void {
    for (const listener of this.listeners.end) {
      listener();
    }
  }
}

if (typeof window === "undefined") {
  describe.skip("BrowserVoiceAdapter", () => {});
} else {
  describe("BrowserVoiceAdapter", () => {
    const originalSpeechSynthesis = window.speechSynthesis;
    const originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
    const originalSpeechRecognition = (
      window as typeof window & {
        webkitSpeechRecognition?: unknown;
      }
    ).webkitSpeechRecognition;
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
      MockSpeechRecognition.instances = [];
      MockSpeechRecognition.startImplementation = undefined;
      Object.defineProperty(window, "webkitSpeechRecognition", {
        configurable: true,
        value: MockSpeechRecognition,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: originalSpeechSynthesis,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: originalSpeechSynthesisUtterance,
      });
      if (originalSpeechRecognition === undefined) {
        delete (window as typeof window & { webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition;
      } else {
        Object.defineProperty(window, "webkitSpeechRecognition", {
          configurable: true,
          value: originalSpeechRecognition,
        });
      }
      vi.restoreAllMocks();
      MockSpeechRecognition.startImplementation = undefined;
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

    it("starts webkitSpeechRecognition with continuous interim results", async () => {
      const adapter = new BrowserVoiceAdapter();

      const pending = adapter.listen({ silenceTimeoutMs: 1000 });

      const recognition = MockSpeechRecognition.instances[0];
      expect(recognition).toBeDefined();
      expect(recognition?.continuous).toBe(true);
      expect(recognition?.interimResults).toBe(true);
      expect(recognition?.start).toHaveBeenCalledOnce();

      pending.abort();
      await expect(pending).rejects.toBeInstanceOf(AbortError);
    });

    it("delivers partial text and resolves finalText after silence following interim results", async () => {
      vi.useFakeTimers();
      const adapter = new BrowserVoiceAdapter();
      const onPartial = vi.fn();
      const pending = adapter.listen({ onPartial, silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      recognition?.emitResult("  hello");
      vi.advanceTimersByTime(750);
      recognition?.emitResult("  hello world  ");
      vi.advanceTimersByTime(999);

      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => undefined,
      );
      await Promise.resolve();
      expect(settled).toBe(false);

      vi.advanceTimersByTime(1);

      await expect(pending).resolves.toEqual({ finalText: "hello world" });
      expect(onPartial).toHaveBeenCalledTimes(2);
      expect(onPartial).toHaveBeenLastCalledWith("  hello world  ");
      expect(recognition?.stop).toHaveBeenCalledOnce();
    });

    it("keeps earlier transcript segments when resultIndex points at a changed result", async () => {
      vi.useFakeTimers();
      const adapter = new BrowserVoiceAdapter();
      const onPartial = vi.fn();
      const pending = adapter.listen({ onPartial, silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      recognition?.emitResult(["first phrase", "second phrase"], { resultIndex: 1 });
      vi.advanceTimersByTime(1000);

      await expect(pending).resolves.toEqual({
        finalText: "first phrase second phrase",
      });
      expect(onPartial).toHaveBeenLastCalledWith("first phrase second phrase");
    });

    it("continues settling when onPartial throws", async () => {
      vi.useFakeTimers();
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.listen({
        onPartial: () => {
          throw new Error("callback failed");
        },
        silenceTimeoutMs: 1000,
      });
      const recognition = MockSpeechRecognition.instances[0];

      recognition?.emitResult("callback failure should not break cleanup");
      vi.advanceTimersByTime(1000);

      await expect(pending).resolves.toEqual({
        finalText: "callback failure should not break cleanup",
      });
    });

    it("interrupt aborts active recognition and rejects with AbortError", async () => {
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.listen({ silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      adapter.interrupt();

      expect(recognition?.abort).toHaveBeenCalledOnce();
      await expect(pending).rejects.toBeInstanceOf(AbortError);
    });

    it("rejects when speech recognition is unavailable", async () => {
      delete (window as typeof window & { webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;
      const adapter = new BrowserVoiceAdapter();

      await expect(adapter.listen({ silenceTimeoutMs: 1000 })).rejects.toThrow(
        "Speech recognition",
      );
      expect(MockSpeechRecognition.instances).toHaveLength(0);
    });

    it("rejects and cleans up listeners when recognition start throws synchronously", async () => {
      const adapter = new BrowserVoiceAdapter();
      const onPartial = vi.fn();
      MockSpeechRecognition.startImplementation = () => {
        throw new Error("start denied");
      };

      const pending = adapter.listen({ onPartial, silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      await expect(pending).rejects.toThrow("start denied");
      expect(recognition?.removeEventListener).toHaveBeenCalledTimes(3);

      recognition?.emitResult("late transcript");
      expect(onPartial).not.toHaveBeenCalled();
    });

    it("rejects and cleans up when recognition reports an error", async () => {
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.listen({ silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      recognition?.emitError({ error: "not-allowed", message: "microphone denied" });

      await expect(pending).rejects.toThrow("not-allowed");
      expect(recognition?.removeEventListener).toHaveBeenCalledTimes(3);
    });

    it("resolves latest text when recognition ends before silence timeout", async () => {
      vi.useFakeTimers();
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.listen({ silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      recognition?.emitResult("  final before end  ");
      vi.advanceTimersByTime(500);
      recognition?.emitEnd();

      await expect(pending).resolves.toEqual({ finalText: "final before end" });
    });

    it("rejects when recognition ends without hearing speech", async () => {
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.listen({ silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      recognition?.emitEnd();

      await expect(pending).rejects.toThrow(/speech/i);
    });

    it("removes recognition listeners and timers after silence cleanup", async () => {
      vi.useFakeTimers();
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.listen({ silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      recognition?.emitResult("cleanup");
      vi.advanceTimersByTime(1000);
      await pending;

      expect(recognition?.removeEventListener).toHaveBeenCalledTimes(3);

      recognition?.emitResult("late result");
      vi.advanceTimersByTime(1000);

      expect(recognition?.stop).toHaveBeenCalledOnce();
    });

    it("starting an overlapping listen aborts and rejects the prior recognition", async () => {
      vi.useFakeTimers();
      const adapter = new BrowserVoiceAdapter();
      const first = adapter.listen({ silenceTimeoutMs: 1000 });
      const firstRecognition = MockSpeechRecognition.instances[0];
      const second = adapter.listen({ silenceTimeoutMs: 1000 });
      const secondRecognition = MockSpeechRecognition.instances[1];

      expect(firstRecognition?.abort).toHaveBeenCalledOnce();
      await expect(first).rejects.toBeInstanceOf(AbortError);

      secondRecognition?.emitResult("second");
      vi.advanceTimersByTime(1000);
      await expect(second).resolves.toEqual({ finalText: "second" });
    });

    it("starting an overlapping listen from another adapter aborts the prior recognition", async () => {
      vi.useFakeTimers();
      const firstAdapter = new BrowserVoiceAdapter();
      const secondAdapter = new BrowserVoiceAdapter();
      const first = firstAdapter.listen({ silenceTimeoutMs: 1000 });
      const firstRecognition = MockSpeechRecognition.instances[0];
      const second = secondAdapter.listen({ silenceTimeoutMs: 1000 });
      const secondRecognition = MockSpeechRecognition.instances[1];

      expect(firstRecognition?.abort).toHaveBeenCalledOnce();
      await expect(first).rejects.toBeInstanceOf(AbortError);

      secondRecognition?.emitResult("second adapter");
      vi.advanceTimersByTime(1000);
      await expect(second).resolves.toEqual({ finalText: "second adapter" });
    });

    it("destroy aborts active recognition", async () => {
      const adapter = new BrowserVoiceAdapter();
      const pending = adapter.listen({ silenceTimeoutMs: 1000 });
      const recognition = MockSpeechRecognition.instances[0];

      adapter.destroy();

      expect(recognition?.abort).toHaveBeenCalledOnce();
      await expect(pending).rejects.toBeInstanceOf(AbortError);
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
