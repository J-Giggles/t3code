import * as NodeCrypto from "node:crypto";

import {
  OnTheGoAttentionId,
  OnTheGoPromptRevisionId,
  OnTheGoSubmissionId,
  type OnTheGoCommandDisposition,
  type OnTheGoFoundationCommand,
  type OnTheGoFoundationState,
  type OnTheGoPendingTurn,
  type OnTheGoPreparedPrompt,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { OnTheGoRuntimePorts } from "./Ports.ts";

export const initialOnTheGoFoundationState = (): OnTheGoFoundationState => ({
  responses: [],
  attention: [],
  responseBadge: 0,
  attentionBadge: 0,
  lastToneAt: null,
  lastTone: null,
  reminderTone: null,
  announcementHistory: [],
  selectedResponseId: null,
  prompts: [],
  pendingTurns: [],
  frozenAgents: [],
  profileHistory: [
    {
      version: 0,
      preferences: [],
      evidence: [],
      generatedPrompt: "You are Theo. Remain read-only and require Send it for every handoff.",
      createdAt: "2026-01-01T00:00:00.000Z",
      scope: "user",
      scopeId: "account",
      projectId: null,
      updateNotice: "Base Theo safety profile",
    },
  ],
  activeProfileVersion: 0,
  profileLayers: [{ scope: "user", scopeId: "account", projectId: null, version: 0 }],
  profileConflictQuestion: null,
  profileEvidenceCandidates: [],
  consumedConfirmations: [],
  deletionTombstones: [],
  lifecycleTombstones: [],
  contextEvidence: [],
  agentHandoffs: [],
  modelUsage: [],
  speechCache: [],
  lastExportPreview: [],
  lastInspection: [],
  diagnostics: [],
  deprecationWarnings: [],
  lastRecoverySummary: null,
  effectOutbox: [],
});

export const normalizeOnTheGoFoundationState = (
  state: Partial<OnTheGoFoundationState> | undefined,
): OnTheGoFoundationState => {
  const merged = { ...initialOnTheGoFoundationState(), ...state };
  const prompts = merged.prompts.map((prompt) => ({
    ...prompt,
    revisions: prompt.revisions.map((revision) => ({
      ...revision,
      requiresWorkspace: revision.requiresWorkspace ?? false,
    })),
  }));
  return {
    ...merged,
    prompts,
    pendingTurns: merged.pendingTurns.map((turn) => ({
      ...turn,
      workspaceReady: turn.workspaceReady ?? true,
      terminalAt:
        turn.terminalAt ?? (terminalPendingStates.has(turn.state) ? turn.createdAt : null),
    })),
    contextEvidence: merged.contextEvidence.map((evidence) => ({
      ...evidence,
      ownerScope: evidence.ownerScope ?? evidence.reference,
    })),
    deletionTombstones: merged.deletionTombstones.map((tombstone) => ({
      ...tombstone,
      expiresAt: tombstone.expiresAt ?? plus(tombstone.deletedAt, { days: 90 }),
    })),
    agentHandoffs: merged.agentHandoffs.map((handoff) => {
      const prompt = prompts.find((candidate) => candidate.promptId === handoff.promptId);
      const revision = prompt?.revisions.find(
        (candidate) => candidate.revisionId === prompt.activeRevisionId,
      );
      return {
        ...handoff,
        revisionId:
          handoff.revisionId ?? prompt?.activeRevisionId ?? OnTheGoPromptRevisionId.make("legacy"),
        sourceScope: handoff.sourceScope ?? revision?.targetChatId ?? "legacy",
      };
    }),
  };
};

const epoch = (value: string) => DateTime.toEpochMillis(DateTime.makeUnsafe(value));
const activePendingStates = new Set<OnTheGoPendingTurn["state"]>([
  "queued",
  "frozen",
  "unknown-outcome",
]);
const terminalPendingStates = new Set<OnTheGoPendingTurn["state"]>([
  "steered",
  "dispatched",
  "canceled",
  "failed",
  "superseded",
]);

export const pruneOnTheGoFoundationState = (
  state: OnTheGoFoundationState,
  now: string,
): OnTheGoFoundationState => {
  const normalized = normalizeOnTheGoFoundationState(state);
  const expiredTerminalTurns = normalized.pendingTurns.filter(
    (turn) =>
      terminalPendingStates.has(turn.state) &&
      turn.terminalAt !== null &&
      epoch(turn.terminalAt) + 60 * 60 * 1_000 <= epoch(now),
  );
  const expiredIds = new Set(expiredTerminalTurns.map((turn) => turn.submissionId));
  const existingTombstones = new Set(
    normalized.lifecycleTombstones.map((entry) => entry.submissionId),
  );
  return {
    ...normalized,
    responses: normalized.responses.filter((response) => epoch(response.expiresAt) > epoch(now)),
    speechCache: normalized.speechCache.filter((entry) => epoch(entry.expiresAt) > epoch(now)),
    pendingTurns: normalized.pendingTurns.filter((turn) => !expiredIds.has(turn.submissionId)),
    lifecycleTombstones: [
      ...normalized.lifecycleTombstones.filter((entry) => epoch(entry.expiresAt) > epoch(now)),
      ...expiredTerminalTurns
        .filter((turn) => !existingTombstones.has(turn.submissionId))
        .map((turn) => ({
          submissionId: turn.submissionId,
          contentHash: turn.contentHash,
          disposition: turn.state,
          expiresAt: plus(turn.terminalAt!, { days: 90 }),
        })),
    ],
    deletionTombstones: normalized.deletionTombstones.filter(
      (entry) => epoch(entry.expiresAt) > epoch(now),
    ),
    effectOutbox: normalized.effectOutbox.filter(
      (effect) =>
        effect.status === "pending" ||
        effect.status === "unknown" ||
        epoch(effect.createdAt) + 90 * 24 * 60 * 60 * 1_000 > epoch(now),
    ),
  };
};

type RejectionReason = Extract<OnTheGoCommandDisposition, { status: "rejected" }>["reason"];
type FoundationEventInput =
  | { readonly type: "queue.changed"; readonly commandId: OnTheGoFoundationCommand["commandId"] }
  | { readonly type: "prompt.changed"; readonly commandId: OnTheGoFoundationCommand["commandId"] }
  | {
      readonly type: "submission.changed";
      readonly commandId: OnTheGoFoundationCommand["commandId"];
      readonly submissionId: OnTheGoSubmissionId;
      readonly state: OnTheGoPendingTurn["state"];
      readonly intent: OnTheGoPendingTurn["intent"];
    };
type Result = {
  readonly state: OnTheGoFoundationState;
  readonly disposition: OnTheGoCommandDisposition;
  readonly event?: FoundationEventInput;
  readonly events?: ReadonlyArray<FoundationEventInput>;
};

const reject = (command: OnTheGoFoundationCommand, reason: RejectionReason): Result => ({
  state: undefined as never,
  disposition: { status: "rejected", commandId: command.commandId, reason },
});

const accepted = (
  command: OnTheGoFoundationCommand,
  state: OnTheGoFoundationState,
  event?: FoundationEventInput | ReadonlyArray<FoundationEventInput>,
): Result =>
  event
    ? Array.isArray(event)
      ? { state, disposition: { status: "accepted", commandId: command.commandId }, events: event }
      : {
          state,
          disposition: { status: "accepted", commandId: command.commandId },
          event: event as FoundationEventInput,
        }
    : { state, disposition: { status: "accepted", commandId: command.commandId } };

const plus = (value: string, duration: Parameters<typeof DateTime.add>[1]) =>
  DateTime.formatIso(DateTime.add(DateTime.makeUnsafe(value), duration));
const contentHash = (value: string) => NodeCrypto.createHash("sha256").update(value).digest("hex");
const replacePrompt = (
  state: OnTheGoFoundationState,
  prompt: OnTheGoPreparedPrompt,
): OnTheGoFoundationState => ({
  ...state,
  prompts: [...state.prompts.filter((item) => item.promptId !== prompt.promptId), prompt],
});

export const dispatchOnTheGoFoundation = (
  state: OnTheGoFoundationState,
  command: OnTheGoFoundationCommand,
  ports: OnTheGoRuntimePorts,
  persistIntent: (state: OnTheGoFoundationState) => void,
): Result => {
  const now = ports.clock.now();
  state = pruneOnTheGoFoundationState(state, now);
  const fail = (reason: RejectionReason): Result => ({ ...reject(command, reason), state });
  const withEffect = (
    source: OnTheGoFoundationState,
    effectId: string,
    kind: "turn-delivery" | "speech" | "agent-workspace",
    status: "pending" | "completed" | "failed" | "unknown",
    requestHash?: string,
    resultRef?: string,
  ): OnTheGoFoundationState => ({
    ...source,
    effectOutbox: [
      ...source.effectOutbox.filter((effect) => effect.effectId !== effectId),
      {
        effectId,
        kind,
        status,
        createdAt: now,
        requestHash:
          requestHash ??
          source.effectOutbox.find((effect) => effect.effectId === effectId)?.requestHash ??
          null,
        resultRef:
          resultRef ??
          source.effectOutbox.find((effect) => effect.effectId === effectId)?.resultRef ??
          null,
      },
    ],
  });
  switch (command.type) {
    case "response.record": {
      if (state.responses.some((item) => item.responseId === command.response.responseId)) {
        return fail("duplicate-record");
      }
      if (command.response.outcome !== "completed") {
        const attentionId = OnTheGoAttentionId.make(`response:${command.response.responseId}`);
        if (state.attention.some((item) => item.attentionId === attentionId)) {
          return fail("duplicate-record");
        }
        return accepted(
          command,
          {
            ...state,
            responses: [
              ...state.responses,
              { ...command.response, handledAt: command.response.completedAt },
            ].sort((a, b) => epoch(a.completedAt) - epoch(b.completedAt)),
            attention: [
              ...state.attention,
              {
                attentionId,
                responseId: command.response.responseId,
                chatId: command.response.chatId,
                kind: command.response.outcome === "failed" ? "failure" : "decision",
                safeSummary: command.response.safeSummary,
                createdAt: command.response.completedAt,
                resolvedAt: null,
              },
            ],
            attentionBadge: state.attentionBadge + 1,
            lastToneAt: now,
            lastTone: "attention",
            reminderTone: "attention",
          },
          { type: "queue.changed", commandId: command.commandId },
        );
      }
      const coalesced =
        state.lastToneAt !== null &&
        state.lastTone !== "attention" &&
        epoch(now) - epoch(state.lastToneAt) <= 2_000;
      const hasUnresolvedAttention = state.attention.some((item) => item.resolvedAt === null);
      return accepted(
        command,
        {
          ...state,
          responses: [...state.responses, command.response].sort(
            (a, b) => epoch(a.completedAt) - epoch(b.completedAt),
          ),
          responseBadge: state.responseBadge + 1,
          lastToneAt: now,
          lastTone: coalesced ? "multi-response" : "response",
          reminderTone: hasUnresolvedAttention ? "attention" : "response",
        },
        { type: "queue.changed", commandId: command.commandId },
      );
    }
    case "response.handle": {
      const found = state.responses.find((item) => item.responseId === command.responseId);
      if (!found) return fail("not-found");
      return accepted(command, {
        ...state,
        responses: state.responses.map((item) =>
          item.responseId === command.responseId
            ? { ...item, handledAt: item.handledAt ?? now }
            : item,
        ),
        responseBadge: Math.max(0, state.responseBadge - (found.handledAt ? 0 : 1)),
      });
    }
    case "response.navigate": {
      const oldestUnhandled = state.responses.find((item) => item.handledAt === null) ?? null;
      let selected = null;
      if (command.direction === "last") selected = state.responses.at(-1) ?? null;
      if (command.direction === "next") selected = oldestUnhandled;
      if (command.direction === "previous") {
        const previousId = state.announcementHistory.at(-2);
        selected = state.responses.find((item) => item.responseId === previousId) ?? null;
      }
      if (!selected) return fail("not-found");
      return accepted(command, {
        ...state,
        selectedResponseId: selected.responseId,
        announcementHistory: [...state.announcementHistory, selected.responseId],
      });
    }
    case "attention.record": {
      if (
        state.attention.some(
          (item) =>
            item.attentionId === command.item.attentionId ||
            (command.item.responseId !== null && item.responseId === command.item.responseId),
        )
      ) {
        return fail("duplicate-record");
      }
      return accepted(
        command,
        {
          ...state,
          attention: [...state.attention, command.item].sort(
            (a, b) => epoch(a.createdAt) - epoch(b.createdAt),
          ),
          attentionBadge: state.attentionBadge + 1,
          lastToneAt: now,
          lastTone: "attention",
          reminderTone: "attention",
        },
        { type: "queue.changed", commandId: command.commandId },
      );
    }
    case "attention.resolve": {
      const found = state.attention.find((item) => item.attentionId === command.attentionId);
      if (!found) return fail("not-found");
      const remainingAttention = state.attention.some(
        (item) => item.attentionId !== command.attentionId && item.resolvedAt === null,
      );
      return accepted(command, {
        ...state,
        attention: state.attention.map((item) =>
          item.attentionId === command.attentionId
            ? { ...item, resolvedAt: item.resolvedAt ?? now }
            : item,
        ),
        attentionBadge: Math.max(0, state.attentionBadge - (found.resolvedAt ? 0 : 1)),
        reminderTone: remainingAttention
          ? "attention"
          : state.responseBadge > 0
            ? "response"
            : null,
      });
    }
    case "profile.observe": {
      if (command.sensitive || command.oneOff || command.confidence === "uncertain") {
        return fail("policy-denied");
      }
      const layer = state.profileLayers.find(
        (item) => item.scope === command.scope && item.scopeId === command.scopeId,
      );
      const active = layer
        ? state.profileHistory.find((item) => item.version === layer.version)!
        : undefined;
      const candidate = state.profileEvidenceCandidates.find(
        (item) =>
          item.scope === command.scope &&
          item.scopeId === command.scopeId &&
          item.preference === command.preference,
      );
      if (command.confidence === "repeated" && !candidate) {
        return accepted(command, {
          ...state,
          profileEvidenceCandidates: [
            ...state.profileEvidenceCandidates,
            {
              scope: command.scope,
              scopeId: command.scopeId,
              preference: command.preference,
              evidence: [command.evidence],
            },
          ],
        });
      }
      const preferenceKey = command.preference.split(":", 1)[0]!.trim().toLowerCase();
      const conflicting = active?.preferences.find(
        (preference) =>
          preference.split(":", 1)[0]!.trim().toLowerCase() === preferenceKey &&
          preference !== command.preference,
      );
      if (conflicting) {
        return {
          state: {
            ...state,
            profileConflictQuestion: `Should ${command.scope} preference '${conflicting}' be replaced with '${command.preference}'?`,
          },
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "preference-conflict",
          },
        };
      }
      const version = Math.max(...state.profileHistory.map((item) => item.version)) + 1;
      const preferences = [...new Set([...(active?.preferences ?? []), command.preference])];
      const nextLayers = [
        ...state.profileLayers.filter(
          (item) => !(item.scope === command.scope && item.scopeId === command.scopeId),
        ),
        { scope: command.scope, scopeId: command.scopeId, projectId: command.projectId, version },
      ];
      const effective = new Map<string, string>();
      for (const scope of ["user", "project", "session"] as const) {
        for (const selectedLayer of nextLayers.filter(
          (item) =>
            item.scope === scope &&
            (scope === "user" ||
              (scope === "project" && item.scopeId === command.projectId) ||
              (scope === "session" && item.scopeId === command.scopeId)),
        )) {
          const revisionPreferences =
            selectedLayer.version === version
              ? preferences
              : (state.profileHistory.find((item) => item.version === selectedLayer.version)
                  ?.preferences ?? []);
          for (const preference of revisionPreferences) {
            effective.set(preference.split(":", 1)[0]!.trim().toLowerCase(), preference);
          }
        }
      }
      const revision = {
        version,
        preferences,
        evidence: [...(active?.evidence ?? []), ...(candidate?.evidence ?? []), command.evidence],
        generatedPrompt: `${state.profileHistory[0]!.generatedPrompt}\nPreferences:\n${[...effective.values()].join("\n")}`,
        createdAt: now,
        scope: command.scope,
        scopeId: command.scopeId,
        projectId: command.projectId,
        updateNotice: `Updated ${command.scope} preference: ${command.preference}`,
      };
      return accepted(command, {
        ...state,
        profileHistory: [...state.profileHistory, revision],
        activeProfileVersion: version,
        profileLayers: nextLayers,
        profileConflictQuestion: null,
        profileEvidenceCandidates: state.profileEvidenceCandidates.filter(
          (item) => item !== candidate,
        ),
      });
    }
    case "profile.undo": {
      const currentRevision = state.profileHistory.find(
        (item) => item.version === state.activeProfileVersion,
      );
      if (!currentRevision || currentRevision.version === 0) return fail("not-found");
      const previous = state.profileHistory.findLast(
        (item) =>
          item.version < currentRevision.version &&
          item.scope === currentRevision.scope &&
          item.scopeId === currentRevision.scopeId,
      );
      const layers = previous
        ? state.profileLayers.map((layer) =>
            layer.scope === currentRevision.scope && layer.scopeId === currentRevision.scopeId
              ? { ...layer, version: previous.version }
              : layer,
          )
        : state.profileLayers.filter(
            (layer) =>
              !(layer.scope === currentRevision.scope && layer.scopeId === currentRevision.scopeId),
          );
      return accepted(command, {
        ...state,
        profileLayers:
          layers.length > 0
            ? layers
            : [{ scope: "user", scopeId: "account", projectId: null, version: 0 }],
        activeProfileVersion: Math.max(0, ...layers.map((layer) => layer.version)),
      });
    }
    case "profile.reset":
      return accepted(command, {
        ...state,
        activeProfileVersion: 0,
        profileLayers: [{ scope: "user", scopeId: "account", projectId: null, version: 0 }],
        profileConflictQuestion: null,
      });
    case "prompt.prepare": {
      if (state.prompts.some((item) => item.promptId === command.promptId)) {
        return fail("duplicate-record");
      }
      const revision = {
        revisionId: command.revisionId,
        content: command.content,
        targetChatId: command.targetChatId,
        targetAgentId: command.targetAgentId,
        createdAt: now,
        readiness: "draft" as const,
        authorizedAt: null,
        supersedes: null,
        requiresWorkspace: command.requiresWorkspace,
      };
      return accepted(
        command,
        replacePrompt(state, {
          promptId: command.promptId,
          activeRevisionId: command.revisionId,
          revisions: [revision],
        }),
        { type: "prompt.changed", commandId: command.commandId },
      );
    }
    case "prompt.revise": {
      const prompt = state.prompts.find((item) => item.promptId === command.promptId);
      if (!prompt) return fail("not-found");
      if (
        state.pendingTurns.some(
          (turn) => turn.promptId === prompt.promptId && turn.state === "unknown-outcome",
        )
      )
        return fail("unknown-outcome");
      const revision = {
        revisionId: command.revisionId,
        content: command.content,
        targetChatId: command.targetChatId,
        targetAgentId: command.targetAgentId,
        createdAt: now,
        readiness: "stale" as const,
        authorizedAt: null,
        supersedes: prompt.activeRevisionId,
        requiresWorkspace: command.requiresWorkspace,
      };
      const revisedState = replacePrompt(state, {
        ...prompt,
        activeRevisionId: command.revisionId,
        revisions: [...prompt.revisions, revision],
      });
      return accepted(
        command,
        {
          ...revisedState,
          pendingTurns: revisedState.pendingTurns.map((turn) =>
            turn.promptId === prompt.promptId && activePendingStates.has(turn.state)
              ? { ...turn, state: "superseded", terminalAt: now }
              : turn,
          ),
        },
        { type: "prompt.changed", commandId: command.commandId },
      );
    }
    case "prompt.mark-ready": {
      const prompt = state.prompts.find((item) => item.promptId === command.promptId);
      if (!prompt || prompt.activeRevisionId !== command.revisionId) return fail("not-found");
      const currentRevision = prompt.revisions.find(
        (item) => item.revisionId === command.revisionId,
      );
      if (!currentRevision) return fail("not-found");
      if (
        currentRevision.readiness === "pending-reconciliation" &&
        (!ports.connectivity.isOnline() ||
          !ports.reconciliation.canMarkReady(command.promptId, command.revisionId))
      ) {
        return fail("revision-not-ready");
      }
      return accepted(
        command,
        replacePrompt(state, {
          ...prompt,
          revisions: prompt.revisions.map((item) =>
            item.revisionId === command.revisionId
              ? { ...item, readiness: "ready", authorizedAt: null }
              : item,
          ),
        }),
      );
    }
    case "prompt.send": {
      const prompt = state.prompts.find((item) => item.promptId === command.promptId);
      const revision = prompt?.revisions.find((item) => item.revisionId === command.revisionId);
      if (!prompt || prompt.activeRevisionId !== command.revisionId || !revision)
        return fail("not-found");
      if (revision.readiness !== "ready") return fail("revision-not-ready");
      if (revision.authorizedAt !== null) return fail("duplicate-record");
      if (command.source === "voice" && command.phrase.trim().toLowerCase() !== "send it") {
        return fail("send-phrase-required");
      }
      const agentQueueCount = state.pendingTurns.filter(
        (turn) =>
          turn.targetAgentId === revision.targetAgentId && activePendingStates.has(turn.state),
      ).length;
      const accountQueueCount = state.pendingTurns.filter((turn) =>
        activePendingStates.has(turn.state),
      ).length;
      if (agentQueueCount >= 25 || accountQueueCount >= 200) {
        const attentionId = OnTheGoAttentionId.make(`queue-cap:${revision.targetAgentId}`);
        return {
          state: {
            ...state,
            attention: state.attention.some((item) => item.attentionId === attentionId)
              ? state.attention
              : [
                  ...state.attention,
                  {
                    attentionId,
                    responseId: null,
                    chatId: revision.targetChatId,
                    kind: "input",
                    safeSummary: "Queue limit reached; prompt preserved as a ready draft",
                    createdAt: now,
                    resolvedAt: null,
                  },
                ],
            attentionBadge: state.attention.some((item) => item.attentionId === attentionId)
              ? state.attentionBadge
              : state.attentionBadge + 1,
          },
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "queue-cap-reached",
          },
        };
      }
      const warningId = OnTheGoAttentionId.make(`queue-warning:${revision.targetAgentId}`);
      const capacityState =
        agentQueueCount >= 9 && !state.attention.some((item) => item.attentionId === warningId)
          ? {
              ...state,
              attention: [
                ...state.attention,
                {
                  attentionId: warningId,
                  responseId: null,
                  chatId: revision.targetChatId,
                  kind: "input" as const,
                  safeSummary: "Pending queue has ten or more items",
                  createdAt: now,
                  resolvedAt: null,
                },
              ],
              attentionBadge: state.attentionBadge + 1,
            }
          : state;
      const authorized = { ...revision, authorizedAt: now };
      const updated = replacePrompt(capacityState, {
        ...prompt,
        revisions: prompt.revisions.map((item) =>
          item.revisionId === revision.revisionId ? authorized : item,
        ),
      });
      if (!ports.connectivity.isOnline()) {
        return {
          state: replacePrompt(updated, {
            ...prompt,
            revisions: prompt.revisions.map((item) =>
              item.revisionId === revision.revisionId
                ? { ...authorized, readiness: "pending-reconciliation" }
                : item,
            ),
          }),
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "offline-pending",
          },
        };
      }
      if (command.intent === undefined && command.source !== "legacy")
        return fail("intent-required");
      const intent = command.intent ?? "queue";
      const sourceState =
        command.intent === undefined
          ? {
              ...updated,
              deprecationWarnings: [
                ...updated.deprecationWarnings,
                "Legacy omitted delivery intent; defaulted to queue",
              ],
            }
          : updated;
      const submissionId = OnTheGoSubmissionId.make(`submission:${command.commandId}`);
      const priorEffect = state.effectOutbox.find((effect) => effect.effectId === submissionId);
      if (priorEffect?.status === "completed") {
        return accepted(command, state);
      }
      if (priorEffect) {
        return {
          state,
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "unknown-outcome",
          },
        };
      }
      const pending: OnTheGoPendingTurn = {
        submissionId,
        promptId: prompt.promptId,
        revisionId: revision.revisionId,
        targetAgentId: revision.targetAgentId,
        targetChatId: revision.targetChatId,
        contentHash: contentHash(revision.content),
        intent,
        source: command.source,
        expectedActiveTurnId: command.expectedActiveTurnId,
        state: "queued",
        createdAt: now,
        correctionExpiresAt: plus(now, { seconds: 10 }),
        workspaceReady:
          !revision.requiresWorkspace ||
          state.agentHandoffs.some(
            (handoff) =>
              handoff.promptId === prompt.promptId && handoff.revisionId === revision.revisionId,
          ),
        terminalAt: null,
        supersedes:
          state.pendingTurns.findLast(
            (turn) => turn.promptId === prompt.promptId && turn.state === "superseded",
          )?.submissionId ?? null,
      };
      if (!pending.workspaceReady && intent !== "queue") {
        return {
          state: {
            ...sourceState,
            pendingTurns: [
              ...sourceState.pendingTurns,
              { ...pending, intent: "queue", state: "queued" },
            ],
          },
          disposition: { status: "rejected", commandId: command.commandId, reason: "turn-blocked" },
          event: {
            type: "submission.changed",
            commandId: command.commandId,
            submissionId,
            state: "queued",
            intent: "queue",
          },
        };
      }
      if (intent === "queue") {
        return {
          state: { ...sourceState, pendingTurns: [...sourceState.pendingTurns, pending] },
          disposition: { status: "accepted", commandId: command.commandId },
          event: {
            type: "submission.changed",
            commandId: command.commandId,
            submissionId,
            state: "queued",
            intent: "queue",
          },
        };
      }
      if (
        intent === "steer" &&
        (command.expectedActiveTurnId === null ||
          !ports.turnDelivery.canSteer(command.expectedActiveTurnId))
      ) {
        return {
          state: {
            ...sourceState,
            pendingTurns: [
              ...sourceState.pendingTurns,
              { ...pending, intent: "queue", state: "queued" },
            ],
          },
          disposition: { status: "rejected", commandId: command.commandId, reason: "turn-blocked" },
        };
      }
      const intentState = withEffect(
        { ...sourceState, pendingTurns: [...sourceState.pendingTurns, pending] },
        submissionId,
        "turn-delivery",
        "pending",
        pending.contentHash,
      );
      persistIntent(intentState);
      const delivery = ports.turnDelivery.deliver({
        submissionId,
        target: revision.targetChatId,
        targetAgentId: revision.targetAgentId,
        intent,
        prompt: revision.content,
        expectedActiveTurnId: command.expectedActiveTurnId,
        source: command.source,
      });
      const turnState: OnTheGoPendingTurn["state"] =
        delivery.disposition === "rejected"
          ? "failed"
          : delivery.disposition === "unknown"
            ? "unknown-outcome"
            : delivery.disposition === "queued"
              ? "queued"
              : delivery.disposition === "steered"
                ? "steered"
                : "dispatched";
      const next = withEffect(
        {
          ...intentState,
          pendingTurns: intentState.pendingTurns.map((turn) =>
            turn.submissionId === submissionId
              ? {
                  ...turn,
                  state:
                    intent === "steer" && delivery.disposition === "rejected"
                      ? "queued"
                      : turnState,
                  terminalAt:
                    intent === "steer" && delivery.disposition === "rejected"
                      ? null
                      : terminalPendingStates.has(turnState)
                        ? now
                        : null,
                  intent:
                    intent === "steer" && delivery.disposition === "rejected"
                      ? "queue"
                      : turn.intent,
                }
              : turn,
          ),
        },
        submissionId,
        "turn-delivery",
        delivery.disposition === "unknown"
          ? "unknown"
          : delivery.disposition === "rejected"
            ? "failed"
            : "completed",
        pending.contentHash,
        delivery.disposition,
      );
      const disposition =
        delivery.disposition === "unknown"
          ? {
              status: "rejected" as const,
              commandId: command.commandId,
              reason: "unknown-outcome" as const,
            }
          : delivery.disposition === "rejected"
            ? {
                status: "rejected" as const,
                commandId: command.commandId,
                reason: "invalid-state" as const,
              }
            : { status: "accepted" as const, commandId: command.commandId };
      return {
        state:
          delivery.disposition === "unknown"
            ? {
                ...next,
                frozenAgents: [...new Set([...next.frozenAgents, revision.targetAgentId])],
              }
            : next,
        disposition,
        event: {
          type: "submission.changed",
          commandId: command.commandId,
          submissionId,
          state: intent === "steer" && delivery.disposition === "rejected" ? "queued" : turnState,
          intent: intent === "steer" && delivery.disposition === "rejected" ? "queue" : intent,
        },
      };
    }
    case "pending.cancel": {
      const item = state.pendingTurns.find((turn) => turn.submissionId === command.submissionId);
      if (!item || (item.state !== "queued" && item.state !== "frozen")) return fail("not-found");
      const prompt = state.prompts.find((candidate) => candidate.promptId === item.promptId);
      const restored = prompt
        ? replacePrompt(state, {
            ...prompt,
            revisions: prompt.revisions.map((revision) =>
              revision.revisionId === item.revisionId
                ? { ...revision, readiness: "draft", authorizedAt: null }
                : revision,
            ),
          })
        : state;
      return accepted(
        command,
        {
          ...restored,
          pendingTurns: restored.pendingTurns.map((turn) =>
            turn.submissionId === item.submissionId
              ? { ...turn, state: "canceled", terminalAt: now }
              : turn,
          ),
        },
        {
          type: "submission.changed",
          commandId: command.commandId,
          submissionId: item.submissionId,
          state: "canceled",
          intent: item.intent,
        },
      );
    }
    case "pending.reorder": {
      const item = state.pendingTurns.find((turn) => turn.submissionId === command.submissionId);
      if (!item || (item.state !== "queued" && item.state !== "frozen")) return fail("not-found");
      const before =
        command.beforeSubmissionId === null
          ? null
          : state.pendingTurns.find((turn) => turn.submissionId === command.beforeSubmissionId);
      if (
        before &&
        (before.targetAgentId !== item.targetAgentId || !activePendingStates.has(before.state))
      )
        return fail("invalid-state");
      const without = state.pendingTurns.filter((turn) => turn.submissionId !== item.submissionId);
      const beforeIndex =
        command.beforeSubmissionId === null
          ? without.length
          : without.findIndex((turn) => turn.submissionId === command.beforeSubmissionId);
      if (beforeIndex < 0) return fail("not-found");
      const pendingTurns = [...without];
      pendingTurns.splice(beforeIndex, 0, item);
      const resultingOrder = pendingTurns
        .filter(
          (turn) =>
            turn.targetAgentId === item.targetAgentId && activePendingStates.has(turn.state),
        )
        .map((turn) => turn.submissionId);
      if (JSON.stringify(resultingOrder) !== JSON.stringify(command.expectedOrder))
        return fail("confirmation-target-changed");
      return accepted(
        command,
        { ...state, pendingTurns },
        {
          type: "submission.changed",
          commandId: command.commandId,
          submissionId: item.submissionId,
          state: item.state,
          intent: item.intent,
        },
      );
    }
    case "pending.correct-to-steer": {
      const item = state.pendingTurns.find((turn) => turn.submissionId === command.submissionId);
      if (!item) return fail("not-found");
      if (item.state !== "queued" || epoch(now) > epoch(item.correctionExpiresAt))
        return fail("correction-expired");
      if (item.expectedActiveTurnId !== command.activeTurnId) return fail("stale-active-turn");
      const newestAcknowledged = state.pendingTurns.findLast(
        (turn) => turn.targetAgentId === item.targetAgentId && turn.state === "queued",
      );
      if (newestAcknowledged?.submissionId !== item.submissionId) return fail("invalid-state");
      if (!ports.turnDelivery.canSteer(command.activeTurnId)) return fail("turn-blocked");
      const prompt = state.prompts.find((candidate) => candidate.promptId === item.promptId);
      const revision = prompt?.revisions.find(
        (candidate) => candidate.revisionId === item.revisionId,
      );
      if (!revision || contentHash(revision.content) !== item.contentHash)
        return fail("invalid-state");
      const effectId = `steer:${command.commandId}`;
      const priorEffect = state.effectOutbox.find((effect) => effect.effectId === effectId);
      if (priorEffect?.status === "completed") return accepted(command, state);
      if (priorEffect) {
        return {
          state,
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "unknown-outcome",
          },
        };
      }
      const intentState = withEffect(
        state,
        effectId,
        "turn-delivery",
        "pending",
        item.contentHash,
        item.submissionId,
      );
      persistIntent(intentState);
      const delivery = ports.turnDelivery.deliver({
        submissionId: item.submissionId,
        target: item.targetChatId,
        targetAgentId: item.targetAgentId,
        intent: "steer",
        prompt: revision.content,
        expectedActiveTurnId: command.activeTurnId,
        source: item.source,
      });
      if (delivery.disposition === "unknown") {
        return {
          state: withEffect(
            {
              ...intentState,
              pendingTurns: intentState.pendingTurns.map((turn) =>
                turn.submissionId === item.submissionId
                  ? { ...turn, state: "unknown-outcome", intent: "steer", terminalAt: null }
                  : turn,
              ),
              frozenAgents: [...new Set([...intentState.frozenAgents, item.targetAgentId])],
            },
            effectId,
            "turn-delivery",
            "unknown",
            item.contentHash,
            item.submissionId,
          ),
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "unknown-outcome",
          },
        };
      }
      if (delivery.disposition !== "steered") {
        return {
          state: withEffect(intentState, effectId, "turn-delivery", "failed"),
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "invalid-state",
          },
        };
      }
      return accepted(
        command,
        withEffect(
          {
            ...intentState,
            pendingTurns: state.pendingTurns.map((turn) =>
              turn.submissionId === item.submissionId
                ? { ...turn, intent: "steer", state: "steered", terminalAt: now }
                : turn,
            ),
          },
          effectId,
          "turn-delivery",
          "completed",
          item.contentHash,
          item.submissionId,
        ),
        {
          type: "submission.changed",
          commandId: command.commandId,
          submissionId: item.submissionId,
          state: "steered",
          intent: "steer",
        },
      );
    }
    case "turn.complete": {
      if (command.outcome === "compatible") {
        if (state.frozenAgents.includes(command.targetAgentId)) return accepted(command, state);
        const next = state.pendingTurns.find(
          (turn) =>
            turn.targetAgentId === command.targetAgentId &&
            turn.state === "queued" &&
            turn.workspaceReady,
        );
        if (!next) return accepted(command, state);
        if (epoch(now) <= epoch(next.correctionExpiresAt)) return accepted(command, state);
        const prompt = state.prompts.find((candidate) => candidate.promptId === next.promptId);
        const revision = prompt?.revisions.find(
          (candidate) => candidate.revisionId === next.revisionId,
        );
        if (!revision || contentHash(revision.content) !== next.contentHash) {
          return fail("invalid-state");
        }
        const effectId = `continue:${next.submissionId}`;
        const priorEffect = state.effectOutbox.find((effect) => effect.effectId === effectId);
        if (priorEffect?.status === "completed") return accepted(command, state);
        if (priorEffect) {
          return {
            state,
            disposition: {
              status: "rejected",
              commandId: command.commandId,
              reason: "unknown-outcome",
            },
          };
        }
        const intentState = withEffect(
          state,
          effectId,
          "turn-delivery",
          "pending",
          next.contentHash,
        );
        persistIntent(intentState);
        const delivery = ports.turnDelivery.deliver({
          submissionId: next.submissionId,
          target: next.targetChatId,
          targetAgentId: next.targetAgentId,
          intent: "queue",
          prompt: revision.content,
          expectedActiveTurnId: null,
          source: next.source,
        });
        if (delivery.disposition === "unknown") {
          return accepted(
            command,
            withEffect(
              {
                ...intentState,
                pendingTurns: state.pendingTurns.map((turn) =>
                  turn.submissionId === next.submissionId
                    ? { ...turn, state: "unknown-outcome", terminalAt: null }
                    : turn,
                ),
                frozenAgents: [...new Set([...state.frozenAgents, command.targetAgentId])],
              },
              effectId,
              "turn-delivery",
              "unknown",
            ),
            {
              type: "submission.changed",
              commandId: command.commandId,
              submissionId: next.submissionId,
              state: "unknown-outcome",
              intent: "queue",
            },
          );
        }
        if (delivery.disposition === "rejected") {
          return {
            state: withEffect(intentState, effectId, "turn-delivery", "failed"),
            disposition: {
              status: "rejected",
              commandId: command.commandId,
              reason: "invalid-state",
            },
          };
        }
        return accepted(
          command,
          withEffect(
            {
              ...intentState,
              pendingTurns: state.pendingTurns.map((turn) =>
                turn.submissionId === next.submissionId
                  ? { ...turn, state: "dispatched", terminalAt: now }
                  : turn,
              ),
            },
            effectId,
            "turn-delivery",
            "completed",
          ),
          {
            type: "submission.changed",
            commandId: command.commandId,
            submissionId: next.submissionId,
            state: "dispatched",
            intent: "queue",
          },
        );
      }
      const frozenAgents = [...new Set([...state.frozenAgents, command.targetAgentId])];
      const attentionId = OnTheGoAttentionId.make(`queue:${command.targetAgentId}`);
      const alreadyAttention = state.attention.some(
        (item) => item.attentionId === attentionId && item.resolvedAt === null,
      );
      const affectedChatId =
        state.pendingTurns.find(
          (turn) =>
            turn.targetAgentId === command.targetAgentId && activePendingStates.has(turn.state),
        )?.targetChatId ?? command.targetAgentId;
      const affectedPendingCount = state.pendingTurns.filter(
        (turn) =>
          turn.targetAgentId === command.targetAgentId && activePendingStates.has(turn.state),
      ).length;
      return accepted(command, {
        ...state,
        frozenAgents,
        pendingTurns: state.pendingTurns.map((turn) =>
          turn.targetAgentId === command.targetAgentId && turn.state === "queued"
            ? { ...turn, state: "frozen" }
            : turn,
        ),
        attention: alreadyAttention
          ? state.attention
          : state.attention.some((item) => item.attentionId === attentionId)
            ? state.attention.map((item) =>
                item.attentionId === attentionId
                  ? {
                      ...item,
                      chatId: affectedChatId,
                      kind: command.outcome === "failure" ? "failure" : "input",
                      safeSummary: `${affectedPendingCount} pending prompt${affectedPendingCount === 1 ? "" : "s"} paused after ${command.outcome}`,
                      createdAt: now,
                      resolvedAt: null,
                    }
                  : item,
              )
            : [
                ...state.attention,
                {
                  attentionId,
                  responseId: null,
                  chatId: affectedChatId,
                  kind: command.outcome === "failure" ? "failure" : "input",
                  safeSummary: `${affectedPendingCount} pending prompt${affectedPendingCount === 1 ? "" : "s"} paused after ${command.outcome}`,
                  createdAt: now,
                  resolvedAt: null,
                },
              ],
        attentionBadge: state.attentionBadge + (alreadyAttention ? 0 : 1),
        lastToneAt: now,
        lastTone: "attention",
        reminderTone: "attention",
      });
    }
    case "scheduler.tick":
      return dispatchOnTheGoFoundation(
        state,
        {
          type: "turn.complete",
          commandId: command.commandId,
          deviceId: command.deviceId,
          targetAgentId: command.targetAgentId,
          outcome: "compatible",
          activeTurnId: "scheduler",
        },
        ports,
        persistIntent,
      );
    case "queue.retry": {
      const submissions = state.pendingTurns.filter(
        (turn) => turn.targetAgentId === command.targetAgentId,
      );
      const relevantEffects = state.effectOutbox.filter(
        (effect) =>
          (effect.status === "pending" || effect.status === "unknown") &&
          submissions.some(
            (turn) =>
              effect.effectId.includes(turn.submissionId) || effect.resultRef === turn.submissionId,
          ),
      );
      let reconciledState = state;
      let completed = 0;
      let failed = 0;
      let unknown = 0;
      const lifecycleEvents: Array<FoundationEventInput> = [];
      for (const effect of relevantEffects) {
        const result = ports.turnDelivery.reconcile(effect.effectId);
        if (result.disposition === "completed") completed += 1;
        else if (result.disposition === "failed") failed += 1;
        else unknown += 1;
        reconciledState = withEffect(
          reconciledState,
          effect.effectId,
          effect.kind,
          result.disposition,
          effect.requestHash ?? undefined,
          result.disposition === "completed" ? "reconciled" : undefined,
        );
        const submission = submissions.find(
          (turn) =>
            effect.effectId.includes(turn.submissionId) || effect.resultRef === turn.submissionId,
        );
        if (submission) {
          const reconciledTurnState: OnTheGoPendingTurn["state"] =
            result.disposition === "completed"
              ? submission.intent === "steer"
                ? "steered"
                : "dispatched"
              : result.disposition === "failed"
                ? "frozen"
                : "unknown-outcome";
          reconciledState = {
            ...reconciledState,
            pendingTurns: reconciledState.pendingTurns.map((turn) =>
              turn.submissionId === submission.submissionId
                ? {
                    ...turn,
                    state: reconciledTurnState,
                    terminalAt: terminalPendingStates.has(reconciledTurnState) ? now : null,
                  }
                : turn,
            ),
          };
          lifecycleEvents.push({
            type: "submission.changed",
            commandId: command.commandId,
            submissionId: submission.submissionId,
            state: reconciledTurnState,
            intent: submission.intent,
          });
        }
      }
      return accepted(
        command,
        {
          ...reconciledState,
          lastRecoverySummary: `Reconciled ${completed} completed, ${failed} failed, ${unknown} unknown effects; queued work remains gated`,
        },
        lifecycleEvents.length > 0
          ? lifecycleEvents
          : { type: "queue.changed", commandId: command.commandId },
      );
    }
    case "queue.continue": {
      if (!state.frozenAgents.includes(command.targetAgentId)) return fail("not-found");
      const pendingCount = state.pendingTurns.filter(
        (turn) => turn.targetAgentId === command.targetAgentId && turn.state === "frozen",
      ).length;
      if (pendingCount !== command.expectedPendingCount) return fail("confirmation-target-changed");
      return accepted(
        command,
        {
          ...state,
          consumedConfirmations: [...state.consumedConfirmations, command.confirmationId],
          frozenAgents: state.frozenAgents.filter((id) => id !== command.targetAgentId),
          pendingTurns: state.pendingTurns.map((turn) =>
            turn.targetAgentId === command.targetAgentId && turn.state === "frozen"
              ? { ...turn, state: "queued", terminalAt: null }
              : turn,
          ),
        },
        { type: "queue.changed", commandId: command.commandId },
      );
    }
    case "theo.context.fetch": {
      const fetched = ports.contextFetch.fetch(command.source, command.reference);
      if (fetched._tag === "Denied")
        return fail(fetched.reason === "egress" ? "egress-incompatible" : "policy-denied");
      if (fetched.ownerScope !== command.ownerScope) return fail("confirmation-target-changed");
      return accepted(command, {
        ...state,
        contextEvidence: [
          ...state.contextEvidence,
          {
            source: command.source,
            reference: command.reference,
            ownerScope: fetched.ownerScope,
            sourceVersion: command.sourceVersion,
            contentHash: contentHash(fetched.excerpt),
            instructionWarning: /ignore (all|any|the) (prior|previous) instructions?/i.test(
              fetched.excerpt,
            ),
            fetchedAt: now,
          },
        ],
      });
    }
    case "agent.handoff.create": {
      const prompt = state.prompts.find((item) => item.promptId === command.promptId);
      const revision = prompt?.revisions.find(
        (item) => item.revisionId === prompt.activeRevisionId,
      );
      if (!prompt || !revision) return fail("not-found");
      if (revision.targetAgentId !== command.agentId) return fail("confirmation-target-changed");
      if (revision.targetChatId !== command.sourceScope) return fail("confirmation-target-changed");
      if (revision.readiness !== "ready" || revision.authorizedAt === null)
        return fail("revision-not-ready");
      if (command.sharedWritable && command.sharedWriteConfirmationId === null)
        return fail("shared-write-confirmation-required");
      const effectId = `handoff:${command.promptId}:${revision.revisionId}`;
      const priorEffect = state.effectOutbox.find((effect) => effect.effectId === effectId);
      if (priorEffect?.status === "completed")
        return accepted(
          command,
          command.sharedWriteConfirmationId === null
            ? state
            : {
                ...state,
                consumedConfirmations: [
                  ...state.consumedConfirmations,
                  command.sharedWriteConfirmationId,
                ],
              },
        );
      if (priorEffect && priorEffect.status !== "failed") {
        const reconciled = ports.handoffBuilder.reconcile(effectId);
        if (reconciled._tag === "Success") {
          return accepted(command, {
            ...withEffect(
              state,
              effectId,
              "agent-workspace",
              "completed",
              priorEffect.requestHash ?? undefined,
              reconciled.worktreeName,
            ),
            agentHandoffs: state.agentHandoffs.some(
              (handoff) => handoff.worktreeName === reconciled.worktreeName,
            )
              ? state.agentHandoffs
              : [
                  ...state.agentHandoffs,
                  {
                    agentId: command.agentId,
                    worktreeName: reconciled.worktreeName,
                    promptId: command.promptId,
                    revisionId: revision.revisionId,
                    sourceScope: revision.targetChatId,
                    includedReferences: reconciled.includedReferences,
                    sharedWritable: command.sharedWritable,
                  },
                ],
            pendingTurns: state.pendingTurns.map((turn) =>
              turn.promptId === command.promptId && turn.revisionId === revision.revisionId
                ? { ...turn, workspaceReady: true }
                : turn,
            ),
          });
        }
        return {
          state:
            reconciled._tag === "Failed"
              ? withEffect(state, effectId, "agent-workspace", "failed")
              : state,
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "unknown-outcome",
          },
        };
      }
      const handoffRequestHash = contentHash(
        JSON.stringify([
          revision.content,
          revision.targetChatId,
          command.references,
          command.sharedWritable,
        ]),
      );
      const authorizationState =
        command.sharedWriteConfirmationId === null
          ? state
          : {
              ...state,
              consumedConfirmations: [
                ...state.consumedConfirmations,
                command.sharedWriteConfirmationId,
              ],
            };
      const handoffIntentState = withEffect(
        authorizationState,
        effectId,
        "agent-workspace",
        "pending",
        handoffRequestHash,
      );
      persistIntent(handoffIntentState);
      const built = ports.handoffBuilder.create({
        effectId,
        agentId: command.agentId,
        prompt: revision.content,
        targetChatId: revision.targetChatId,
        references: command.references,
        sharedWritable: command.sharedWritable,
      });
      if (built._tag === "Denied") {
        return {
          state: withEffect(
            handoffIntentState,
            effectId,
            "agent-workspace",
            "failed",
            handoffRequestHash,
          ),
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "policy-denied",
          },
        };
      }
      return accepted(command, {
        ...withEffect(
          handoffIntentState,
          effectId,
          "agent-workspace",
          "completed",
          handoffRequestHash,
          built.worktreeName,
        ),
        agentHandoffs: [
          ...handoffIntentState.agentHandoffs,
          {
            agentId: command.agentId,
            worktreeName: built.worktreeName,
            promptId: command.promptId,
            revisionId: revision.revisionId,
            sourceScope: revision.targetChatId,
            includedReferences: built.includedReferences,
            sharedWritable: command.sharedWritable,
          },
        ],
        pendingTurns: handoffIntentState.pendingTurns.map((turn) =>
          turn.promptId === command.promptId && turn.revisionId === revision.revisionId
            ? { ...turn, workspaceReady: true }
            : turn,
        ),
      });
    }
    case "model.use": {
      const selected = ports.modelPolicy.select({
        capability: command.capability,
        providerId: command.providerId,
        modelId: command.modelId,
      });
      if (selected._tag === "Denied") return fail(selected.reason);
      if (selected.fallback) {
        const effectId = `fallback:${command.commandId}`;
        const priorEffect = state.effectOutbox.find((effect) => effect.effectId === effectId);
        if (priorEffect?.status === "completed") return accepted(command, state);
        if (priorEffect) {
          return {
            state,
            disposition: {
              status: "rejected",
              commandId: command.commandId,
              reason: "unknown-outcome",
            },
          };
        }
        const fallbackRendering = `Using approved fallback ${selected.modelId}`;
        const fallbackHash = contentHash(fallbackRendering);
        persistIntent(withEffect(state, effectId, "speech", "pending", fallbackHash));
        ports.audioOutput.speak(fallbackRendering);
        state = withEffect(state, effectId, "speech", "completed", fallbackHash, "spoken");
      }
      return accepted(command, {
        ...state,
        modelUsage: [
          ...state.modelUsage,
          {
            capability: command.capability,
            providerId: selected.providerId,
            modelId: selected.modelId,
            fallback: selected.fallback,
            at: now,
          },
        ],
      });
    }
    case "audio.render": {
      const focus = ports.audioFocus.current();
      const effectId = `audio:${command.commandId}`;
      const priorEffect = state.effectOutbox.find((effect) => effect.effectId === effectId);
      if (priorEffect?.status === "completed") return accepted(command, state);
      if (priorEffect) {
        return {
          state,
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "unknown-outcome",
          },
        };
      }
      persistIntent(withEffect(state, effectId, "speech", "pending"));
      if (focus === "call") {
        ports.audioOutput.stop();
        return {
          state: withEffect(state, effectId, "speech", "completed"),
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "invalid-state",
          },
        };
      }
      if (focus === "navigation" || focus === "alarm") {
        ports.audioOutput.pause();
        return {
          state: withEffect(state, effectId, "speech", "completed"),
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "invalid-state",
          },
        };
      }
      const rendering = ports.audioPolicy.render({
        privateDetail: command.privateDetail,
        publicSummary: command.publicSummary,
      });
      if (focus === "media") ports.audioOutput.duck();
      ports.audioOutput.speak(rendering);
      return accepted(command, {
        ...withEffect(state, effectId, "speech", "completed"),
        speechCache: [
          ...state.speechCache,
          { cacheId: command.cacheId, scope: command.scope, expiresAt: plus(now, { hours: 24 }) },
        ],
      });
    }
    case "effects.reconcile": {
      let reconciledState = state;
      let completed = 0;
      let failed = 0;
      let unknown = 0;
      for (const effect of state.effectOutbox) {
        if (effect.status !== "pending" && effect.status !== "unknown") continue;
        if (effect.kind === "speech") {
          const result = ports.audioOutput.reconcile(effect.effectId);
          if (result.disposition === "completed") completed += 1;
          else if (result.disposition === "failed") failed += 1;
          else unknown += 1;
          reconciledState = withEffect(
            reconciledState,
            effect.effectId,
            effect.kind,
            result.disposition,
            effect.requestHash ?? undefined,
            result.disposition === "completed" ? "reconciled" : undefined,
          );
          continue;
        }
        if (effect.kind === "turn-delivery" && effect.effectId.startsWith("delete:")) {
          const result = ports.turnDelivery.reconcile(effect.effectId);
          if (result.disposition === "unknown") {
            unknown += 1;
            continue;
          }
          if (result.disposition === "completed") completed += 1;
          else failed += 1;
          reconciledState = withEffect(
            reconciledState,
            effect.effectId,
            effect.kind,
            "failed",
            effect.requestHash ?? undefined,
            "deletion-interrupt-reconciled-requires-fresh-confirmation",
          );
        }
      }
      return accepted(command, {
        ...reconciledState,
        lastRecoverySummary: `Reconciled ${completed} completed, ${failed} failed, ${unknown} unknown non-turn effects`,
      });
    }
    case "effect.abandon": {
      const effect = state.effectOutbox.find((item) => item.effectId === command.effectId);
      if (!effect || (effect.status !== "pending" && effect.status !== "unknown"))
        return fail("not-found");
      return accepted(command, {
        ...withEffect(
          state,
          effect.effectId,
          effect.kind,
          "failed",
          effect.requestHash ?? undefined,
          "explicitly-abandoned",
        ),
        consumedConfirmations: [...state.consumedConfirmations, command.confirmationId],
      });
    }
    case "data.export-preview": {
      const counts = [
        `responses:${state.responses.filter((item) => item.projectId === command.scope || item.chatId === command.scope).length}`,
        `attention:${state.attention.filter((item) => item.chatId === command.scope).length}`,
        `prompts:${state.prompts.filter((item) => item.revisions.some((revision) => revision.targetChatId === command.scope)).length}`,
      ];
      return accepted(command, { ...state, lastExportPreview: counts });
    }
    case "data.inspect":
      return accepted(command, {
        ...state,
        lastInspection: [
          `responses:${state.responses.filter((item) => item.projectId === command.scope || item.chatId === command.scope).length}`,
          `pending:${state.pendingTurns.filter((item) => item.targetChatId === command.scope && activePendingStates.has(item.state)).length}`,
          `evidence:${state.contextEvidence.filter((item) => item.ownerScope === command.scope).length}`,
        ],
      });
    case "data.diagnostics":
      return accepted(command, {
        ...state,
        diagnostics: [
          `responses:${state.responses.length}`,
          `attention:${state.attention.length}`,
          `pending:${state.pendingTurns.length}`,
          `outbox-pending:${state.effectOutbox.filter((effect) => effect.status === "pending").length}`,
        ],
      });
    case "data.reset": {
      if (command.scope === "profile")
        return accepted(command, {
          ...state,
          profileHistory: [initialOnTheGoFoundationState().profileHistory[0]!],
          activeProfileVersion: 0,
          profileLayers: [initialOnTheGoFoundationState().profileLayers[0]!],
          profileEvidenceCandidates: [],
          profileConflictQuestion: null,
        });
      const hasUnknownWork =
        state.pendingTurns.some((turn) => turn.state === "unknown-outcome") ||
        state.effectOutbox.some(
          (effect) => effect.status === "pending" || effect.status === "unknown",
        );
      if (hasUnknownWork) return fail("unknown-outcome");
      if (
        command.confirmationId === null ||
        command.expectedPendingCount !==
          state.pendingTurns.filter((turn) => activePendingStates.has(turn.state)).length
      )
        return fail("confirmation-target-changed");
      const resetLifecycleTombstones = [
        ...state.lifecycleTombstones,
        ...state.pendingTurns.map((turn) => ({
          submissionId: turn.submissionId,
          contentHash: turn.contentHash,
          disposition: "reset",
          expiresAt: plus(now, { days: 90 }),
        })),
      ];
      const resetPrompts = state.prompts.map((prompt) => ({
        ...prompt,
        revisions: prompt.revisions.map((revision) =>
          state.pendingTurns.some(
            (turn) => turn.promptId === prompt.promptId && turn.revisionId === revision.revisionId,
          )
            ? { ...revision, readiness: "draft" as const, authorizedAt: null }
            : revision,
        ),
      }));
      if (command.scope === "queues") {
        return accepted(command, {
          ...state,
          responses: [],
          attention: [],
          pendingTurns: [],
          responseBadge: 0,
          attentionBadge: 0,
          selectedResponseId: null,
          announcementHistory: [],
          frozenAgents: [],
          prompts: resetPrompts,
          lifecycleTombstones: resetLifecycleTombstones,
          consumedConfirmations: [...state.consumedConfirmations, command.confirmationId],
          effectOutbox: state.effectOutbox.filter(
            (effect) =>
              !state.pendingTurns.some(
                (turn) =>
                  effect.effectId.includes(turn.submissionId) ||
                  effect.resultRef === turn.submissionId,
              ),
          ),
        });
      }
      const reset = initialOnTheGoFoundationState();
      return accepted(command, {
        ...reset,
        deletionTombstones: state.deletionTombstones,
        lifecycleTombstones: resetLifecycleTombstones,
        consumedConfirmations: [...state.consumedConfirmations, command.confirmationId],
      });
    }
    case "data.delete": {
      const effectId = `delete:${command.commandId}`;
      const priorEffect = state.effectOutbox.find((effect) => effect.effectId === effectId);
      if (priorEffect?.status === "completed") return accepted(command, state);
      if (priorEffect) {
        return {
          state,
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "unknown-outcome",
          },
        };
      }
      const scopedTurns = state.pendingTurns.filter(
        (turn) => turn.targetChatId === command.scope && activePendingStates.has(turn.state),
      );
      if (scopedTurns.length !== command.expectedPendingCount)
        return fail("confirmation-target-changed");
      const frozenState: OnTheGoFoundationState = {
        ...state,
        pendingTurns: state.pendingTurns.map((turn) =>
          turn.targetChatId === command.scope && turn.state === "queued"
            ? { ...turn, state: "frozen" }
            : turn,
        ),
        frozenAgents: [
          ...new Set([...state.frozenAgents, ...scopedTurns.map((turn) => turn.targetAgentId)]),
        ],
      };
      const intentState = withEffect(frozenState, effectId, "turn-delivery", "pending");
      const authorizedIntentState = {
        ...intentState,
        consumedConfirmations: [...intentState.consumedConfirmations, command.confirmationId],
      };
      persistIntent(authorizedIntentState);
      const interruption = ports.turnDelivery.interruptForDeletion({
        scope: command.scope,
        expectedActiveTurnId: command.expectedActiveTurnId,
      });
      if (interruption.disposition === "unknown") {
        const attentionId = OnTheGoAttentionId.make(`delete:${command.scope}`);
        return {
          state: {
            ...withEffect(authorizedIntentState, effectId, "turn-delivery", "unknown"),
            attention: [
              ...authorizedIntentState.attention,
              {
                attentionId,
                responseId: null,
                chatId: command.scope,
                kind: "failure",
                safeSummary: "Deletion paused because the active turn outcome is unknown",
                createdAt: now,
                resolvedAt: null,
              },
            ],
            attentionBadge: authorizedIntentState.attentionBadge + 1,
          },
          disposition: {
            status: "rejected",
            commandId: command.commandId,
            reason: "unknown-outcome",
          },
        };
      }
      const removedResponses = state.responses.filter(
        (item) => item.projectId === command.scope || item.chatId === command.scope,
      );
      const removedAttention = state.attention.filter((item) => item.chatId === command.scope);
      const removedTurns = state.pendingTurns.filter((item) => item.targetChatId === command.scope);
      return accepted(command, {
        ...withEffect(authorizedIntentState, effectId, "turn-delivery", "completed"),
        responses: state.responses.filter(
          (item) => item.projectId !== command.scope && item.chatId !== command.scope,
        ),
        attention: state.attention.filter((item) => item.chatId !== command.scope),
        prompts: state.prompts.filter(
          (item) => !item.revisions.some((revision) => revision.targetChatId === command.scope),
        ),
        pendingTurns: state.pendingTurns.filter((item) => item.targetChatId !== command.scope),
        contextEvidence: state.contextEvidence.filter((item) => item.ownerScope !== command.scope),
        agentHandoffs: state.agentHandoffs.filter((item) => item.sourceScope !== command.scope),
        speechCache: state.speechCache.filter((item) => item.scope !== command.scope),
        responseBadge: Math.max(
          0,
          state.responseBadge - removedResponses.filter((item) => item.handledAt === null).length,
        ),
        attentionBadge: Math.max(
          0,
          state.attentionBadge - removedAttention.filter((item) => item.resolvedAt === null).length,
        ),
        announcementHistory: state.announcementHistory.filter(
          (id) => !removedResponses.some((item) => item.responseId === id),
        ),
        selectedResponseId: removedResponses.some(
          (item) => item.responseId === state.selectedResponseId,
        )
          ? null
          : state.selectedResponseId,
        lifecycleTombstones: [
          ...state.lifecycleTombstones,
          ...removedTurns.map((turn) => ({
            submissionId: turn.submissionId,
            contentHash: turn.contentHash,
            disposition: turn.state,
            expiresAt: plus(now, { days: 90 }),
          })),
        ],
        deletionTombstones: [
          ...state.deletionTombstones,
          { scope: command.scope, deletedAt: now, expiresAt: plus(now, { days: 90 }) },
        ],
      });
    }
  }
};
