import {
  OnTheGoDeviceId,
  OnTheGoVoiceSessionId,
  type OnTheGoCommandDisposition,
  type OnTheGoCommandId,
  type OnTheGoMode,
  type OnTheGoReadScope,
  type OnTheGoRawAudioId,
  type OnTheGoSnapshot,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type {
  OnTheGoAudioFocus,
  OnTheGoAudioOutput,
  OnTheGoAuthorization,
  OnTheGoCapabilities,
  OnTheGoClock,
  OnTheGoCommandModel,
  OnTheGoConnectivity,
  OnTheGoContextFetch,
  OnTheGoDeviceTrust,
  OnTheGoPersistence,
  OnTheGoProviderCheckpoint,
  OnTheGoProviderCheckpoints,
  OnTheGoRawAudio,
  OnTheGoTheoModel,
  OnTheGoTranscription,
  OnTheGoTurnDelivery,
  OnTheGoTurnDeliveryRequest,
  OnTheGoWakeDetection,
} from "./Ports.ts";
import { makeOnTheGoRuntime, type OnTheGoRuntime } from "./Runtime.ts";

export interface DeterministicOnTheGoDeviceTrust extends OnTheGoDeviceTrust {
  readonly trust: (deviceId: OnTheGoDeviceId) => void;
}

export interface DeterministicOnTheGoAuthorization extends OnTheGoAuthorization {
  readonly allow: (scope: OnTheGoReadScope) => void;
  readonly deny: (scope: OnTheGoReadScope) => void;
}

export interface DeterministicOnTheGoCapabilities extends OnTheGoCapabilities {
  readonly setModeAvailable: (mode: OnTheGoMode, available: boolean) => void;
}

export interface DeterministicOnTheGoWakeDetection extends OnTheGoWakeDetection {
  readonly calibrate: (
    phrase: string,
    target: "command" | "theo-conversation",
    passed: boolean,
  ) => void;
}

export interface DeterministicOnTheGoRawAudio extends OnTheGoRawAudio {
  readonly add: (rawAudioId: OnTheGoRawAudioId) => void;
  readonly has: (rawAudioId: OnTheGoRawAudioId) => boolean;
}

export interface DeterministicOnTheGoTranscription extends OnTheGoTranscription {
  readonly succeed: (rawAudioId: OnTheGoRawAudioId, text: string) => void;
  readonly fail: (rawAudioId: OnTheGoRawAudioId) => void;
}

export interface DeterministicOnTheGoClock extends OnTheGoClock {
  readonly advanceBy: (milliseconds: number) => void;
}

export interface DeterministicOnTheGoCommandModel extends OnTheGoCommandModel {
  readonly resolveAs: (phrase: string, action: string) => void;
}

export interface DeterministicOnTheGoAudioOutput extends OnTheGoAudioOutput {
  readonly spoken: () => ReadonlyArray<string>;
  readonly isSpeaking: () => boolean;
}

export interface DeterministicOnTheGoAudioFocus extends OnTheGoAudioFocus {
  readonly set: (focus: ReturnType<OnTheGoAudioFocus["current"]>) => void;
}

export interface DeterministicOnTheGoTheoModel extends OnTheGoTheoModel {
  readonly respondTo: (prompt: string, response: string) => void;
}

export interface DeterministicOnTheGoProviderCheckpoints extends OnTheGoProviderCheckpoints {
  readonly emit: (checkpoint: OnTheGoProviderCheckpoint) => void;
}

export interface DeterministicOnTheGoContextFetch extends OnTheGoContextFetch {
  readonly allow: (source: string, reference: string, excerpt: string) => void;
}

export interface DeterministicOnTheGoConnectivity extends OnTheGoConnectivity {
  readonly setOnline: (online: boolean) => void;
}

export interface DeterministicOnTheGoTurnDelivery extends OnTheGoTurnDelivery {
  readonly respondWith: (
    disposition: ReturnType<OnTheGoTurnDelivery["deliver"]>["disposition"],
  ) => void;
  readonly deliveries: () => ReadonlyArray<OnTheGoTurnDeliveryRequest>;
}

export interface DeterministicOnTheGoHarness {
  readonly audioFocus: DeterministicOnTheGoAudioFocus;
  readonly audioOutput: DeterministicOnTheGoAudioOutput;
  readonly authorization: DeterministicOnTheGoAuthorization;
  readonly capabilities: DeterministicOnTheGoCapabilities;
  readonly clock: DeterministicOnTheGoClock;
  readonly commandModel: DeterministicOnTheGoCommandModel;
  readonly connectivity: DeterministicOnTheGoConnectivity;
  readonly contextFetch: DeterministicOnTheGoContextFetch;
  readonly deviceTrust: DeterministicOnTheGoDeviceTrust;
  readonly persistence: OnTheGoPersistence;
  readonly providerCheckpoints: DeterministicOnTheGoProviderCheckpoints;
  readonly wakeDetection: DeterministicOnTheGoWakeDetection;
  readonly rawAudio: DeterministicOnTheGoRawAudio;
  readonly transcription: DeterministicOnTheGoTranscription;
  readonly theoModel: DeterministicOnTheGoTheoModel;
  readonly turnDelivery: DeterministicOnTheGoTurnDelivery;
  readonly runtime: OnTheGoRuntime;
  readonly scope: OnTheGoReadScope;
  readonly restart: () => void;
}

export const makeDeterministicOnTheGoHarness = (): DeterministicOnTheGoHarness => {
  const scope: OnTheGoReadScope = {
    voiceSessionId: OnTheGoVoiceSessionId.make("test-session"),
    deviceId: OnTheGoDeviceId.make("test-viewer"),
  };
  const scopeKey = (value: OnTheGoReadScope) => `${value.voiceSessionId}:${value.deviceId}`;
  const authorizedScopes = new Set([scopeKey(scope)]);
  const unavailableModes = new Set<OnTheGoMode>();
  const spoken = new Array<string>();
  let speaking = false;
  let audioFocusState: ReturnType<OnTheGoAudioFocus["current"]> = "available";
  let now = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"));
  const modelResolutions = new Map<string, string>();
  const theoResponses = new Map<string, string>();
  const checkpoints = new Array<OnTheGoProviderCheckpoint>();
  const contextResults = new Map<string, string>();
  let online = true;
  let turnDisposition: ReturnType<OnTheGoTurnDelivery["deliver"]>["disposition"] = "queued";
  const deliveries = new Array<OnTheGoTurnDeliveryRequest>();
  const trustedDevices = new Set<OnTheGoDeviceId>();
  let persisted: OnTheGoSnapshot | null = null;
  const dispositions = new Map<OnTheGoCommandId, OnTheGoCommandDisposition>();
  const wakePhrases = new Map<string, "command" | "theo-conversation">([
    ["t3", "command"],
    ["hey theo", "theo-conversation"],
  ]);
  const rawAudioIds = new Set<OnTheGoRawAudioId>();
  const transcriptions = new Map<
    OnTheGoRawAudioId,
    { readonly _tag: "Success"; readonly text: string } | { readonly _tag: "Failure" }
  >();

  const deviceTrust: DeterministicOnTheGoDeviceTrust = {
    isTrusted: (deviceId) => trustedDevices.has(deviceId),
    trust: (deviceId) => trustedDevices.add(deviceId),
  };
  const audioOutput: DeterministicOnTheGoAudioOutput = {
    speak: (text) => {
      spoken.push(text);
      speaking = true;
    },
    stop: () => {
      speaking = false;
    },
    spoken: () => spoken,
    isSpeaking: () => speaking,
  };
  const audioFocus: DeterministicOnTheGoAudioFocus = {
    current: () => audioFocusState,
    set: (focus) => {
      audioFocusState = focus;
    },
  };
  const authorization: DeterministicOnTheGoAuthorization = {
    canRead: (value) => authorizedScopes.has(scopeKey(value)),
    allow: (value) => authorizedScopes.add(scopeKey(value)),
    deny: (value) => {
      authorizedScopes.delete(scopeKey(value));
    },
  };
  const capabilities: DeterministicOnTheGoCapabilities = {
    isModeAvailable: (mode) => !unavailableModes.has(mode),
    setModeAvailable: (mode, available) => {
      if (available) unavailableModes.delete(mode);
      else unavailableModes.add(mode);
    },
  };
  const clock: DeterministicOnTheGoClock = {
    now: () => DateTime.formatIso(DateTime.makeUnsafe(now)),
    advanceBy: (milliseconds) => {
      now += milliseconds;
    },
  };
  const commandModel: DeterministicOnTheGoCommandModel = {
    resolve: (phrase) => {
      const action = modelResolutions.get(phrase.trim().toLocaleLowerCase());
      return action === undefined ? { _tag: "NoMatch" } : { _tag: "Candidate", action };
    },
    resolveAs: (phrase, action) => {
      modelResolutions.set(phrase.trim().toLocaleLowerCase(), action);
    },
  };
  const theoModel: DeterministicOnTheGoTheoModel = {
    generate: (prompt) => {
      const text = theoResponses.get(prompt);
      return text === undefined ? { _tag: "Failure" } : { _tag: "Success", text };
    },
    respondTo: (prompt, response) => {
      theoResponses.set(prompt, response);
    },
  };
  const providerCheckpoints: DeterministicOnTheGoProviderCheckpoints = {
    read: () => checkpoints,
    emit: (checkpoint) => {
      checkpoints.push(checkpoint);
    },
  };
  const contextFetch: DeterministicOnTheGoContextFetch = {
    fetch: (source, reference) => {
      const excerpt = contextResults.get(`${source}:${reference}`);
      return excerpt === undefined ? { _tag: "Denied" } : { _tag: "Success", excerpt };
    },
    allow: (source, reference, excerpt) => {
      contextResults.set(`${source}:${reference}`, excerpt);
    },
  };
  const connectivity: DeterministicOnTheGoConnectivity = {
    isOnline: () => online,
    setOnline: (value) => {
      online = value;
    },
  };
  const turnDelivery: DeterministicOnTheGoTurnDelivery = {
    deliver: (request) => {
      deliveries.push(request);
      return { disposition: turnDisposition };
    },
    respondWith: (disposition) => {
      turnDisposition = disposition;
    },
    deliveries: () => deliveries,
  };
  const persistence: OnTheGoPersistence = {
    load: () => persisted,
    save: (snapshot) => {
      persisted = structuredClone(snapshot);
    },
    loadDisposition: (commandId) => dispositions.get(commandId) ?? null,
    saveDisposition: (commandId, disposition) => {
      dispositions.set(commandId, structuredClone(disposition));
    },
  };
  const wakeDetection: DeterministicOnTheGoWakeDetection = {
    resolve: (phrase) => wakePhrases.get(phrase.trim().toLocaleLowerCase()) ?? null,
    calibrate: (phrase, target, passed) => {
      if (passed) wakePhrases.set(phrase.trim().toLocaleLowerCase(), target);
    },
  };
  const rawAudio: DeterministicOnTheGoRawAudio = {
    add: (rawAudioId) => rawAudioIds.add(rawAudioId),
    has: (rawAudioId) => rawAudioIds.has(rawAudioId),
    discard: (rawAudioId) => {
      rawAudioIds.delete(rawAudioId);
    },
  };
  const transcription: DeterministicOnTheGoTranscription = {
    transcribe: (rawAudioId) => transcriptions.get(rawAudioId) ?? { _tag: "Failure" },
    succeed: (rawAudioId, text) => {
      transcriptions.set(rawAudioId, { _tag: "Success", text });
    },
    fail: (rawAudioId) => {
      transcriptions.set(rawAudioId, { _tag: "Failure" });
    },
  };
  const ports = {
    audioFocus,
    audioOutput,
    authorization,
    capabilities,
    clock,
    commandModel,
    connectivity,
    contextFetch,
    deviceTrust,
    persistence,
    providerCheckpoints,
    wakeDetection,
    rawAudio,
    theoModel,
    transcription,
    turnDelivery,
  };
  let runtime = makeOnTheGoRuntime(ports);

  return {
    audioFocus,
    audioOutput,
    authorization,
    capabilities,
    clock,
    commandModel,
    connectivity,
    contextFetch,
    deviceTrust,
    persistence,
    providerCheckpoints,
    wakeDetection,
    rawAudio,
    transcription,
    theoModel,
    turnDelivery,
    scope,
    get runtime() {
      return runtime;
    },
    restart: () => {
      runtime = makeOnTheGoRuntime(ports);
    },
  };
};
