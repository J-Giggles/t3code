import * as path from "node:path";
import type { DictationCapability } from "@t3tools/contracts";

export interface CapabilityProbeIo {
  which(binary: string): Promise<string | null>;
  spawnHelp(path: string): Promise<string>;
  fileExists(path: string): Promise<boolean>;
  readEnv(): string | null;
  readConfigModel(): Promise<string | null>;
  homeDir(): string;
}

const CANDIDATE_BINARIES = ["whisper-cli", "whisper-stream", "main"] as const;

const STREAM_MODE_MARKERS = [/--stream/i, /\bcapture\b.*stdin/i, /\bstdin\b/i];

function modelLabel(absPath: string): string {
  const base = path.basename(absPath);
  return base.replace(/\.bin$/i, "");
}

async function resolveBinary(
  io: CapabilityProbeIo,
): Promise<
  | { kind: "available"; path: string; help: string }
  | { kind: "unsupported"; path: string }
  | { kind: "missing" }
> {
  let unsupportedPath: string | null = null;

  for (const binary of CANDIDATE_BINARIES) {
    const found = await io.which(binary);
    if (!found) continue;
    const help = await io.spawnHelp(found);
    if (STREAM_MODE_MARKERS.some((re) => re.test(help))) {
      return { kind: "available", path: found, help };
    }
    unsupportedPath ??= found;
  }

  return unsupportedPath ? { kind: "unsupported", path: unsupportedPath } : { kind: "missing" };
}

async function resolveModelPath(io: CapabilityProbeIo): Promise<string | null> {
  const fromConfig = await io.readConfigModel();
  if (fromConfig && (await io.fileExists(fromConfig))) return fromConfig;

  const fromEnv = io.readEnv();
  if (fromEnv && (await io.fileExists(fromEnv))) return fromEnv;

  const home = io.homeDir();
  const defaults = [
    path.join(home, ".cache", "whisper", "ggml-base.en.bin"),
    path.join(home, ".cache", "whisper", "ggml-small.en.bin"),
    path.join(home, ".cache", "whisper", "ggml-tiny.en.bin"),
  ];
  for (const candidate of defaults) {
    if (await io.fileExists(candidate)) return candidate;
  }
  return null;
}

export async function probeDictationCapability(
  io: CapabilityProbeIo,
): Promise<DictationCapability> {
  const binary = await resolveBinary(io);
  if (binary.kind === "missing") {
    return {
      available: false,
      reason: "whisper.cpp binary not found (looked for whisper-cli, whisper-stream, main)",
      modelLabel: null,
      modelPath: null,
      binaryPath: null,
    };
  }

  if (binary.kind === "unsupported") {
    return {
      available: false,
      reason: `whisper.cpp binary found but does not advertise stream/stdin support: ${binary.path}`,
      modelLabel: null,
      modelPath: null,
      binaryPath: binary.path,
    };
  }

  const model = await resolveModelPath(io);
  if (!model) {
    return {
      available: false,
      reason: "whisper model file not found (set WHISPER_MODEL env or ~/.cache/whisper/ggml-*.bin)",
      modelLabel: null,
      modelPath: null,
      binaryPath: binary.path,
    };
  }

  return {
    available: true,
    reason: null,
    modelLabel: modelLabel(model),
    modelPath: model,
    binaryPath: binary.path,
  };
}
