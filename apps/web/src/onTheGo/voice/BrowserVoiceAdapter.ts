import { abortable, AbortError, type AbortablePromise } from "../abortable";
import type { ListenOptions, ListenResult, SpeakOptions, VoiceAdapter } from "./VoiceAdapter";

type PendingSpeech = {
  reject: (reason: unknown) => void;
  finish: () => void;
  notifyEnd: () => void;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  abort: () => void;
  start: () => void;
  stop: () => void;
  addEventListener: {
    (type: "end", listener: () => void): void;
    (type: "error", listener: (event: SpeechRecognitionErrorEventLike) => void): void;
    (type: "result", listener: (event: SpeechRecognitionResultEventLike) => void): void;
  };
  removeEventListener: {
    (type: "end", listener: () => void): void;
    (type: "error", listener: (event: SpeechRecognitionErrorEventLike) => void): void;
    (type: "result", listener: (event: SpeechRecognitionResultEventLike) => void): void;
  };
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechRecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type SpeechRecognitionResultEventLike = {
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: {
      length: number;
      [index: number]: { transcript?: string };
    };
  };
};

type ActiveRecognition = {
  promise: AbortablePromise<ListenResult>;
  token: symbol;
};

export class BrowserVoiceAdapter implements VoiceAdapter {
  private static readonly pendingSpeeches = new Set<PendingSpeech>();
  private static activeRecognition: ActiveRecognition | undefined;

  speak(text: string, opts?: SpeakOptions): AbortablePromise<void> {
    const speechSynthesis = getSpeechSynthesis();
    const Utterance = getSpeechSynthesisUtterance();

    if (speechSynthesis === undefined || Utterance === undefined) {
      return unsupported("Speech synthesis is not supported in this browser.");
    }

    this.cancelPendingSpeeches(speechSynthesis);

    const utterance = new Utterance(text);
    let pendingSpeech: PendingSpeech | undefined;
    let completed = false;

    const finish = () => {
      if (completed) return;
      completed = true;
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      if (pendingSpeech !== undefined) {
        BrowserVoiceAdapter.pendingSpeeches.delete(pendingSpeech);
      }
    };

    const promise = abortable<void>((resolve, reject) => {
      pendingSpeech = {
        reject,
        finish,
        notifyEnd: () => callSafely(opts?.onEnd),
      };
      BrowserVoiceAdapter.pendingSpeeches.add(pendingSpeech);

      utterance.onstart = () => {
        callSafely(opts?.onStart);
      };
      utterance.onend = () => {
        finish();
        resolve();
        callSafely(opts?.onEnd);
      };
      utterance.onerror = (event) => {
        const errorName = event.error || "unknown speech synthesis error";
        finish();
        reject(new Error(`Speech synthesis failed: ${errorName}`));
        callSafely(opts?.onEnd);
      };

      speechSynthesis.speak(utterance);

      return () => {
        this.cancelPendingSpeeches(speechSynthesis);
      };
    });

    return promise;
  }

  listen(opts: ListenOptions): AbortablePromise<ListenResult> {
    this.abortActiveRecognition();

    const Recognition = getSpeechRecognition();
    if (Recognition === undefined) {
      return unsupported("Speech recognition is not supported in this browser.");
    }

    let recognition: BrowserSpeechRecognition | undefined;
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;
    let completed = false;
    let latestText = "";
    const token = Symbol("BrowserVoiceAdapter recognition");

    const promise = abortable<ListenResult>((resolve, reject) => {
      const cleanup = () => {
        if (completed) return;
        completed = true;
        if (silenceTimer !== undefined) {
          clearTimeout(silenceTimer);
          silenceTimer = undefined;
        }
        recognition?.removeEventListener("result", onResult);
        recognition?.removeEventListener("error", onError);
        recognition?.removeEventListener("end", onEnd);
        if (BrowserVoiceAdapter.activeRecognition?.token === token) {
          BrowserVoiceAdapter.activeRecognition = undefined;
        }
      };

      const settleResolve = (result: ListenResult) => {
        cleanup();
        resolve(result);
      };

      const settleReject = (reason: unknown) => {
        cleanup();
        reject(reason);
      };

      const resetSilenceTimer = () => {
        if (silenceTimer !== undefined) {
          clearTimeout(silenceTimer);
        }
        silenceTimer = setTimeout(() => {
          recognition?.stop();
          settleResolve({ finalText: latestText.trim() });
        }, opts.silenceTimeoutMs);
      };

      const onResult = (event: SpeechRecognitionResultEventLike) => {
        const text = collectTranscripts(event);
        if (text.length === 0) {
          return;
        }
        latestText = text;
        callSafely(() => opts.onPartial?.(text));
        resetSilenceTimer();
      };

      const onError = (event: SpeechRecognitionErrorEventLike) => {
        const errorName = event.error ?? "unknown";
        const message = event.message === undefined ? "" : `: ${event.message}`;
        settleReject(new Error(`Speech recognition failed: ${errorName}${message}`));
      };

      const onEnd = () => {
        const finalText = latestText.trim();
        if (finalText.length > 0) {
          settleResolve({ finalText });
          return;
        }
        settleReject(new Error("Speech recognition ended without speech."));
      };

      recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.addEventListener("result", onResult);
      recognition.addEventListener("error", onError);
      recognition.addEventListener("end", onEnd);
      try {
        recognition.start();
      } catch (error) {
        settleReject(error);
      }

      return () => {
        cleanup();
        recognition?.abort();
      };
    });

    if (!completed) {
      BrowserVoiceAdapter.activeRecognition = { promise, token };
    }
    return promise;
  }

  interrupt(): void {
    const speechSynthesis = getSpeechSynthesis();
    this.cancelPendingSpeeches(speechSynthesis);
    this.abortActiveRecognition();
  }

  destroy(): void {
    this.interrupt();
  }

  private cancelPendingSpeeches(speechSynthesis = getSpeechSynthesis()): void {
    const pendingSpeeches = [...BrowserVoiceAdapter.pendingSpeeches];
    if (pendingSpeeches.length === 0) {
      return;
    }

    speechSynthesis?.cancel();

    for (const pendingSpeech of pendingSpeeches) {
      pendingSpeech.finish();
      pendingSpeech.reject(new AbortError());
      pendingSpeech.notifyEnd();
    }
  }

  private abortActiveRecognition(): void {
    BrowserVoiceAdapter.activeRecognition?.promise.abort();
    BrowserVoiceAdapter.activeRecognition = undefined;
  }
}

function callSafely(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch {
    // User callbacks should not break adapter cleanup or promise settlement.
  }
}

function getSpeechSynthesis(): SpeechSynthesis | undefined {
  if (typeof window === "undefined") return undefined;
  return window.speechSynthesis;
}

function getSpeechSynthesisUtterance(): typeof SpeechSynthesisUtterance | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechSynthesisUtterance;
}

function getSpeechRecognition(): BrowserSpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window as typeof window & {
      webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
    }
  ).webkitSpeechRecognition;
}

function collectTranscripts(event: SpeechRecognitionResultEventLike): string {
  const transcripts: string[] = [];

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    if (result?.[0]?.transcript !== undefined) {
      transcripts.push(result[0].transcript);
    }
  }

  return transcripts.join(" ");
}

function unsupported<T>(message: string): AbortablePromise<T> {
  return abortable<T>((_resolve, reject) => {
    reject(new Error(message));
  });
}
