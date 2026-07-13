import type { OnTheGoSpeechAdapter } from "@t3tools/client-runtime/onTheGo";

export interface BrowserRecognitionPort {
  readonly start: (listener: (transcript: string) => void) => void;
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
    }),
    start: (nextListener) => {
      listener = nextListener;
      active = true;
      options.recognition?.start((nextTranscript) => {
        const stop = isStop(nextTranscript);
        if (options.synthesis?.isSpeaking()) {
          if (!bargeInEnabled && !stop) return;
          options.synthesis.cancel();
        }
        listener?.(nextTranscript);
      });
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
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognitionInstance;

const recognitionConstructor = () => {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
};

export const makeNativeBrowserSpeechAdapter = (backgroundAvailable: boolean) => {
  const Recognition = recognitionConstructor();
  const instance = Recognition ? new Recognition() : null;
  let recognitionActive = false;
  let recognitionListener: ((transcript: string) => void) | null = null;
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
    instance.onend = () => {
      if (recognitionActive && (backgroundAvailable || document.visibilityState === "visible")) {
        instance.start();
      }
    };
  }
  const adapter = makeBrowserSpeechAdapter({
    backgroundAvailable,
    visibility: () => document.visibilityState,
    recognition: instance
      ? {
          start: (listener) => {
            recognitionListener = listener;
            recognitionActive = true;
            instance.start();
          },
          abort: () => {
            recognitionActive = false;
            instance.abort();
          },
        }
      : null,
    synthesis:
      "speechSynthesis" in window
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
      instance?.abort();
      window.speechSynthesis?.cancel();
    },
  };
};
