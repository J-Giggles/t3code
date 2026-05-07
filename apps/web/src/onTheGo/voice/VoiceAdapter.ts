import type { AbortablePromise } from "../abortable";

export type ListenOptions = {
  onPartial?: (text: string) => void;
  silenceTimeoutMs: number;
};

export type ListenResult = { finalText: string };

export type SpeakOptions = {
  onStart?: () => void;
  onEnd?: () => void;
};

export interface VoiceAdapter {
  speak(text: string, opts?: SpeakOptions): AbortablePromise<void>;
  listen(opts: ListenOptions): AbortablePromise<ListenResult>;
  interrupt(): void;
  destroy(): void;
}
