import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_ON_THE_GO_RETENTION,
  DEFAULT_ON_THE_GO_SETTINGS,
  OnTheGoCommand,
  OnTheGoError,
  OnTheGoIdentity,
  OnTheGoRetentionPolicy,
  OnTheGoSettings,
} from "./index.ts";
import { WS_METHODS } from "../../rpc.ts";

const decodes = <S extends Schema.Top>(schema: S, input: unknown): boolean => {
  try {
    Schema.decodeUnknownSync(schema as never)(input);
    return true;
  } catch {
    return false;
  }
};

describe("On-the-Go contracts", () => {
  it("OTG-UT-023: exposes one stable RPC seam for dispatch, snapshots, and ordered events", () => {
    expect({
      dispatch: WS_METHODS.onTheGoDispatch,
      snapshot: WS_METHODS.onTheGoSnapshot,
      events: WS_METHODS.subscribeOnTheGoEvents,
      transcribe: WS_METHODS.onTheGoTranscribe,
    }).toEqual({
      dispatch: "onTheGo.dispatch",
      snapshot: "onTheGo.snapshot",
      events: "subscribeOnTheGoEvents",
      transcribe: "onTheGo.transcribe",
    });
  });
  it("decodes the schema-only command union and rejects unknown commands", () => {
    expect(
      decodes(OnTheGoCommand, {
        type: "mode.set",
        commandId: "command-1",
        mode: "sleep",
        source: "visual",
      }),
    ).toBe(true);
    expect(decodes(OnTheGoCommand, { type: "model.click", commandId: "command-2" })).toBe(false);
  });

  it("keeps provider roles explicit in settings", () => {
    expect(decodes(OnTheGoSettings, DEFAULT_ON_THE_GO_SETTINGS)).toBe(true);
    expect(
      decodes(OnTheGoSettings, {
        ...DEFAULT_ON_THE_GO_SETTINGS,
        transcriptionModel: {
          providerId: "openai",
          modelId: "gpt",
          capability: "reasoning",
        },
      }),
    ).toBe(false);
  });

  it("codifies privacy-sensitive retention limits", () => {
    expect(decodes(OnTheGoRetentionPolicy, DEFAULT_ON_THE_GO_RETENTION)).toBe(true);
    expect(DEFAULT_ON_THE_GO_RETENTION).toEqual({
      rawAudio: "discard-after-attempt",
      responseActiveDays: 30,
      attentionExpires: false,
      speechCacheMaxHours: 24,
      lifecycleTombstoneDays: 90,
    });
  });

  it("provides shared identity and error envelopes", () => {
    expect(
      decodes(OnTheGoIdentity, {
        voiceSessionId: "session-1",
        deviceId: "phone",
      }),
    ).toBe(true);
    expect(
      decodes(OnTheGoError, {
        code: "policy-denied",
        message: "The requested action is not available.",
        retryable: false,
      }),
    ).toBe(true);
  });
});
