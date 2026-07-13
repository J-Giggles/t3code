import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ProviderInstanceId } from "./providerInstance.ts";
import {
  ClientSettingsSchema,
  DEFAULT_SERVER_SETTINGS,
  PromptOverride,
  ServerSettings,
  ServerSettingsPatch,
} from "./settings.ts";

const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const decodeServerSettings = Schema.decodeUnknownSync(ServerSettings);
const decodeServerSettingsPatch = Schema.decodeUnknownSync(ServerSettingsPatch);
const encodeServerSettings = Schema.encodeSync(ServerSettings);
const decodePromptOverride = Schema.decodeUnknownSync(PromptOverride);

describe("ClientSettings word wrap", () => {
  it("defaults word wrap on", () => {
    expect(decodeClientSettings({}).wordWrap).toBe(true);
  });

  it("ignores obsolete wrapping preferences", () => {
    const decoded = decodeClientSettings({
      chatWordWrap: false,
      diffWordWrap: false,
    });

    expect(decoded.wordWrap).toBe(true);
    expect(decoded).not.toHaveProperty("chatWordWrap");
    expect(decoded).not.toHaveProperty("diffWordWrap");
  });
});

describe("ServerSettings.providerInstances (slice-2 invariant)", () => {
  it("OTG-UT-019 persists independent safe voice capability defaults", () => {
    const settings = decodeServerSettings({});
    expect(settings.onTheGo.enabled).toBe(false);
    expect(settings.onTheGo.bargeInEnabled).toBe(true);
    expect(settings.onTheGo.transcriptionModel.capability).toBe("transcription");
    expect(settings.onTheGo.theoModel.capability).toBe("reasoning");
    expect(settings.onTheGo.speechModel.capability).toBe("speech");
  });

  it("OTG-UT-019 rejects a model selected for the wrong capability", () => {
    expect(() =>
      decodeServerSettings({
        onTheGo: {
          ...DEFAULT_SERVER_SETTINGS.onTheGo,
          transcriptionModel: {
            providerId: "system",
            modelId: "voice",
            capability: "speech",
          },
        },
      }),
    ).toThrow();
  });

  it("enables live assistant output by default", () => {
    expect(DEFAULT_SERVER_SETTINGS.enableAssistantStreaming).toBe(true);
    expect(decodeServerSettings({}).enableAssistantStreaming).toBe(true);
  });

  it("defaults to an empty record so legacy configs without the key still decode", () => {
    expect(DEFAULT_SERVER_SETTINGS.providerInstances).toEqual({});
  });

  it("defaults prompt overrides to an empty record", () => {
    expect(DEFAULT_SERVER_SETTINGS.promptOverrides).toEqual({});
    expect(decodeServerSettings({}).promptOverrides).toEqual({});
  });

  it("defaults T3 provider access MCPs to disabled", () => {
    expect(DEFAULT_SERVER_SETTINGS.t3ProviderAccess.mcps["jira-local"]).toEqual({
      enabled: false,
    });
    expect(decodeServerSettings({}).t3ProviderAccess.mcps["jira-local"]).toEqual({
      enabled: false,
    });
  });

  it("decodes a fully empty config (legacy on-disk shape) without complaint", () => {
    const decoded = decodeServerSettings({});
    expect(decoded.providerInstances).toEqual({});
    // Legacy `providers` struct is still hydrated with its per-driver defaults
    // so existing call sites keep working through the migration.
    expect(decoded.providers.codex.enabled).toBe(true);
  });

  it("decodes a multi-instance map mixing first-party and fork drivers", () => {
    const decoded = decodeServerSettings({
      providerInstances: {
        codex_personal: {
          driver: "codex",
          displayName: "Codex (personal)",
          config: { homePath: "~/.codex_personal" },
        },
        codex_work: {
          driver: "codex",
          config: { homePath: "~/.codex_work" },
        },
        ollama_local: {
          driver: "ollama",
          displayName: "Ollama (local)",
          config: { endpoint: "http://localhost:11434" },
        },
      },
    });
    const personalId = ProviderInstanceId.make("codex_personal");
    const workId = ProviderInstanceId.make("codex_work");
    const ollamaId = ProviderInstanceId.make("ollama_local");

    expect(decoded.providerInstances[personalId]?.driver).toBe("codex");
    expect(decoded.providerInstances[workId]?.config).toEqual({ homePath: "~/.codex_work" });
    // Critical: a config naming a driver this build does not know about
    // (`ollama` is not in `ProviderDriverKind`) must round-trip without loss.
    // The runtime handles "driver not installed" — the schema must not.
    expect(decoded.providerInstances[ollamaId]?.driver).toBe("ollama");
    expect(decoded.providerInstances[ollamaId]?.config).toEqual({
      endpoint: "http://localhost:11434",
    });
  });

  it("rejects instance keys that violate the slug pattern", () => {
    expect(() =>
      decodeServerSettings({
        providerInstances: { "1bad": { driver: "codex" } },
      }),
    ).toThrow();
  });
});

describe("ServerSettings.promptOverrides", () => {
  it("preserves prompt override whitespace exactly", () => {
    const override = decodePromptOverride({
      content: "  line one\n\nline two  ",
      defaultHash: "fnv1a32:abc12345",
    });

    expect(override.content).toBe("  line one\n\nline two  ");
    expect(override.defaultHash).toBe("fnv1a32:abc12345");
  });

  it("decodes prompt override maps from persisted settings", () => {
    const decoded = decodeServerSettings({
      promptOverrides: {
        "composer.fixBug": {
          content: "Custom fix prompt: ",
          defaultHash: "fnv1a32:abc12345",
        },
      },
    });

    expect(decoded.promptOverrides["composer.fixBug"]?.content).toBe("Custom fix prompt: ");
  });
});

describe("ServerSettingsPatch.providerInstances", () => {
  it("OTG-UT-019 patches voice capabilities independently without accepting capability changes", () => {
    const patch = decodeServerSettingsPatch({
      onTheGo: {
        bargeInEnabled: false,
        transcriptionModel: { providerId: "openai", modelId: "gpt-4o-transcribe" },
        theoModel: { providerId: "codex", modelId: "gpt-5" },
        speechModel: { providerId: "openai", modelId: "gpt-4o-mini-tts" },
      },
    });
    expect(patch.onTheGo?.bargeInEnabled).toBe(false);
    expect(patch.onTheGo?.transcriptionModel?.modelId).toBe("gpt-4o-transcribe");
    expect(patch.onTheGo?.theoModel?.modelId).toBe("gpt-5");
    expect(patch.onTheGo?.speechModel?.modelId).toBe("gpt-4o-mini-tts");
    expect(patch.onTheGo?.speechModel).not.toHaveProperty("capability");
  });

  it("treats providerInstances as an optional whole-map replacement", () => {
    const patch = decodeServerSettingsPatch({});
    expect(patch.providerInstances).toBeUndefined();

    const replacement = decodeServerSettingsPatch({
      providerInstances: {
        codex_personal: { driver: "codex", config: { homePath: "~/.codex" } },
      },
    });
    expect(replacement.providerInstances).toBeDefined();
    expect(replacement.providerInstances?.[ProviderInstanceId.make("codex_personal")]?.driver).toBe(
      "codex",
    );
  });

  it("preserves a fork-defined driver entry through patch decoding", () => {
    const patch = decodeServerSettingsPatch({
      providerInstances: {
        ollama_local: {
          driver: "ollama",
          config: { endpoint: "http://localhost:11434" },
        },
      },
    });
    const ollamaId = ProviderInstanceId.make("ollama_local");
    expect(patch.providerInstances?.[ollamaId]?.driver).toBe("ollama");
  });

  it("decodes promptOverrides as an optional whole-map replacement", () => {
    const patch = decodeServerSettingsPatch({
      promptOverrides: {
        "composer.review": {
          content: "Review this patch.",
          defaultHash: "fnv1a32:12345678",
        },
      },
    });

    expect(patch.promptOverrides?.["composer.review"]?.content).toBe("Review this patch.");
  });
});

describe("ServerSettingsPatch string normalization", () => {
  it("trims string settings while decoding patches", () => {
    const patch = decodeServerSettingsPatch({
      addProjectBaseDirectory: "  ~/Development  ",
      textGenerationModelSelection: { model: "  gpt-5.4-mini  " },
      observability: {
        otlpTracesUrl: "  http://localhost:4318/v1/traces  ",
        otlpLogsUrl: "  http://localhost:4318/v1/logs  ",
      },
      providers: {
        codex: {
          binaryPath: "  /opt/homebrew/bin/codex  ",
          homePath: "  ~/.codex  ",
        },
      },
      providerInstances: {
        codex_personal: {
          driver: "  codex  ",
          displayName: "  Codex Personal  ",
          config: { homePath: "  ~/.codex-personal  " },
        },
      },
    });

    expect(patch.addProjectBaseDirectory).toBe("~/Development");
    expect(patch.textGenerationModelSelection?.model).toBe("gpt-5.4-mini");
    expect(patch.observability?.otlpTracesUrl).toBe("http://localhost:4318/v1/traces");
    expect(patch.observability?.otlpLogsUrl).toBe("http://localhost:4318/v1/logs");
    expect(patch.providers?.codex?.binaryPath).toBe("/opt/homebrew/bin/codex");
    expect(patch.providers?.codex?.homePath).toBe("~/.codex");
    expect(patch.providerInstances?.[ProviderInstanceId.make("codex_personal")]?.driver).toBe(
      "codex",
    );
    expect(patch.providerInstances?.[ProviderInstanceId.make("codex_personal")]?.displayName).toBe(
      "Codex Personal",
    );
    expect(patch.providerInstances?.[ProviderInstanceId.make("codex_personal")]?.config).toEqual({
      homePath: "  ~/.codex-personal  ",
    });
  });

  it("trims encoded server settings values before validation", () => {
    const defaultSettings = decodeServerSettings({});
    const encoded = encodeServerSettings({
      ...defaultSettings,
      addProjectBaseDirectory: "  ~/Development  ",
      providers: {
        ...defaultSettings.providers,
        codex: {
          ...defaultSettings.providers.codex,
          binaryPath: "  /opt/homebrew/bin/codex  ",
        },
      },
    });

    expect(encoded.addProjectBaseDirectory).toBe("~/Development");
    expect(encoded.providers?.codex?.binaryPath).toBe("/opt/homebrew/bin/codex");
  });
});
