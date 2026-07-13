import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "../../baseSchemas.ts";
import { OnTheGoCommandId, OnTheGoConfirmationId, OnTheGoDeviceId } from "./common.ts";

const Id = (name: string) => TrimmedNonEmptyString.pipe(Schema.brand(name));

export const OnTheGoResponseId = Id("OnTheGoResponseId");
export type OnTheGoResponseId = typeof OnTheGoResponseId.Type;
export const OnTheGoAttentionId = Id("OnTheGoAttentionId");
export type OnTheGoAttentionId = typeof OnTheGoAttentionId.Type;
export const OnTheGoPromptId = Id("OnTheGoPromptId");
export type OnTheGoPromptId = typeof OnTheGoPromptId.Type;
export const OnTheGoPromptRevisionId = Id("OnTheGoPromptRevisionId");
export type OnTheGoPromptRevisionId = typeof OnTheGoPromptRevisionId.Type;
export const OnTheGoSubmissionId = Id("OnTheGoSubmissionId");
export type OnTheGoSubmissionId = typeof OnTheGoSubmissionId.Type;

export const OnTheGoDeliveryIntent = Schema.Literals(["queue", "steer", "interrupt-and-replace"]);
export type OnTheGoDeliveryIntent = typeof OnTheGoDeliveryIntent.Type;

export const OnTheGoResponse = Schema.Struct({
  responseId: OnTheGoResponseId,
  projectId: TrimmedNonEmptyString,
  chatId: TrimmedNonEmptyString,
  agentId: TrimmedNonEmptyString,
  outcome: Schema.Literals(["completed", "failed", "decision-required"]),
  safeSummary: TrimmedNonEmptyString,
  completedAt: IsoDateTime,
  handledAt: Schema.NullOr(IsoDateTime),
  expiresAt: IsoDateTime,
});
export type OnTheGoResponse = typeof OnTheGoResponse.Type;

export const OnTheGoAttentionItem = Schema.Struct({
  attentionId: OnTheGoAttentionId,
  responseId: Schema.NullOr(OnTheGoResponseId),
  chatId: TrimmedNonEmptyString,
  kind: Schema.Literals(["approval", "input", "failure", "decision"]),
  safeSummary: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
});
export type OnTheGoAttentionItem = typeof OnTheGoAttentionItem.Type;

export const OnTheGoPreparedPromptRevision = Schema.Struct({
  revisionId: OnTheGoPromptRevisionId,
  content: Schema.String,
  targetChatId: TrimmedNonEmptyString,
  targetAgentId: TrimmedNonEmptyString,
  createdAt: IsoDateTime,
  readiness: Schema.Literals(["draft", "ready", "stale", "pending-reconciliation"]),
  authorizedAt: Schema.NullOr(IsoDateTime),
  supersedes: Schema.NullOr(OnTheGoPromptRevisionId),
  requiresWorkspace: Schema.Boolean,
});
export type OnTheGoPreparedPromptRevision = typeof OnTheGoPreparedPromptRevision.Type;

export const OnTheGoPreparedPrompt = Schema.Struct({
  promptId: OnTheGoPromptId,
  activeRevisionId: OnTheGoPromptRevisionId,
  revisions: Schema.Array(OnTheGoPreparedPromptRevision),
});
export type OnTheGoPreparedPrompt = typeof OnTheGoPreparedPrompt.Type;

export const OnTheGoPendingTurn = Schema.Struct({
  submissionId: OnTheGoSubmissionId,
  promptId: OnTheGoPromptId,
  revisionId: OnTheGoPromptRevisionId,
  targetAgentId: TrimmedNonEmptyString,
  targetChatId: TrimmedNonEmptyString,
  contentHash: TrimmedNonEmptyString,
  intent: OnTheGoDeliveryIntent,
  source: Schema.Literals(["voice", "composer", "mcp", "automation", "legacy"]),
  expectedActiveTurnId: Schema.NullOr(TrimmedNonEmptyString),
  state: Schema.Literals([
    "queued",
    "steered",
    "dispatched",
    "frozen",
    "canceled",
    "failed",
    "unknown-outcome",
    "superseded",
  ]),
  createdAt: IsoDateTime,
  correctionExpiresAt: IsoDateTime,
  supersedes: Schema.NullOr(OnTheGoSubmissionId),
  workspaceReady: Schema.Boolean,
  terminalAt: Schema.NullOr(IsoDateTime),
});
export type OnTheGoPendingTurn = typeof OnTheGoPendingTurn.Type;

export const OnTheGoProfileRevision = Schema.Struct({
  version: NonNegativeInt,
  preferences: Schema.Array(TrimmedNonEmptyString),
  evidence: Schema.Array(TrimmedNonEmptyString),
  generatedPrompt: Schema.String,
  createdAt: IsoDateTime,
  scope: Schema.Literals(["user", "project", "session"]),
  scopeId: TrimmedNonEmptyString,
  projectId: Schema.NullOr(TrimmedNonEmptyString),
  updateNotice: TrimmedNonEmptyString,
});
export type OnTheGoProfileRevision = typeof OnTheGoProfileRevision.Type;

export const OnTheGoAgentCheckpoint = Schema.Struct({
  checkpointId: TrimmedNonEmptyString,
  chatId: TrimmedNonEmptyString,
  kind: Schema.Literals([
    "started",
    "progress",
    "file-changed",
    "tests",
    "approval",
    "blocked",
    "completed",
    "failed",
  ]),
  summary: TrimmedNonEmptyString,
  evidence: TrimmedNonEmptyString,
  confidence: Schema.Literals(["known", "inferred"]),
  occurredAt: IsoDateTime,
});
export type OnTheGoAgentCheckpoint = typeof OnTheGoAgentCheckpoint.Type;

export const OnTheGoFollowTimelineEntry = Schema.Struct({
  timelineId: TrimmedNonEmptyString,
  chatId: TrimmedNonEmptyString,
  fromCheckpointId: TrimmedNonEmptyString,
  toCheckpointId: TrimmedNonEmptyString,
  summary: TrimmedNonEmptyString,
  evidence: Schema.Array(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  priority: Schema.Literals(["ordinary", "immediate", "quiet"]),
});
export type OnTheGoFollowTimelineEntry = typeof OnTheGoFollowTimelineEntry.Type;

export const OnTheGoFoundationState = Schema.Struct({
  responses: Schema.Array(OnTheGoResponse),
  attention: Schema.Array(OnTheGoAttentionItem),
  responseBadge: NonNegativeInt,
  attentionBadge: NonNegativeInt,
  lastToneAt: Schema.NullOr(IsoDateTime),
  lastTone: Schema.NullOr(Schema.Literals(["response", "multi-response", "attention"])),
  reminderTone: Schema.NullOr(Schema.Literals(["response", "attention"])),
  announcementHistory: Schema.Array(OnTheGoResponseId),
  selectedResponseId: Schema.NullOr(OnTheGoResponseId),
  followedChatId: Schema.NullOr(TrimmedNonEmptyString),
  followTimeline: Schema.Array(OnTheGoFollowTimelineEntry),
  followPendingCheckpoints: Schema.Array(OnTheGoAgentCheckpoint),
  followLastSummaryAt: Schema.NullOr(IsoDateTime),
  followQuietCueAt: Schema.NullOr(IsoDateTime),
  prompts: Schema.Array(OnTheGoPreparedPrompt),
  pendingTurns: Schema.Array(OnTheGoPendingTurn),
  frozenAgents: Schema.Array(TrimmedNonEmptyString),
  profileHistory: Schema.Array(OnTheGoProfileRevision),
  activeProfileVersion: NonNegativeInt,
  profileLayers: Schema.Array(
    Schema.Struct({
      scope: Schema.Literals(["user", "project", "session"]),
      scopeId: TrimmedNonEmptyString,
      projectId: Schema.NullOr(TrimmedNonEmptyString),
      version: NonNegativeInt,
    }),
  ),
  profileConflictQuestion: Schema.NullOr(TrimmedNonEmptyString),
  profileEvidenceCandidates: Schema.Array(
    Schema.Struct({
      scope: Schema.Literals(["user", "project", "session"]),
      scopeId: TrimmedNonEmptyString,
      preference: TrimmedNonEmptyString,
      evidence: Schema.Array(TrimmedNonEmptyString),
    }),
  ),
  consumedConfirmations: Schema.Array(OnTheGoConfirmationId),
  deletionTombstones: Schema.Array(
    Schema.Struct({ scope: TrimmedNonEmptyString, deletedAt: IsoDateTime, expiresAt: IsoDateTime }),
  ),
  lifecycleTombstones: Schema.Array(
    Schema.Struct({
      submissionId: OnTheGoSubmissionId,
      contentHash: TrimmedNonEmptyString,
      disposition: TrimmedNonEmptyString,
      expiresAt: IsoDateTime,
    }),
  ),
  contextEvidence: Schema.Array(
    Schema.Struct({
      source: TrimmedNonEmptyString,
      reference: TrimmedNonEmptyString,
      ownerScope: TrimmedNonEmptyString,
      sourceVersion: TrimmedNonEmptyString,
      contentHash: TrimmedNonEmptyString,
      instructionWarning: Schema.Boolean,
      fetchedAt: IsoDateTime,
    }),
  ),
  agentHandoffs: Schema.Array(
    Schema.Struct({
      agentId: TrimmedNonEmptyString,
      worktreeName: TrimmedNonEmptyString,
      promptId: OnTheGoPromptId,
      revisionId: OnTheGoPromptRevisionId,
      sourceScope: TrimmedNonEmptyString,
      includedReferences: Schema.Array(TrimmedNonEmptyString),
      sharedWritable: Schema.Boolean,
    }),
  ),
  modelUsage: Schema.Array(
    Schema.Struct({
      capability: Schema.Literals(["transcription", "reasoning", "speech"]),
      providerId: TrimmedNonEmptyString,
      modelId: TrimmedNonEmptyString,
      fallback: Schema.Boolean,
      at: IsoDateTime,
    }),
  ),
  speechCache: Schema.Array(
    Schema.Struct({
      cacheId: TrimmedNonEmptyString,
      scope: TrimmedNonEmptyString,
      expiresAt: IsoDateTime,
    }),
  ),
  lastExportPreview: Schema.Array(TrimmedNonEmptyString),
  lastInspection: Schema.Array(TrimmedNonEmptyString),
  diagnostics: Schema.Array(TrimmedNonEmptyString),
  deprecationWarnings: Schema.Array(TrimmedNonEmptyString),
  lastRecoverySummary: Schema.NullOr(TrimmedNonEmptyString),
  effectOutbox: Schema.Array(
    Schema.Struct({
      effectId: TrimmedNonEmptyString,
      kind: Schema.Literals(["turn-delivery", "speech", "agent-workspace"]),
      status: Schema.Literals(["pending", "completed", "failed", "unknown"]),
      createdAt: IsoDateTime,
      requestHash: Schema.NullOr(TrimmedNonEmptyString),
      resultRef: Schema.NullOr(TrimmedNonEmptyString),
    }),
  ),
});
export type OnTheGoFoundationState = typeof OnTheGoFoundationState.Type;

const Base = { commandId: OnTheGoCommandId, deviceId: OnTheGoDeviceId };
export const OnTheGoFoundationCommand = Schema.Union([
  Schema.Struct({ type: Schema.Literal("response.record"), ...Base, response: OnTheGoResponse }),
  Schema.Struct({
    type: Schema.Literal("response.handle"),
    ...Base,
    responseId: OnTheGoResponseId,
  }),
  Schema.Struct({
    type: Schema.Literal("response.navigate"),
    ...Base,
    direction: Schema.Literals(["last", "next", "previous"]),
  }),
  Schema.Struct({
    type: Schema.Literal("follow.start"),
    ...Base,
    chatId: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("follow.switch"),
    ...Base,
    chatId: TrimmedNonEmptyString,
    expectedChatId: Schema.NullOr(TrimmedNonEmptyString),
  }),
  Schema.Struct({ type: Schema.Literal("follow.stop"), ...Base }),
  Schema.Struct({
    type: Schema.Literal("follow.checkpoint.record"),
    ...Base,
    checkpoint: OnTheGoAgentCheckpoint,
  }),
  Schema.Struct({ type: Schema.Literal("follow.catch-up"), ...Base }),
  Schema.Struct({ type: Schema.Literal("follow.quiet-tick"), ...Base }),
  Schema.Struct({ type: Schema.Literal("attention.record"), ...Base, item: OnTheGoAttentionItem }),
  Schema.Struct({
    type: Schema.Literal("attention.resolve"),
    ...Base,
    attentionId: OnTheGoAttentionId,
  }),
  Schema.Struct({
    type: Schema.Literal("profile.observe"),
    ...Base,
    evidence: TrimmedNonEmptyString,
    preference: TrimmedNonEmptyString,
    scope: Schema.Literals(["user", "project", "session"]),
    scopeId: TrimmedNonEmptyString,
    projectId: Schema.NullOr(TrimmedNonEmptyString),
    confidence: Schema.Literals(["explicit", "repeated", "uncertain"]),
    sensitive: Schema.Boolean,
    oneOff: Schema.Boolean,
  }),
  Schema.Struct({ type: Schema.Literal("profile.undo"), ...Base }),
  Schema.Struct({ type: Schema.Literal("profile.reset"), ...Base }),
  Schema.Struct({
    type: Schema.Literal("prompt.prepare"),
    ...Base,
    promptId: OnTheGoPromptId,
    revisionId: OnTheGoPromptRevisionId,
    content: Schema.String,
    targetChatId: TrimmedNonEmptyString,
    targetAgentId: TrimmedNonEmptyString,
    requiresWorkspace: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("prompt.revise"),
    ...Base,
    promptId: OnTheGoPromptId,
    revisionId: OnTheGoPromptRevisionId,
    content: Schema.String,
    targetChatId: TrimmedNonEmptyString,
    targetAgentId: TrimmedNonEmptyString,
    requiresWorkspace: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("prompt.mark-ready"),
    ...Base,
    promptId: OnTheGoPromptId,
    revisionId: OnTheGoPromptRevisionId,
  }),
  Schema.Struct({
    type: Schema.Literal("prompt.send"),
    ...Base,
    promptId: OnTheGoPromptId,
    revisionId: OnTheGoPromptRevisionId,
    phrase: TrimmedNonEmptyString,
    intent: Schema.optional(OnTheGoDeliveryIntent),
    source: Schema.Literals(["voice", "composer", "mcp", "automation", "legacy"]),
    expectedActiveTurnId: Schema.NullOr(TrimmedNonEmptyString),
  }),
  Schema.Struct({
    type: Schema.Literal("pending.correct-to-steer"),
    ...Base,
    submissionId: OnTheGoSubmissionId,
    activeTurnId: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("pending.cancel"),
    ...Base,
    submissionId: OnTheGoSubmissionId,
  }),
  Schema.Struct({
    type: Schema.Literal("pending.reorder"),
    ...Base,
    submissionId: OnTheGoSubmissionId,
    beforeSubmissionId: Schema.NullOr(OnTheGoSubmissionId),
    expectedOrder: Schema.Array(OnTheGoSubmissionId),
  }),
  Schema.Struct({
    type: Schema.Literal("turn.complete"),
    ...Base,
    targetAgentId: TrimmedNonEmptyString,
    outcome: Schema.Literals([
      "compatible",
      "approval",
      "input",
      "failure",
      "drift",
      "conflict",
      "uncertain",
    ]),
    activeTurnId: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("scheduler.tick"),
    ...Base,
    targetAgentId: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("delivery.resolve"),
    ...Base,
    submissionId: OnTheGoSubmissionId,
    outcome: Schema.Literals(["dispatched", "failed", "unknown"]),
  }),
  Schema.Struct({
    type: Schema.Literal("queue.retry"),
    ...Base,
    targetAgentId: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("queue.continue"),
    ...Base,
    targetAgentId: TrimmedNonEmptyString,
    confirmationId: OnTheGoConfirmationId,
    expectedPendingCount: NonNegativeInt,
  }),
  Schema.Struct({
    type: Schema.Literal("theo.context.fetch"),
    ...Base,
    source: TrimmedNonEmptyString,
    reference: TrimmedNonEmptyString,
    sourceVersion: TrimmedNonEmptyString,
    ownerScope: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("agent.handoff.create"),
    ...Base,
    promptId: OnTheGoPromptId,
    agentId: TrimmedNonEmptyString,
    sourceScope: TrimmedNonEmptyString,
    references: Schema.Array(TrimmedNonEmptyString),
    sharedWritable: Schema.Boolean,
    sharedWriteConfirmationId: Schema.NullOr(OnTheGoConfirmationId),
  }),
  Schema.Struct({
    type: Schema.Literal("model.use"),
    ...Base,
    capability: Schema.Literals(["transcription", "reasoning", "speech"]),
    providerId: TrimmedNonEmptyString,
    modelId: TrimmedNonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal("audio.render"),
    ...Base,
    cacheId: TrimmedNonEmptyString,
    scope: TrimmedNonEmptyString,
    privateDetail: Schema.String,
    publicSummary: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("data.export-preview"),
    ...Base,
    scope: TrimmedNonEmptyString,
  }),
  Schema.Struct({ type: Schema.Literal("data.inspect"), ...Base, scope: TrimmedNonEmptyString }),
  Schema.Struct({ type: Schema.Literal("data.diagnostics"), ...Base }),
  Schema.Struct({
    type: Schema.Literal("data.reset"),
    ...Base,
    scope: Schema.Literals(["profile", "queues", "all"]),
    confirmationId: Schema.NullOr(OnTheGoConfirmationId),
    expectedPendingCount: NonNegativeInt,
  }),
  Schema.Struct({
    type: Schema.Literal("data.delete"),
    ...Base,
    scope: TrimmedNonEmptyString,
    confirmationId: OnTheGoConfirmationId,
    expectedPendingCount: NonNegativeInt,
    expectedActiveTurnId: Schema.NullOr(TrimmedNonEmptyString),
  }),
  Schema.Struct({ type: Schema.Literal("effects.reconcile"), ...Base }),
  Schema.Struct({
    type: Schema.Literal("effect.abandon"),
    ...Base,
    effectId: TrimmedNonEmptyString,
    confirmationId: OnTheGoConfirmationId,
  }),
]);
export type OnTheGoFoundationCommand = typeof OnTheGoFoundationCommand.Type;

export const OnTheGoFoundationEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("queue.changed"),
    sequence: NonNegativeInt,
    at: IsoDateTime,
    commandId: OnTheGoCommandId,
  }),
  Schema.Struct({
    type: Schema.Literal("prompt.changed"),
    sequence: NonNegativeInt,
    at: IsoDateTime,
    commandId: OnTheGoCommandId,
  }),
  Schema.Struct({
    type: Schema.Literal("follow.changed"),
    sequence: NonNegativeInt,
    at: IsoDateTime,
    commandId: OnTheGoCommandId,
  }),
  Schema.Struct({
    type: Schema.Literal("submission.changed"),
    sequence: NonNegativeInt,
    at: IsoDateTime,
    commandId: OnTheGoCommandId,
    submissionId: OnTheGoSubmissionId,
    state: OnTheGoPendingTurn.fields.state,
    intent: OnTheGoDeliveryIntent,
  }),
]);
export type OnTheGoFoundationEvent = typeof OnTheGoFoundationEvent.Type;
