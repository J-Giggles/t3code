// @effect-diagnostics nodeBuiltinImport:off globalTimers:off - This bounded adapter owns a local Whisper subprocess and its hard timeout.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const DEFAULT_MAX_PCM_BYTES = 16_000 * 2 * 15;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface OnTheGoPcmTranscriptionInput {
  readonly pcmBase64: string;
  readonly sampleRate: 16_000;
  readonly language: string;
  readonly model: { readonly providerId: string; readonly modelId: string };
}

export type OnTheGoPcmTranscriptionResult =
  | { readonly status: "success"; readonly text: string }
  | { readonly status: "unavailable"; readonly reason: "model-unavailable" }
  | {
      readonly status: "failure";
      readonly reason: "audio-invalid" | "audio-too-large" | "transcription-failed";
    };

export interface OnTheGoPcmTranscriptionRunnerInput {
  readonly pcm: Uint8Array;
  readonly modelPath: string;
  readonly language: string;
}

export interface OnTheGoPcmTranscriber {
  readonly transcribe: (
    input: OnTheGoPcmTranscriptionInput,
  ) => Promise<OnTheGoPcmTranscriptionResult>;
}

export const makeOnTheGoPcmTranscriber = (options: {
  readonly maxPcmBytes?: number;
  readonly resolveModel: (model: OnTheGoPcmTranscriptionInput["model"]) => string | null;
  readonly run: (input: OnTheGoPcmTranscriptionRunnerInput) => Promise<string>;
}): OnTheGoPcmTranscriber => ({
  transcribe: async (input) => {
    const maxPcmBytes = options.maxPcmBytes ?? DEFAULT_MAX_PCM_BYTES;
    const maxBase64Length = Math.ceil(maxPcmBytes / 3) * 4;
    if (
      input.pcmBase64.length > maxBase64Length ||
      !BASE64_PATTERN.test(input.pcmBase64) ||
      !/^[A-Za-z]{2,8}$/u.test(input.language)
    ) {
      return { status: "failure", reason: "audio-invalid" };
    }
    const paddingBytes = input.pcmBase64.endsWith("==") ? 2 : input.pcmBase64.endsWith("=") ? 1 : 0;
    const estimatedBytes = Math.floor((input.pcmBase64.length * 3) / 4) - paddingBytes;
    if (estimatedBytes > maxPcmBytes) {
      return { status: "failure", reason: "audio-too-large" };
    }
    const pcm = Uint8Array.from(Buffer.from(input.pcmBase64, "base64"));
    if (pcm.byteLength === 0 || pcm.byteLength > maxPcmBytes || pcm.byteLength % 2 !== 0) {
      return { status: "failure", reason: "audio-invalid" };
    }
    const modelPath = options.resolveModel(input.model);
    if (modelPath === null) return { status: "unavailable", reason: "model-unavailable" };
    try {
      const lines = (await options.run({ pcm, modelPath, language: input.language }))
        .replaceAll("\r", "\n")
        .split("\n")
        .map((part) => part.trim())
        .filter(Boolean);
      const text = lines.length > 0 ? lines[lines.length - 1] : undefined;
      return { status: "success", text: text ?? "" };
    } catch {
      return { status: "failure", reason: "transcription-failed" };
    }
  },
});

const modelCandidates = (modelId: string) => {
  const home = NodeOS.homedir();
  const explicit = process.env.T3CODE_ON_THE_GO_WHISPER_MODEL?.trim();
  const tiny = modelId.includes("tiny");
  if (tiny) {
    return [
      ...(explicit ? [explicit] : []),
      NodePath.join(home, ".cache", "whisper", "ggml-tiny.en.bin"),
      NodePath.join(home, ".local", "share", "pywhispercpp", "models", "ggml-tiny.en.bin"),
    ];
  }
  return [
    ...(explicit ? [explicit] : []),
    NodePath.join(home, ".local", "share", "pywhispercpp", "models", "ggml-base.en.bin"),
    NodePath.join(home, ".local", "share", "pywhispercpp", "models", "ggml-base.bin"),
  ];
};

const PCM_SAMPLE_RATE = 16_000;
const PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;
const WAV_HEADER_BYTES = 44;

export const encodePcm16Wav = (pcm: Uint8Array): Uint8Array => {
  const wav = new Uint8Array(WAV_HEADER_BYTES + pcm.byteLength);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  const bytesPerSample = PCM_BITS_PER_SAMPLE / 8;
  const byteRate = PCM_SAMPLE_RATE * PCM_CHANNELS * bytesPerSample;

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, PCM_CHANNELS, true);
  view.setUint32(24, PCM_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, PCM_CHANNELS * bytesPerSample, true);
  view.setUint16(34, PCM_BITS_PER_SAMPLE, true);
  writeAscii(36, "data");
  view.setUint32(40, pcm.byteLength, true);
  wav.set(pcm, WAV_HEADER_BYTES);
  return wav;
};

export const resolveLocalWhisperModel = (model: {
  readonly providerId: string;
  readonly modelId: string;
}) => {
  const supported =
    (model.providerId === "system" && model.modelId === "default-transcription") ||
    (model.providerId === "local" &&
      (model.modelId === "whisper-base-en" || model.modelId === "whisper-tiny-en"));
  if (!supported) return null;
  return modelCandidates(model.modelId).find((candidate) => NodeFS.existsSync(candidate)) ?? null;
};

export const runLocalWhisperWithExecutable = async (
  input: OnTheGoPcmTranscriptionRunnerInput,
  executable: string,
): Promise<string> => {
  const temporaryDirectory = await NodeFS.promises.mkdtemp(
    NodePath.join(NodeOS.tmpdir(), "t3code-whisper-"),
  );
  const audioPath = NodePath.join(temporaryDirectory, "utterance.wav");
  try {
    await NodeFS.promises.writeFile(audioPath, encodePcm16Wav(input.pcm), { mode: 0o600 });
    return await new Promise((resolve, reject) => {
      const child = NodeChildProcess.spawn(
        executable,
        [
          "-m",
          input.modelPath,
          "-l",
          input.language,
          "--no-timestamps",
          "--no-prints",
          "-f",
          audioPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      let settled = false;
      const settle = (effect: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        effect();
      };
      const timeout = setTimeout(() => child.kill("SIGKILL"), 30_000);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (stdout.length < 65_536) stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        if (stderr.length < 8_192) stderr += chunk;
      });
      child.once("error", (error) => settle(() => reject(error)));
      child.once("exit", (code) =>
        settle(() => {
          if (code === 0) resolve(stdout);
          else
            reject(new Error(`Local Whisper exited ${code ?? "without a code"}: ${stderr.trim()}`));
        }),
      );
    });
  } finally {
    await NodeFS.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
};

export const runLocalWhisper = (input: OnTheGoPcmTranscriptionRunnerInput): Promise<string> =>
  runLocalWhisperWithExecutable(
    input,
    process.env.T3CODE_ON_THE_GO_WHISPER_CLI?.trim() || "whisper-cli",
  );

export const localWhisperPcmTranscriber = makeOnTheGoPcmTranscriber({
  resolveModel: resolveLocalWhisperModel,
  run: runLocalWhisper,
});
