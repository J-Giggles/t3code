import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  TrimmedNonEmptyString,
} from "../../baseSchemas.ts";

export const OnTheGoCommandId = TrimmedNonEmptyString.pipe(Schema.brand("OnTheGoCommandId"));
export type OnTheGoCommandId = typeof OnTheGoCommandId.Type;

export const OnTheGoDeviceId = TrimmedNonEmptyString.pipe(Schema.brand("OnTheGoDeviceId"));
export type OnTheGoDeviceId = typeof OnTheGoDeviceId.Type;

export const OnTheGoRawAudioId = TrimmedNonEmptyString.pipe(Schema.brand("OnTheGoRawAudioId"));
export type OnTheGoRawAudioId = typeof OnTheGoRawAudioId.Type;

export const OnTheGoConfirmationId = TrimmedNonEmptyString.pipe(
  Schema.brand("OnTheGoConfirmationId"),
);
export type OnTheGoConfirmationId = typeof OnTheGoConfirmationId.Type;

export const OnTheGoVoiceSessionId = TrimmedNonEmptyString.pipe(
  Schema.brand("OnTheGoVoiceSessionId"),
);
export type OnTheGoVoiceSessionId = typeof OnTheGoVoiceSessionId.Type;

export const OnTheGoMode = Schema.Literals([
  "off",
  "sleep",
  "command",
  "theo-conversation",
  "dictation",
  "degraded",
]);
export type OnTheGoMode = typeof OnTheGoMode.Type;

export const OnTheGoInputSource = Schema.Literals(["voice", "visual", "keyboard", "touch"]);
export type OnTheGoInputSource = typeof OnTheGoInputSource.Type;

export const ON_THE_GO_ACTION_IDS = [
  "speech.stop",
  "interaction.cancel",
  "confirmation.confirm",
  "prompt.send",
  "agent.steer",
  "follow.start",
  "mode.sleep",
  "agent.interrupt-and-replace",
] as const;
export const OnTheGoActionId = Schema.Literals(ON_THE_GO_ACTION_IDS);
export type OnTheGoActionId = typeof OnTheGoActionId.Type;

export const OnTheGoModeSetCommand = Schema.Struct({
  type: Schema.Literal("mode.set"),
  commandId: OnTheGoCommandId,
  mode: OnTheGoMode,
  source: OnTheGoInputSource,
});

export const OnTheGoOwnerAcquireCommand = Schema.Struct({
  type: Schema.Literal("owner.acquire"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
});

export const OnTheGoOwnerHandoffCommand = Schema.Struct({
  type: Schema.Literal("owner.handoff"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
  nextDeviceId: OnTheGoDeviceId,
});

export const OnTheGoOwnerContinueCommand = Schema.Struct({
  type: Schema.Literal("owner.continue"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
});

export const OnTheGoWakeDetectedCommand = Schema.Struct({
  type: Schema.Literal("wake.detected"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
  phrase: TrimmedNonEmptyString,
});

export const OnTheGoBargeInSetCommand = Schema.Struct({
  type: Schema.Literal("barge-in.set"),
  commandId: OnTheGoCommandId,
  enabled: Schema.Boolean,
});

export const OnTheGoSpeechInterruptCommand = Schema.Struct({
  type: Schema.Literal("speech.interrupt"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
  phrase: TrimmedNonEmptyString,
});

export const OnTheGoDictationCaptureCommand = Schema.Struct({
  type: Schema.Literal("dictation.capture"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
  rawAudioId: OnTheGoRawAudioId,
});

export const OnTheGoVocabularyAliasSetCommand = Schema.Struct({
  type: Schema.Literal("vocabulary.alias.set"),
  commandId: OnTheGoCommandId,
  phrase: TrimmedNonEmptyString,
  action: OnTheGoActionId,
});

export const OnTheGoActionResolveCommand = Schema.Struct({
  type: Schema.Literal("action.resolve"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
  phrase: TrimmedNonEmptyString,
  source: OnTheGoInputSource,
});

export const OnTheGoConfirmationRequestCommand = Schema.Struct({
  type: Schema.Literal("confirmation.request"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
  action: OnTheGoActionId,
  target: TrimmedNonEmptyString,
  source: OnTheGoInputSource,
});

export const OnTheGoConfirmationRespondCommand = Schema.Struct({
  type: Schema.Literal("confirmation.respond"),
  commandId: OnTheGoCommandId,
  deviceId: OnTheGoDeviceId,
  confirmationId: OnTheGoConfirmationId,
  phrase: TrimmedNonEmptyString,
  target: TrimmedNonEmptyString,
  source: OnTheGoInputSource,
});

export const OnTheGoCommand = Schema.Union([
  OnTheGoModeSetCommand,
  OnTheGoOwnerAcquireCommand,
  OnTheGoOwnerHandoffCommand,
  OnTheGoOwnerContinueCommand,
  OnTheGoWakeDetectedCommand,
  OnTheGoBargeInSetCommand,
  OnTheGoSpeechInterruptCommand,
  OnTheGoDictationCaptureCommand,
  OnTheGoVocabularyAliasSetCommand,
  OnTheGoActionResolveCommand,
  OnTheGoConfirmationRequestCommand,
  OnTheGoConfirmationRespondCommand,
]);
export type OnTheGoCommand = typeof OnTheGoCommand.Type;

export const OnTheGoCommandAccepted = Schema.Struct({
  status: Schema.Literal("accepted"),
  commandId: OnTheGoCommandId,
});

export const OnTheGoCommandRejected = Schema.Struct({
  status: Schema.Literal("rejected"),
  commandId: OnTheGoCommandId,
  reason: Schema.Literals([
    "owner-required",
    "owner-held",
    "not-owner",
    "continue-required",
    "device-untrusted",
    "unavailable-transition",
    "wake-not-recognized",
    "barge-in-disabled",
    "invalid-state",
    "transcription-failed",
    "immutable-phrase",
    "alias-conflict",
    "action-not-cataloged",
    "confirmation-not-found",
    "confirmation-phrase-required",
    "confirmation-expired",
    "confirmation-target-changed",
    "confirmation-ambiguous",
  ]),
});

export const OnTheGoConfirmationRequired = Schema.Struct({
  status: Schema.Literal("confirmation-required"),
  commandId: OnTheGoCommandId,
  confirmationId: OnTheGoConfirmationId,
  action: OnTheGoActionId,
  target: TrimmedNonEmptyString,
  expiresAt: IsoDateTime,
});

export const OnTheGoCommandDisposition = Schema.Union([
  OnTheGoCommandAccepted,
  OnTheGoCommandRejected,
  OnTheGoConfirmationRequired,
]);
export type OnTheGoCommandDisposition = typeof OnTheGoCommandDisposition.Type;

export const OnTheGoActionResolvedEvent = Schema.Struct({
  type: Schema.Literal("action.resolved"),
  sequence: NonNegativeInt,
  at: IsoDateTime,
  commandId: OnTheGoCommandId,
  action: OnTheGoActionId,
  source: OnTheGoInputSource,
  resolution: Schema.Literals(["local-safety", "alias", "model"]),
});

export const OnTheGoActionAuthorizedEvent = Schema.Struct({
  type: Schema.Literal("action.authorized"),
  sequence: NonNegativeInt,
  at: IsoDateTime,
  commandId: OnTheGoCommandId,
  confirmationId: OnTheGoConfirmationId,
  action: OnTheGoActionId,
  target: TrimmedNonEmptyString,
  source: OnTheGoInputSource,
});

export const OnTheGoEvent = Schema.Union([
  OnTheGoActionResolvedEvent,
  OnTheGoActionAuthorizedEvent,
]);
export type OnTheGoEvent = typeof OnTheGoEvent.Type;

const OnTheGoModelIdentity = {
  providerId: TrimmedNonEmptyString,
  modelId: TrimmedNonEmptyString,
};

export const OnTheGoTranscriptionModelSelection = Schema.Struct({
  ...OnTheGoModelIdentity,
  capability: Schema.Literal("transcription"),
});

export const OnTheGoTheoModelSelection = Schema.Struct({
  ...OnTheGoModelIdentity,
  capability: Schema.Literal("reasoning"),
});

export const OnTheGoSpeechModelSelection = Schema.Struct({
  ...OnTheGoModelIdentity,
  capability: Schema.Literal("speech"),
});

export const OnTheGoSettings = Schema.Struct({
  enabled: Schema.Boolean,
  bargeInEnabled: Schema.Boolean,
  wakePhrases: Schema.Array(TrimmedNonEmptyString),
  confirmationWindowMs: PositiveInt,
  outputPrivacy: Schema.Literals(["private", "public"]),
  transcriptionModel: OnTheGoTranscriptionModelSelection,
  theoModel: OnTheGoTheoModelSelection,
  speechModel: OnTheGoSpeechModelSelection,
});
export type OnTheGoSettings = typeof OnTheGoSettings.Type;

export const DEFAULT_ON_THE_GO_SETTINGS: OnTheGoSettings = {
  enabled: false,
  bargeInEnabled: true,
  wakePhrases: ["T3", "Hey Theo"],
  confirmationWindowMs: 15_000,
  outputPrivacy: "public",
  transcriptionModel: {
    providerId: "system",
    modelId: "default-transcription",
    capability: "transcription",
  },
  theoModel: { providerId: "system", modelId: "default-reasoning", capability: "reasoning" },
  speechModel: { providerId: "system", modelId: "default-speech", capability: "speech" },
};

export const OnTheGoRetentionPolicy = Schema.Struct({
  rawAudio: Schema.Literal("discard-after-attempt"),
  responseActiveDays: PositiveInt,
  attentionExpires: Schema.Literal(false),
  speechCacheMaxHours: PositiveInt,
  lifecycleTombstoneDays: PositiveInt,
});
export type OnTheGoRetentionPolicy = typeof OnTheGoRetentionPolicy.Type;

export const DEFAULT_ON_THE_GO_RETENTION: OnTheGoRetentionPolicy = {
  rawAudio: "discard-after-attempt",
  responseActiveDays: 30,
  attentionExpires: false,
  speechCacheMaxHours: 24,
  lifecycleTombstoneDays: 90,
};

export const OnTheGoIdentity = Schema.Struct({
  voiceSessionId: OnTheGoVoiceSessionId,
  deviceId: OnTheGoDeviceId,
});
export type OnTheGoIdentity = typeof OnTheGoIdentity.Type;

export const OnTheGoReadScope = Schema.Struct({
  voiceSessionId: OnTheGoVoiceSessionId,
  deviceId: OnTheGoDeviceId,
});
export type OnTheGoReadScope = typeof OnTheGoReadScope.Type;

export const OnTheGoError = Schema.Struct({
  code: Schema.Literals([
    "invalid-command",
    "invalid-state",
    "policy-denied",
    "adapter-unavailable",
    "persistence-failed",
    "unknown-outcome",
  ]),
  message: TrimmedNonEmptyString,
  retryable: Schema.Boolean,
});
export type OnTheGoError = typeof OnTheGoError.Type;

export const OnTheGoSnapshot = Schema.Struct({
  mode: OnTheGoMode,
  listener: Schema.Literals(["disabled", "wake-only", "active"]),
  output: Schema.Literals(["disabled", "enabled"]),
  bargeInEnabled: Schema.Boolean,
  dictation: Schema.Struct({
    status: Schema.Literals(["idle", "ready", "error"]),
    text: Schema.String,
  }),
  vocabulary: Schema.Array(
    Schema.Struct({
      phrase: TrimmedNonEmptyString,
      action: OnTheGoActionId,
    }),
  ),
  lastResolvedAction: Schema.NullOr(OnTheGoActionId),
  pendingConfirmation: Schema.NullOr(
    Schema.Struct({
      confirmationId: OnTheGoConfirmationId,
      action: OnTheGoActionId,
      target: TrimmedNonEmptyString,
      expiresAt: IsoDateTime,
    }),
  ),
  owner: Schema.NullOr(
    Schema.Struct({
      deviceId: OnTheGoDeviceId,
      continueRequired: Schema.Boolean,
    }),
  ),
});
export type OnTheGoSnapshot = typeof OnTheGoSnapshot.Type;
