import {
  OnTheGoDeviceId,
  OnTheGoVoiceSessionId,
  type OnTheGoCommandDisposition,
  type OnTheGoCommandId,
  type OnTheGoMode,
  type OnTheGoReadScope,
  type OnTheGoRawAudioId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type {
  OnTheGoAudioFocus,
  OnTheGoAudioOutput,
  OnTheGoAudioPolicy,
  OnTheGoAuthorization,
  OnTheGoCapabilities,
  OnTheGoClock,
  OnTheGoCommandModel,
  OnTheGoConnectivity,
  OnTheGoContextFetch,
  OnTheGoDeviceTrust,
  OnTheGoHandoffBuilder,
  OnTheGoModelPolicy,
  OnTheGoReconciliation,
  OnTheGoPersistence,
  OnTheGoPersistedSnapshot,
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
  readonly respondToReconciliationWith: (disposition: "completed" | "failed" | "unknown") => void;
}

export interface DeterministicOnTheGoAudioFocus extends OnTheGoAudioFocus {
  readonly set: (focus: ReturnType<OnTheGoAudioFocus["current"]>) => void;
}
export interface DeterministicOnTheGoAudioPolicy extends OnTheGoAudioPolicy {
  readonly setPrivacy: (privacy: "private" | "public") => void;
}

export interface DeterministicOnTheGoTheoModel extends OnTheGoTheoModel {
  readonly respondTo: (prompt: string, response: string) => void;
}

export interface DeterministicOnTheGoProviderCheckpoints extends OnTheGoProviderCheckpoints {
  readonly emit: (checkpoint: OnTheGoProviderCheckpoint) => void;
}

export interface DeterministicOnTheGoContextFetch extends OnTheGoContextFetch {
  readonly allow: (source: string, reference: string, excerpt: string, ownerScope: string) => void;
  readonly denyEgress: (source: string, reference: string) => void;
}

export interface DeterministicOnTheGoConnectivity extends OnTheGoConnectivity {
  readonly setOnline: (online: boolean) => void;
}

export interface DeterministicOnTheGoTurnDelivery extends OnTheGoTurnDelivery {
  readonly respondWith: (
    disposition: ReturnType<OnTheGoTurnDelivery["deliver"]>["disposition"],
  ) => void;
  readonly deliveries: () => ReadonlyArray<OnTheGoTurnDeliveryRequest>;
  readonly observedOutboxStatuses: () => ReadonlyArray<string | null>;
  readonly respondToDeletionWith: (disposition: "no-active" | "terminal" | "unknown") => void;
  readonly setSteerable: (steerable: boolean) => void;
  readonly respondToReconciliationWith: (disposition: "completed" | "failed" | "unknown") => void;
}
export interface DeterministicOnTheGoModelPolicy extends OnTheGoModelPolicy {
  readonly respondWith: (
    capability: "transcription" | "reasoning" | "speech",
    result: ReturnType<OnTheGoModelPolicy["select"]>,
  ) => void;
}
export interface DeterministicOnTheGoReconciliation extends OnTheGoReconciliation {
  readonly allow: (promptId: string, revisionId: string) => void;
}

export interface DeterministicOnTheGoHarness {
  readonly audioFocus: DeterministicOnTheGoAudioFocus;
  readonly audioOutput: DeterministicOnTheGoAudioOutput;
  readonly audioPolicy: DeterministicOnTheGoAudioPolicy;
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
  readonly handoffBuilder: OnTheGoHandoffBuilder;
  readonly modelPolicy: DeterministicOnTheGoModelPolicy;
  readonly reconciliation: DeterministicOnTheGoReconciliation;
  readonly runtime: OnTheGoRuntime;
  readonly scope: OnTheGoReadScope;
  readonly restart: () => void;
  readonly restore: (snapshot: OnTheGoPersistedSnapshot) => void;
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
  let outputPrivacy: "private" | "public" = "public";
  let now = DateTime.toEpochMillis(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"));
  const modelResolutions = new Map<string, string>();
  const theoResponses = new Map<string, string>();
  const checkpoints = new Array<OnTheGoProviderCheckpoint>();
  const contextResults = new Map<
    string,
    { readonly excerpt: string; readonly ownerScope: string }
  >();
  const egressDeniedContext = new Set<string>();
  const modelPolicyResults = new Map<
    "transcription" | "reasoning" | "speech",
    ReturnType<OnTheGoModelPolicy["select"]>
  >();
  const reconciledRevisions = new Set<string>();
  const handoffResults = new Map<
    string,
    {
      readonly _tag: "Success";
      readonly worktreeName: string;
      readonly includedReferences: ReadonlyArray<string>;
    }
  >();
  let online = true;
  let turnDisposition: ReturnType<OnTheGoTurnDelivery["deliver"]>["disposition"] = "queued";
  let deletionDisposition: ReturnType<OnTheGoTurnDelivery["interruptForDeletion"]>["disposition"] =
    "no-active";
  let steerable = true;
  let reconciliationDisposition: "completed" | "failed" | "unknown" = "unknown";
  let audioReconciliationDisposition: "completed" | "failed" | "unknown" = "unknown";
  const deliveries = new Array<OnTheGoTurnDeliveryRequest>();
  const deliveryOutboxStatuses = new Array<string | null>();
  const trustedDevices = new Set<OnTheGoDeviceId>();
  let persisted: OnTheGoPersistedSnapshot | null = null;
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
    duck: () => undefined,
    pause: () => {
      speaking = false;
    },
    reconcile: () => ({ disposition: audioReconciliationDisposition }),
    respondToReconciliationWith: (disposition) => {
      audioReconciliationDisposition = disposition;
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
  const audioPolicy: DeterministicOnTheGoAudioPolicy = {
    render: ({ privateDetail, publicSummary }) => {
      const candidate = outputPrivacy === "public" ? publicSummary : privateDetail;
      return /token|password|secret|credential/i.test(candidate)
        ? "Sensitive content omitted."
        : candidate;
    },
    setPrivacy: (privacy) => {
      outputPrivacy = privacy;
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
      if (egressDeniedContext.has(`${source}:${reference}`)) {
        return { _tag: "Denied", reason: "egress" };
      }
      const result = contextResults.get(`${source}:${reference}`);
      return result === undefined
        ? { _tag: "Denied", reason: "authorization" }
        : { _tag: "Success", ...result };
    },
    allow: (source, reference, excerpt, ownerScope) => {
      contextResults.set(`${source}:${reference}`, { excerpt, ownerScope });
    },
    denyEgress: (source, reference) => {
      egressDeniedContext.add(`${source}:${reference}`);
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
      deliveryOutboxStatuses.push(
        persisted?.foundation?.effectOutbox.find(
          (effect) => effect.effectId === request.submissionId,
        )?.status ?? null,
      );
      deliveries.push(request);
      return { disposition: turnDisposition };
    },
    respondWith: (disposition) => {
      turnDisposition = disposition;
    },
    deliveries: () => deliveries,
    observedOutboxStatuses: () => deliveryOutboxStatuses,
    interruptForDeletion: () => ({ disposition: deletionDisposition }),
    respondToDeletionWith: (disposition) => {
      deletionDisposition = disposition;
    },
    canSteer: () => steerable,
    setSteerable: (value) => {
      steerable = value;
    },
    reconcile: () => ({ disposition: reconciliationDisposition }),
    respondToReconciliationWith: (disposition) => {
      reconciliationDisposition = disposition;
    },
  };
  const handoffBuilder: OnTheGoHandoffBuilder = {
    create: (request) => {
      if (request.references.some((reference) => reference.toLowerCase().includes("secret")))
        return { _tag: "Denied" };
      const result = {
        _tag: "Success" as const,
        worktreeName: `dev-${request.agentId}`,
        includedReferences: request.references.filter(
          (reference) => !reference.toLowerCase().includes("unrelated"),
        ),
      };
      handoffResults.set(request.effectId, result);
      return result;
    },
    reconcile: (effectId) => handoffResults.get(effectId) ?? { _tag: "Unknown" },
  };
  const modelPolicy: DeterministicOnTheGoModelPolicy = {
    select: (request) =>
      modelPolicyResults.get(request.capability) ?? {
        _tag: "Selected",
        providerId: request.providerId,
        modelId: request.modelId,
        fallback: false,
      },
    respondWith: (capability, result) => {
      modelPolicyResults.set(capability, result);
    },
  };
  const reconciliation: DeterministicOnTheGoReconciliation = {
    canMarkReady: (promptId, revisionId) => reconciledRevisions.has(`${promptId}:${revisionId}`),
    allow: (promptId, revisionId) => {
      reconciledRevisions.add(`${promptId}:${revisionId}`);
    },
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
    audioPolicy,
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
    handoffBuilder,
    modelPolicy,
    reconciliation,
  };
  let runtime = makeOnTheGoRuntime(ports);

  return {
    audioFocus,
    audioOutput,
    audioPolicy,
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
    handoffBuilder,
    modelPolicy,
    reconciliation,
    scope,
    get runtime() {
      return runtime;
    },
    restart: () => {
      runtime = makeOnTheGoRuntime(ports);
    },
    restore: (snapshot) => {
      persisted = structuredClone(snapshot);
      runtime = makeOnTheGoRuntime(ports);
    },
  };
};
