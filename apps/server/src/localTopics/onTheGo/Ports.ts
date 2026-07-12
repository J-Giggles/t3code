import type {
  OnTheGoCommandDisposition,
  OnTheGoCommandId,
  OnTheGoDeviceId,
  OnTheGoRawAudioId,
  OnTheGoReadScope,
  OnTheGoMode,
  OnTheGoSnapshot,
} from "@t3tools/contracts";

export interface OnTheGoAuthorization {
  readonly canRead: (scope: OnTheGoReadScope) => boolean;
}

export interface OnTheGoCapabilities {
  readonly isModeAvailable: (mode: OnTheGoMode) => boolean;
}

export interface OnTheGoClock {
  readonly now: () => string;
}

export interface OnTheGoCommandModel {
  readonly resolve: (
    phrase: string,
  ) => { readonly _tag: "Candidate"; readonly action: string } | { readonly _tag: "NoMatch" };
}

export interface OnTheGoAudioOutput {
  readonly speak: (text: string) => void;
  readonly stop: () => void;
}

export interface OnTheGoAudioFocus {
  readonly current: () => "available" | "call" | "media" | "navigation" | "alarm";
}

export interface OnTheGoTheoModel {
  readonly generate: (
    prompt: string,
  ) => { readonly _tag: "Success"; readonly text: string } | { readonly _tag: "Failure" };
}

export interface OnTheGoProviderCheckpoint {
  readonly kind: string;
  readonly sourceId: string;
  readonly summary: string;
}

export interface OnTheGoProviderCheckpoints {
  readonly read: () => ReadonlyArray<OnTheGoProviderCheckpoint>;
}

export interface OnTheGoContextFetch {
  readonly fetch: (
    source: string,
    reference: string,
  ) => { readonly _tag: "Success"; readonly excerpt: string } | { readonly _tag: "Denied" };
}

export interface OnTheGoConnectivity {
  readonly isOnline: () => boolean;
}

export interface OnTheGoTurnDeliveryRequest {
  readonly target: string;
  readonly intent: "queue" | "steer" | "interrupt-and-replace";
  readonly prompt: string;
}

export interface OnTheGoTurnDelivery {
  readonly deliver: (request: OnTheGoTurnDeliveryRequest) => {
    readonly disposition: "queued" | "steered" | "interrupted" | "rejected";
  };
}

export interface OnTheGoDeviceTrust {
  readonly isTrusted: (deviceId: OnTheGoDeviceId) => boolean;
}

export interface OnTheGoPersistence {
  readonly load: () => OnTheGoSnapshot | null;
  readonly save: (snapshot: OnTheGoSnapshot) => void;
  readonly loadDisposition: (commandId: OnTheGoCommandId) => OnTheGoCommandDisposition | null;
  readonly saveDisposition: (
    commandId: OnTheGoCommandId,
    disposition: OnTheGoCommandDisposition,
  ) => void;
}

export interface OnTheGoWakeDetection {
  readonly resolve: (phrase: string) => "command" | "theo-conversation" | null;
}

export interface OnTheGoRawAudio {
  readonly discard: (rawAudioId: OnTheGoRawAudioId) => void;
}

export interface OnTheGoTranscription {
  readonly transcribe: (
    rawAudioId: OnTheGoRawAudioId,
  ) => { readonly _tag: "Success"; readonly text: string } | { readonly _tag: "Failure" };
}

export interface OnTheGoRuntimePorts {
  readonly audioFocus: OnTheGoAudioFocus;
  readonly audioOutput: OnTheGoAudioOutput;
  readonly authorization: OnTheGoAuthorization;
  readonly capabilities: OnTheGoCapabilities;
  readonly clock: OnTheGoClock;
  readonly commandModel: OnTheGoCommandModel;
  readonly connectivity: OnTheGoConnectivity;
  readonly contextFetch: OnTheGoContextFetch;
  readonly deviceTrust: OnTheGoDeviceTrust;
  readonly persistence: OnTheGoPersistence;
  readonly providerCheckpoints: OnTheGoProviderCheckpoints;
  readonly wakeDetection: OnTheGoWakeDetection;
  readonly rawAudio: OnTheGoRawAudio;
  readonly theoModel: OnTheGoTheoModel;
  readonly transcription: OnTheGoTranscription;
  readonly turnDelivery: OnTheGoTurnDelivery;
}
