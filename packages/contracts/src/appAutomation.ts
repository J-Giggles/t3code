import { Schema } from "effect";

import { EnvironmentId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import {
  BrowserAutomationClickInput,
  BrowserAutomationError,
  BrowserAutomationEvaluateInput,
  BrowserAutomationPressInput,
  BrowserAutomationScrollInput,
  BrowserAutomationSnapshot,
  BrowserAutomationStatus,
  BrowserAutomationTypeInput,
  BrowserAutomationWaitForInput,
} from "./browserAutomation.ts";

export const AppAutomationOperation = Schema.Literals([
  "status",
  "show",
  "snapshot",
  "click",
  "type",
  "press",
  "scroll",
  "evaluate",
  "waitFor",
]);
export type AppAutomationOperation = typeof AppAutomationOperation.Type;

export const AppAutomationStatus = BrowserAutomationStatus;
export type AppAutomationStatus = typeof AppAutomationStatus.Type;

export const AppAutomationClickInput = BrowserAutomationClickInput;
export type AppAutomationClickInput = typeof AppAutomationClickInput.Type;

export const AppAutomationTypeInput = BrowserAutomationTypeInput;
export type AppAutomationTypeInput = typeof AppAutomationTypeInput.Type;

export const AppAutomationPressInput = BrowserAutomationPressInput;
export type AppAutomationPressInput = typeof AppAutomationPressInput.Type;

export const AppAutomationScrollInput = BrowserAutomationScrollInput;
export type AppAutomationScrollInput = typeof AppAutomationScrollInput.Type;

export const AppAutomationEvaluateInput = BrowserAutomationEvaluateInput;
export type AppAutomationEvaluateInput = typeof AppAutomationEvaluateInput.Type;

export const AppAutomationWaitForInput = BrowserAutomationWaitForInput;
export type AppAutomationWaitForInput = typeof AppAutomationWaitForInput.Type;

export const AppAutomationSnapshot = BrowserAutomationSnapshot;
export type AppAutomationSnapshot = typeof AppAutomationSnapshot.Type;

export const AppAutomationOwner = Schema.Struct({
  clientId: TrimmedNonEmptyString,
  environmentId: EnvironmentId,
  threadId: ThreadId,
  visible: Schema.Boolean,
  supportsAutomation: Schema.Boolean,
  focusedAt: Schema.String,
});
export type AppAutomationOwner = typeof AppAutomationOwner.Type;

export const AppAutomationRequest = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  threadId: ThreadId,
  operation: AppAutomationOperation,
  input: Schema.Unknown,
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type AppAutomationRequest = typeof AppAutomationRequest.Type;

export const AppAutomationResponse = Schema.Struct({
  requestId: TrimmedNonEmptyString,
  ok: Schema.Boolean,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      _tag: TrimmedNonEmptyString,
      message: Schema.String,
      detail: Schema.optional(Schema.Unknown),
    }),
  ),
});
export type AppAutomationResponse = typeof AppAutomationResponse.Type;

export const AppAutomationError = BrowserAutomationError;
export type AppAutomationError = typeof AppAutomationError.Type;
