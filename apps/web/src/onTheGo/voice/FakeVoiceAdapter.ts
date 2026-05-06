import { abortable, type AbortablePromise } from "../abortable";
import type { ListenOptions, ListenResult, SpeakOptions, VoiceAdapter } from "./VoiceAdapter";

type PendingListen = {
  promise: AbortablePromise<ListenResult>;
  resolve: (value: ListenResult) => void;
  onPartial?: (text: string) => void;
};

export class FakeVoiceAdapter implements VoiceAdapter {
  readonly spokenTexts: string[] = [];
  interruptCount = 0;
  holdSpeak = false;

  private readonly queuedListenTexts: string[] = [];
  private readonly pendingListens: PendingListen[] = [];
  private readonly pendingSpeaks: AbortablePromise<void>[] = [];

  queueListen(text: string): void {
    const pendingListen = this.pendingListens.shift();
    if (pendingListen !== undefined) {
      pendingListen.onPartial?.(text);
      pendingListen.resolve({ finalText: text });
      return;
    }

    this.queuedListenTexts.push(text);
  }

  speak(text: string, opts?: SpeakOptions): AbortablePromise<void> {
    this.spokenTexts.push(text);
    opts?.onStart?.();

    if (!this.holdSpeak) {
      return abortable<void>((resolve) => {
        opts?.onEnd?.();
        resolve();
      });
    }

    let promise!: AbortablePromise<void>;
    promise = abortable<void>(() => {
      return () => {
        this.removePending(this.pendingSpeaks, promise);
        opts?.onEnd?.();
      };
    });
    this.pendingSpeaks.push(promise);

    return promise;
  }

  listen(opts: ListenOptions): AbortablePromise<ListenResult> {
    const finalText = this.queuedListenTexts.shift();
    if (finalText !== undefined) {
      return abortable<ListenResult>((resolve) => {
        opts.onPartial?.(finalText);
        resolve({ finalText });
      });
    }

    let promise!: AbortablePromise<ListenResult>;
    let resolveListen!: (value: ListenResult) => void;
    promise = abortable<ListenResult>((resolve) => {
      resolveListen = resolve;
      return () => {
        this.removePendingListen(promise);
      };
    });
    this.pendingListens.push({
      promise,
      resolve: resolveListen,
      ...(opts.onPartial ? { onPartial: opts.onPartial } : {}),
    });

    return promise;
  }

  interrupt(): void {
    this.interruptCount += 1;

    while (this.pendingSpeaks.length > 0) {
      const pendingSpeak = this.pendingSpeaks[0];
      if (pendingSpeak === undefined) break;
      pendingSpeak.abort();
    }

    while (this.pendingListens.length > 0) {
      const pendingListen = this.pendingListens[0];
      if (pendingListen === undefined) break;
      pendingListen.promise.abort();
    }
  }

  destroy(): void {
    this.interrupt();
  }

  private removePending<T>(pending: AbortablePromise<T>[], promise: AbortablePromise<T>): void {
    const index = pending.indexOf(promise);
    if (index >= 0) {
      pending.splice(index, 1);
    }
  }

  private removePendingListen(promise: AbortablePromise<ListenResult>): void {
    const index = this.pendingListens.findIndex(
      (pendingListen) => pendingListen.promise === promise,
    );
    if (index >= 0) {
      this.pendingListens.splice(index, 1);
    }
  }
}
