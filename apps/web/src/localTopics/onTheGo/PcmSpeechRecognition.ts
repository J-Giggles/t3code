import type { OnTheGoSettings } from "@t3tools/contracts";

const DEFAULT_ENERGY_THRESHOLD = 0.015;
const DEFAULT_SILENCE_MS = 650;
const DEFAULT_MINIMUM_SPEECH_MS = 180;
const DEFAULT_MAX_UTTERANCE_MS = 15_000;
const TARGET_SAMPLE_RATE = 16_000;

export interface PcmUtteranceDetector {
  readonly push: (frame: Float32Array) => void;
  readonly reset: () => void;
}

const frameEnergy = (frame: Float32Array) => {
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return frame.length === 0 ? 0 : Math.sqrt(sum / frame.length);
};

const concatenate = (frames: ReadonlyArray<Float32Array>) => {
  const samples = new Float32Array(frames.reduce((total, frame) => total + frame.length, 0));
  let offset = 0;
  for (const frame of frames) {
    samples.set(frame, offset);
    offset += frame.length;
  }
  return samples;
};

export const downsamplePcm16 = (
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate = TARGET_SAMPLE_RATE,
) => {
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Int16Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((outputIndex + 1) * ratio)));
    let sum = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) sum += input[inputIndex]!;
    const normalized = Math.max(-1, Math.min(1, sum / (end - start)));
    output[outputIndex] = normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff;
  }
  return output;
};

export const makePcmUtteranceDetector = (options: {
  readonly inputSampleRate: number;
  readonly energyThreshold?: number;
  readonly silenceMs?: number;
  readonly minimumSpeechMs?: number;
  readonly maxUtteranceMs?: number;
  readonly onUtterance: (pcm: Int16Array) => void;
}): PcmUtteranceDetector => {
  const threshold = options.energyThreshold ?? DEFAULT_ENERGY_THRESHOLD;
  const silenceSamples =
    options.inputSampleRate * ((options.silenceMs ?? DEFAULT_SILENCE_MS) / 1_000);
  const minimumSpeechSamples =
    options.inputSampleRate * ((options.minimumSpeechMs ?? DEFAULT_MINIMUM_SPEECH_MS) / 1_000);
  const maximumSamples =
    options.inputSampleRate * ((options.maxUtteranceMs ?? DEFAULT_MAX_UTTERANCE_MS) / 1_000);
  let frames = new Array<Float32Array>();
  let speechSamples = 0;
  let trailingSilenceSamples = 0;

  const reset = () => {
    frames = [];
    speechSamples = 0;
    trailingSilenceSamples = 0;
  };
  const emit = () => {
    if (speechSamples >= minimumSpeechSamples) {
      options.onUtterance(
        downsamplePcm16(concatenate(frames), options.inputSampleRate, TARGET_SAMPLE_RATE),
      );
    }
    reset();
  };

  return {
    push: (frame) => {
      const speech = frameEnergy(frame) >= threshold;
      if (frames.length === 0 && !speech) return;
      frames.push(frame.slice());
      if (speech) {
        speechSamples += frame.length;
        trailingSilenceSamples = 0;
      } else {
        trailingSilenceSamples += frame.length;
      }
      const totalSamples = frames.reduce((total, item) => total + item.length, 0);
      if (trailingSilenceSamples >= silenceSamples || totalSamples >= maximumSamples) emit();
    },
    reset,
  };
};

const pcmToBase64 = (pcm: Int16Array) => {
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < pcm.length; index += 1) {
    view.setInt16(index * 2, pcm[index]!, true);
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

export interface PcmTranscriptionTransport {
  readonly transcribe: (input: {
    readonly pcmBase64: string;
    readonly sampleRate: 16_000;
    readonly language: string;
    readonly model: OnTheGoSettings["transcriptionModel"];
  }) => Promise<
    | { readonly status: "success"; readonly text: string }
    | { readonly status: "unavailable"; readonly reason: "model-unavailable" }
    | {
        readonly status: "failure";
        readonly reason: "audio-invalid" | "audio-too-large" | "transcription-failed";
      }
  >;
}

type PcmRecognitionResult =
  | { readonly status: "success"; readonly text: string }
  | { readonly status: "failure"; readonly reason: string };

export const requestPcmTranscription = async (
  transport: PcmTranscriptionTransport,
  input: Parameters<PcmTranscriptionTransport["transcribe"]>[0],
): Promise<PcmRecognitionResult> => {
  try {
    const result = await transport.transcribe(input);
    if (result.status === "success") return { status: "success", text: result.text.trim() };
    return {
      status: "failure",
      reason:
        result.status === "unavailable"
          ? "Transcription failed: selected local model is unavailable"
          : `Transcription failed: ${result.reason}`,
    };
  } catch {
    return {
      status: "failure",
      reason: "Transcription failed: active environment request was unavailable",
    };
  }
};

export interface PcmRecognitionPort {
  readonly start: (
    listener: (transcript: string) => void,
    onFailure?: (reason: string) => void,
  ) => void;
  readonly abort: () => void;
}

export const makePcmRecognitionPort = (options: {
  readonly settings: OnTheGoSettings;
  readonly transport: PcmTranscriptionTransport;
}): PcmRecognitionPort => {
  let stopCapture: (() => void) | null = null;
  let stopped = false;
  let captureGeneration = 0;
  let transcriptionQueue = Promise.resolve();

  const abort = () => {
    stopped = true;
    captureGeneration += 1;
    stopCapture?.();
    stopCapture = null;
  };

  return {
    start: (listener, onFailure) => {
      abort();
      stopped = false;
      const activeGeneration = captureGeneration;
      void navigator.mediaDevices
        .getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        .then((stream) => {
          if (stopped || captureGeneration !== activeGeneration) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          const context = new AudioContext();
          const source = context.createMediaStreamSource(stream);
          const processor = context.createScriptProcessor(4_096, 1, 1);
          const silentGain = context.createGain();
          silentGain.gain.value = 0;
          const detector = makePcmUtteranceDetector({
            inputSampleRate: context.sampleRate,
            onUtterance: (pcm) => {
              transcriptionQueue = transcriptionQueue.then(async () => {
                if (stopped || captureGeneration !== activeGeneration) return;
                const result = await requestPcmTranscription(options.transport, {
                  pcmBase64: pcmToBase64(pcm),
                  sampleRate: TARGET_SAMPLE_RATE,
                  language: (navigator.language || "en-GB").split("-")[0] || "en",
                  model: options.settings.transcriptionModel,
                });
                if (stopped || captureGeneration !== activeGeneration) return;
                if (result.status === "success") {
                  if (result.text) listener(result.text);
                  return;
                }
                onFailure?.(result.reason);
                abort();
              });
            },
          });
          processor.onaudioprocess = (event) => {
            detector.push(event.inputBuffer.getChannelData(0));
          };
          source.connect(processor);
          processor.connect(silentGain);
          silentGain.connect(context.destination);
          stopCapture = () => {
            processor.onaudioprocess = null;
            processor.disconnect();
            source.disconnect();
            silentGain.disconnect();
            detector.reset();
            stream.getTracks().forEach((track) => track.stop());
            void context.close();
          };
        })
        .catch((error: unknown) => {
          if (stopped || captureGeneration !== activeGeneration) return;
          const errorName = error instanceof Error && error.name ? ` (${error.name})` : "";
          onFailure?.(`Transcription failed: microphone capture unavailable${errorName}`);
          abort();
        });
    },
    abort,
  };
};
