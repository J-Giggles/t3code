import type {
  OnTheGoCommandDisposition,
  OnTheGoCommandId,
  OnTheGoDeviceId,
  OnTheGoRawAudioId,
  OnTheGoReadScope,
  OnTheGoMode,
  OnTheGoPromptId,
  OnTheGoPromptRevisionId,
  OnTheGoSnapshot,
  OnTheGoSubmissionId,
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
  readonly duck: () => void;
  readonly pause: () => void;
  readonly reconcile: (effectId: string) => {
    readonly disposition: "completed" | "failed" | "unknown";
  };
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
  ) =>
    | { readonly _tag: "Success"; readonly excerpt: string; readonly ownerScope: string }
    | { readonly _tag: "Denied"; readonly reason: "authorization" | "egress" };
}

export interface OnTheGoConnectivity {
  readonly isOnline: () => boolean;
}

export interface OnTheGoTurnDeliveryRequest {
  readonly submissionId: OnTheGoSubmissionId;
  readonly target: string;
  readonly targetAgentId: string;
  readonly intent: "queue" | "steer" | "interrupt-and-replace";
  readonly prompt: string;
  readonly expectedActiveTurnId: string | null;
  readonly source: "voice" | "composer" | "mcp" | "automation" | "legacy";
  readonly handoff?: {
    readonly sourceChatId: string;
    readonly worktreeName: string;
    readonly includedReferences: ReadonlyArray<string>;
  };
}

export interface OnTheGoTurnDelivery {
  readonly deliver: (request: OnTheGoTurnDeliveryRequest) => {
    readonly disposition: "queued" | "steered" | "interrupted" | "rejected" | "unknown";
  };
  readonly interruptForDeletion: (request: {
    readonly scope: string;
    readonly expectedActiveTurnId: string | null;
  }) => {
    readonly disposition: "no-active" | "terminal" | "unknown";
  };
  readonly canSteer: (activeTurnId: string) => boolean;
  readonly reconcile: (effectId: string) => {
    readonly disposition: "completed" | "failed" | "unknown";
  };
}

export interface OnTheGoHandoffBuilder {
  readonly create: (request: {
    readonly effectId: string;
    readonly agentId: string;
    readonly prompt: string;
    readonly targetChatId: string;
    readonly references: ReadonlyArray<string>;
    readonly sharedWritable: boolean;
  }) =>
    | {
        readonly _tag: "Success";
        readonly worktreeName: string;
        readonly includedReferences: ReadonlyArray<string>;
      }
    | { readonly _tag: "Denied" };
  readonly reconcile: (effectId: string) =>
    | {
        readonly _tag: "Success";
        readonly worktreeName: string;
        readonly includedReferences: ReadonlyArray<string>;
      }
    | { readonly _tag: "Failed" }
    | { readonly _tag: "Unknown" };
}

export interface OnTheGoModelPolicy {
  readonly select: (request: {
    readonly capability: "transcription" | "reasoning" | "speech";
    readonly providerId: string;
    readonly modelId: string;
  }) =>
    | {
        readonly _tag: "Selected";
        readonly providerId: string;
        readonly modelId: string;
        readonly fallback: boolean;
      }
    | { readonly _tag: "Denied"; readonly reason: "budget-exhausted" | "fallback-not-approved" };
}

export interface OnTheGoAudioPolicy {
  readonly render: (input: {
    readonly privateDetail: string;
    readonly publicSummary: string;
  }) => string;
}
export interface OnTheGoReconciliation {
  readonly canMarkReady: (
    promptId: OnTheGoPromptId,
    revisionId: OnTheGoPromptRevisionId,
  ) => boolean;
}

export interface OnTheGoDeviceTrust {
  readonly isTrusted: (deviceId: OnTheGoDeviceId) => boolean;
}

export type OnTheGoPersistedSnapshot = Omit<OnTheGoSnapshot, "foundation" | "eventLog"> &
  Partial<Pick<OnTheGoSnapshot, "foundation" | "eventLog">>;

export interface OnTheGoPersistence {
  readonly load: () => OnTheGoPersistedSnapshot | null;
  readonly save: (snapshot: OnTheGoSnapshot) => void;
  readonly loadDisposition: (commandId: OnTheGoCommandId) => OnTheGoCommandDisposition | null;
  readonly saveDisposition: (
    commandId: OnTheGoCommandId,
    disposition: OnTheGoCommandDisposition,
  ) => void;
  readonly loadDeviceBinding?: (deviceId: OnTheGoDeviceId) => string | null;
  readonly saveDeviceBinding?: (deviceId: OnTheGoDeviceId, authenticatedSessionId: string) => void;
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
  readonly handoffBuilder: OnTheGoHandoffBuilder;
  readonly modelPolicy: OnTheGoModelPolicy;
  readonly audioPolicy: OnTheGoAudioPolicy;
  readonly reconciliation: OnTheGoReconciliation;
}
