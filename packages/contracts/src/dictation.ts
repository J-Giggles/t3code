import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

const DictationSessionId = TrimmedNonEmptyString;
export type DictationSessionId = typeof DictationSessionId.Type;

const Base64Pcm = Schema.String.check(Schema.isMaxLength(8192));

export const DictationCapability = Schema.Struct({
  available: Schema.Boolean,
  reason: Schema.NullOr(TrimmedNonEmptyString),
  modelLabel: Schema.NullOr(TrimmedNonEmptyString),
  binaryPath: Schema.NullOr(TrimmedNonEmptyString),
});
export type DictationCapability = typeof DictationCapability.Type;

export const DictationStartInput = Schema.Struct({
  threadId: ThreadId,
  language: Schema.NullOr(TrimmedNonEmptyString),
});
export type DictationStartInput = typeof DictationStartInput.Type;

export const DictationStartResult = Schema.Struct({
  sessionId: DictationSessionId,
  modelLabel: TrimmedNonEmptyString,
});
export type DictationStartResult = typeof DictationStartResult.Type;

export const DictationAudioFrameInput = Schema.Struct({
  sessionId: DictationSessionId,
  seq: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
  pcm: Base64Pcm,
});
export type DictationAudioFrameInput = typeof DictationAudioFrameInput.Type;

const DictationStopReason = Schema.Literals([
  "user",
  "thread-switch",
  "tab-hidden",
  "mic-disconnect",
]);
export type DictationStopReason = typeof DictationStopReason.Type;

export const DictationStopInput = Schema.Struct({
  sessionId: DictationSessionId,
  reason: DictationStopReason,
});
export type DictationStopInput = typeof DictationStopInput.Type;

export const DictationErrorCode = Schema.Literals([
  "spawn-failed",
  "model-missing",
  "backpressure",
  "audio-decode",
  "child-crashed",
  "permission-denied",
  "internal",
]);
export type DictationErrorCode = typeof DictationErrorCode.Type;

export const DictationError = Schema.Struct({
  _tag: Schema.Literal("DictationError"),
  code: DictationErrorCode,
  message: TrimmedNonEmptyString,
  sessionId: Schema.NullOr(DictationSessionId),
});
export type DictationError = typeof DictationError.Type;

const DictationEventStarted = Schema.Struct({
  type: Schema.Literal("started"),
  sessionId: DictationSessionId,
  modelLabel: TrimmedNonEmptyString,
});
const DictationEventPartial = Schema.Struct({
  type: Schema.Literal("partial"),
  sessionId: DictationSessionId,
  text: Schema.String,
});
const DictationEventCommit = Schema.Struct({
  type: Schema.Literal("commit"),
  sessionId: DictationSessionId,
  text: Schema.String,
});
const DictationEventStopped = Schema.Struct({
  type: Schema.Literal("stopped"),
  sessionId: DictationSessionId,
  reason: Schema.Literals(["client-stop", "server-stop"]),
});
const DictationEventError = Schema.Struct({
  type: Schema.Literal("error"),
  sessionId: Schema.NullOr(DictationSessionId),
  code: DictationErrorCode,
  message: TrimmedNonEmptyString,
});

export const DictationStreamEvent = Schema.Union([
  DictationEventStarted,
  DictationEventPartial,
  DictationEventCommit,
  DictationEventStopped,
  DictationEventError,
]);
export type DictationStreamEvent = typeof DictationStreamEvent.Type;

export const DICTATION_WS_METHODS = {
  start: "dictation.start",
  audioFrame: "dictation.audioFrame",
  stop: "dictation.stop",
  subscribe: "subscribeDictation",
} as const;

export const WsDictationStartRpc = Rpc.make(DICTATION_WS_METHODS.start, {
  payload: DictationStartInput,
  success: DictationStartResult,
  error: DictationError,
});

export const WsDictationAudioFrameRpc = Rpc.make(DICTATION_WS_METHODS.audioFrame, {
  payload: DictationAudioFrameInput,
  error: DictationError,
});

export const WsDictationStopRpc = Rpc.make(DICTATION_WS_METHODS.stop, {
  payload: DictationStopInput,
  error: DictationError,
});

export const WsSubscribeDictationRpc = Rpc.make(DICTATION_WS_METHODS.subscribe, {
  payload: Schema.Struct({}),
  success: DictationStreamEvent,
  stream: true,
});
