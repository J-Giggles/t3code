import {
  resolveSupportedVoiceModel,
  type OnTheGoSpeechAdapter,
} from "@t3tools/client-runtime/onTheGo";
import type { OnTheGoSettings } from "@t3tools/contracts";

import { makePcmRecognitionPort, type PcmTranscriptionTransport } from "./PcmSpeechRecognition.ts";

export interface BrowserRecognitionPort {
  readonly start: (
    listener: (transcript: string) => void,
    onFailure?: (reason: string) => void,
  ) => void;
  readonly abort: () => void;
}

export interface BrowserSynthesisPort {
  readonly speak: (text: string) => Promise<void>;
  readonly cancel: () => void;
  readonly isSpeaking: () => boolean;
}

export interface BrowserSpeechAdapterOptions {
  readonly backgroundAvailable: boolean;
  readonly visibility: () => DocumentVisibilityState;
  readonly recognition: BrowserRecognitionPort | null;
  readonly synthesis: BrowserSynthesisPort | null;
  readonly unavailableReason?: string;
}

export interface BrowserSpeechAdapter extends OnTheGoSpeechAdapter {
  readonly setBargeInEnabled: (enabled: boolean) => void;
  readonly handleVisibilityChange: (visibility: DocumentVisibilityState) => void;
  readonly dispose?: () => void;
}

const isStop = (transcript: string) => transcript.trim().toLocaleLowerCase() === "stop";

export const makeBrowserSpeechAdapter = (
  options: BrowserSpeechAdapterOptions,
): BrowserSpeechAdapter => {
  let bargeInEnabled = true;
  let active = false;
  let listener: ((transcript: string) => void) | null = null;

  const stopRecognition = () => {
    if (!active) return;
    active = false;
    options.recognition?.abort();
  };

  return {
    availability: () => ({
      available: options.recognition !== null && options.synthesis !== null,
      background: options.backgroundAvailable,
      ...(options.unavailableReason ? { reason: options.unavailableReason } : {}),
    }),
    start: (nextListener, onFailure) => {
      listener = nextListener;
      active = true;
      options.recognition?.start((nextTranscript) => {
        const stop = isStop(nextTranscript);
        if (options.synthesis?.isSpeaking()) {
          if (!bargeInEnabled && !stop) return;
          options.synthesis.cancel();
        }
        listener?.(nextTranscript);
      }, onFailure);
      return () => {
        listener = null;
        stopRecognition();
      };
    },
    speak: (text) => options.synthesis?.speak(text) ?? Promise.resolve(),
    stop: () => options.synthesis?.cancel(),
    setBargeInEnabled: (enabled) => {
      bargeInEnabled = enabled;
    },
    handleVisibilityChange: (visibility) => {
      if (visibility === "hidden" && !options.backgroundAvailable) stopRecognition();
    },
  };
};

interface BrowserSpeechRecognitionEvent {
  readonly results: {
    readonly length: number;
    readonly [index: number]: {
      readonly isFinal: boolean;
      readonly 0: { readonly transcript: string };
    };
  };
}

interface BrowserSpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { readonly error?: string; readonly message?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognitionInstance;

const recognitionFailureReason = (error: string | undefined) => {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Transcription failed: microphone or speech recognition permission was denied";
    case "audio-capture":
      return "Transcription failed: the selected microphone produced no audio";
    case "language-not-supported":
      return "Transcription failed: the selected language is not supported on this device";
    case "network":
      return "Transcription failed: browser speech service network error";
    default:
      return `Transcription failed${error ? `: ${error}` : ""}`;
  }
};

const recognitionConstructor = () => {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
};

export const resolveBrowserSpeechSelection = (
  settings: OnTheGoSettings,
  environmentTranscriptionAvailable = false,
) => {
  const transcription = resolveSupportedVoiceModel({
    settings,
    capability: "transcription",
    supported: environmentTranscriptionAvailable
      ? [
          { providerId: "system", modelId: "default-transcription" },
          { providerId: "local", modelId: "whisper-base-en" },
          { providerId: "local", modelId: "whisper-tiny-en" },
        ]
      : [{ providerId: "system", modelId: "default-transcription" }],
  });
  const speech = resolveSupportedVoiceModel({
    settings,
    capability: "speech",
    supported: [{ providerId: "system", modelId: "default-speech" }],
  });
  return {
    transcription: transcription.selected !== null,
    speech: speech.selected !== null,
    transcriptionSelection: transcription.selected,
    speechSelection: speech.selected,
    fallback: transcription.fallback || speech.fallback,
    reason: transcription.reason ?? speech.reason ?? undefined,
  };
};

export const makeNativeBrowserSpeechAdapter = (
  backgroundAvailable: boolean,
  settings: OnTheGoSettings,
  transcriptionTransport?: PcmTranscriptionTransport,
) => {
  const support = resolveBrowserSpeechSelection(settings, transcriptionTransport !== undefined);
  const Recognition = recognitionConstructor();
  const forceBrowserRecognition = Boolean(
    (window as typeof window & { __t3codeOnTheGoUseBrowserRecognition?: boolean })
      .__t3codeOnTheGoUseBrowserRecognition,
  );
  const instance =
    (!transcriptionTransport || forceBrowserRecognition) && Recognition && support.transcription
      ? new Recognition()
      : null;
  let recognitionActive = false;
  let recognitionListener: ((transcript: string) => void) | null = null;
  let recognitionFailureListener: ((reason: string) => void) | null = null;
  if (instance) {
    instance.continuous = true;
    instance.interimResults = false;
    instance.lang = navigator.language || "en-GB";
    instance.onresult = (event) => {
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result?.isFinal) recognitionListener?.(result[0].transcript);
      }
    };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- Web SpeechRecognition implementations consistently expose onerror but not typed EventTarget overloads.
    instance.onerror = (event) => {
      recognitionActive = false;
      recognitionFailureListener?.(recognitionFailureReason(event.error));
    };
    instance.onend = () => {
      if (recognitionActive && (backgroundAvailable || document.visibilityState === "visible")) {
        instance.start();
      }
    };
  }
  const recognition =
    transcriptionTransport && !forceBrowserRecognition && support.transcription
      ? makePcmRecognitionPort({ settings, transport: transcriptionTransport })
      : instance
        ? {
            start: (
              listener: (transcript: string) => void,
              onFailure?: (reason: string) => void,
            ) => {
              recognitionListener = listener;
              recognitionFailureListener = onFailure ?? null;
              recognitionActive = true;
              instance.start();
            },
            abort: () => {
              recognitionActive = false;
              recognitionFailureListener = null;
              instance.abort();
            },
          }
        : null;
  const adapter = makeBrowserSpeechAdapter({
    backgroundAvailable,
    visibility: () => document.visibilityState,
    recognition,
    synthesis:
      support.speech && "speechSynthesis" in window
        ? {
            speak: (text) =>
              new Promise<void>((resolve, reject) => {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.addEventListener("end", () => resolve(), { once: true });
                utterance.addEventListener(
                  "error",
                  () => reject(new Error("Speech synthesis failed")),
                  { once: true },
                );
                window.speechSynthesis.speak(utterance);
              }),
            cancel: () => window.speechSynthesis.cancel(),
            isSpeaking: () => window.speechSynthesis.speaking,
          }
        : null,
    ...(support.reason ? { unavailableReason: support.reason } : {}),
  });
  const handleVisibilityChange = () => {
    adapter.handleVisibilityChange(document.visibilityState);
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);
  const tone = (kind: "response" | "attention") => {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = kind === "attention" ? 660 : 880;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.14);
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
  };
  return {
    ...adapter,
    tone,
    dispose: () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      recognitionActive = false;
      recognitionFailureListener = null;
      recognition?.abort();
      window.speechSynthesis?.cancel();
    },
  };
};
