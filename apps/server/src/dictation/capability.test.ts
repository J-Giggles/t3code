import { describe, expect, it, vi } from "vitest";
import { probeDictationCapability } from "./capability.ts";

const okHelp = `usage: whisper-cli [options]
  -f FNAME, --file FNAME       input WAV file (use - for stdin)
  -c ID,    --capture ID       capture device id (-c 0 for stdin)
  --stream                     stream mode
`;

const noStreamHelp = `usage: whisper-cli [options]\n  -f FNAME\n`;

function makeIo(opts: {
  whichResolves: { binary: string; path: string | null }[];
  helpOutput: Record<string, string>;
  modelExists: Record<string, boolean>;
  envModel?: string | null;
  configModel?: string | null;
}) {
  return {
    which: vi.fn(
      async (binary: string) =>
        opts.whichResolves.find((entry) => entry.binary === binary)?.path ?? null,
    ),
    spawnHelp: vi.fn(async (path: string) => opts.helpOutput[path] ?? ""),
    fileExists: vi.fn(async (path: string) => Boolean(opts.modelExists[path])),
    readEnv: vi.fn(() => opts.envModel ?? null),
    readConfigModel: vi.fn(async () => opts.configModel ?? null),
    homeDir: () => "/home/user",
  };
}

describe("probeDictationCapability", () => {
  it("returns available when whisper-cli supports stream mode and a model is found via env", async () => {
    const io = makeIo({
      whichResolves: [{ binary: "whisper-cli", path: "/usr/bin/whisper-cli" }],
      helpOutput: { "/usr/bin/whisper-cli": okHelp },
      modelExists: { "/path/to/ggml-base.en.bin": true },
      envModel: "/path/to/ggml-base.en.bin",
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(true);
    expect(result.binaryPath).toBe("/usr/bin/whisper-cli");
    expect(result.modelLabel).toBe("ggml-base.en");
    expect(result.modelPath).toBe("/path/to/ggml-base.en.bin");
  });

  it("falls back to whisper-stream when whisper-cli is not found", async () => {
    const io = makeIo({
      whichResolves: [
        { binary: "whisper-cli", path: null },
        { binary: "whisper-stream", path: "/usr/local/bin/whisper-stream" },
      ],
      helpOutput: { "/usr/local/bin/whisper-stream": okHelp },
      modelExists: { "/home/user/.cache/whisper/ggml-base.en.bin": true },
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(true);
    expect(result.binaryPath).toBe("/usr/local/bin/whisper-stream");
    expect(result.modelPath).toBe("/home/user/.cache/whisper/ggml-base.en.bin");
  });

  it("reports unavailable when no binary is found", async () => {
    const io = makeIo({
      whichResolves: [
        { binary: "whisper-cli", path: null },
        { binary: "whisper-stream", path: null },
        { binary: "main", path: null },
      ],
      helpOutput: {},
      modelExists: {},
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/binary/i);
    expect(result.modelPath).toBeNull();
  });

  it("reports unavailable when binary lacks stream-mode support", async () => {
    const io = makeIo({
      whichResolves: [{ binary: "whisper-cli", path: "/usr/bin/whisper-cli" }],
      helpOutput: { "/usr/bin/whisper-cli": noStreamHelp },
      modelExists: {},
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/stream/i);
  });

  it("reports unavailable when no model file is resolvable", async () => {
    const io = makeIo({
      whichResolves: [{ binary: "whisper-cli", path: "/usr/bin/whisper-cli" }],
      helpOutput: { "/usr/bin/whisper-cli": okHelp },
      modelExists: {},
    });
    const result = await probeDictationCapability(io);
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/model/i);
  });
});
