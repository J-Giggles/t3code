import { abortable, AbortError, type AbortablePromise } from "../abortable";
import type { ListenOptions, ListenResult, SpeakOptions, VoiceAdapter } from "./VoiceAdapter";

type PendingSpeech = {
  reject: (reason: unknown) => void;
  finish: () => void;
  notifyEnd: () => void;
};

export class BrowserVoiceAdapter implements VoiceAdapter {
  private static readonly pendingSpeeches = new Set<PendingSpeech>();

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

  listen(_opts: ListenOptions): AbortablePromise<ListenResult> {
    return unsupported("Speech recognition is not implemented in BrowserVoiceAdapter yet.");
  }

  interrupt(): void {
    const speechSynthesis = getSpeechSynthesis();
    this.cancelPendingSpeeches(speechSynthesis);
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

function unsupported<T>(message: string): AbortablePromise<T> {
  return abortable<T>((_resolve, reject) => {
    reject(new Error(message));
  });
}
