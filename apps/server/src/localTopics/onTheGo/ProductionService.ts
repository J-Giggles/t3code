// @effect-diagnostics globalTimers:off - A real completion may be held until its correction window expires.
import {
  OnTheGoDeviceId,
  OnTheGoResponseId,
  type OnTheGoCommand,
  type OnTheGoCommandDisposition,
  type OnTheGoEvent,
  type OnTheGoFoundationCommand,
  type OnTheGoReadScope,
  type OnTheGoSettings,
  type OnTheGoSnapshot,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { redactSensitiveText } from "@t3tools/shared/sensitiveText";

import { isOnTheGoFoundationCommand, onTheGoFoundationCommandRegistry } from "./CommandRegistry.ts";
import type { OnTheGoPersistence, OnTheGoRuntimePorts } from "./Ports.ts";
import type { OnTheGoTurnDeliveryRequest } from "./Ports.ts";
import { makeOnTheGoRuntime } from "./Runtime.ts";

export interface OnTheGoServerServiceOptions {
  readonly persistence: OnTheGoPersistence;
  readonly now: () => string;
}

export interface OnTheGoSessionBinding {
  readonly durablePrincipalId: string;
  readonly legacySessionIds?: ReadonlyArray<string>;
}

export const makeOnTheGoDurablePrincipalId = (input: {
  readonly subject: string;
  readonly method: string;
  readonly proofKeyThumbprint?: string;
}) =>
  JSON.stringify([
    "on-the-go-principal-v1",
    input.subject,
    input.method,
    input.proofKeyThumbprint ?? null,
  ]);

export interface OnTheGoServerService {
  readonly dispose: () => void;
  readonly setTurnExecutor: (
    executor: (request: OnTheGoTurnDeliveryRequest) => Promise<void>,
  ) => void;
  readonly configureModelPolicy: (settings: OnTheGoSettings) => void;
  readonly recordAssistantResponse: (input: {
    readonly threadId: string;
    readonly messageId: string;
    readonly text: string;
    readonly completedAt: string;
  }) => void;
  readonly recordAgentCheckpoint: (input: {
    readonly checkpointId: string;
    readonly chatId: string;
    readonly kind:
      | "started"
      | "progress"
      | "file-changed"
      | "tests"
      | "approval"
      | "blocked"
      | "completed"
      | "failed";
    readonly summary: string;
    readonly evidence: string;
    readonly occurredAt: string;
  }) => void;
  readonly recordThreadLifecycle: (input: {
    readonly threadId: string;
    readonly eventId: string;
    readonly lifecycle: "archived" | "deleted";
  }) => void;
  readonly recordContextEvidence: (input: {
    readonly deviceId: OnTheGoDeviceId;
    readonly source: string;
    readonly reference: string;
    readonly sourceVersion: string;
    readonly ownerScope: string;
    readonly excerpt: string;
  }) => OnTheGoCommandDisposition;
  readonly consumeRemoteModelCall: (
    authenticatedSessionId: string,
    scope: OnTheGoReadScope,
    budget: { readonly warningAt: number; readonly hardLimit: number },
  ) =>
    | { readonly allowed: true; readonly used: number; readonly warning: boolean }
    | {
        readonly allowed: false;
        readonly used: number;
        readonly reason: "budget-exhausted" | "policy-denied";
      };
  readonly connect: (
    authenticatedSessionId: string,
    scope: OnTheGoReadScope,
    binding?: OnTheGoSessionBinding,
  ) => void;
  readonly disconnect: (authenticatedSessionId: string) => void;
  readonly dispatchClient: (
    authenticatedSessionId: string,
    command: OnTheGoCommand,
  ) => OnTheGoCommandDisposition;
  readonly dispatchSystem: (command: OnTheGoFoundationCommand) => OnTheGoCommandDisposition;
  readonly snapshot: (authenticatedSessionId: string, scope: OnTheGoReadScope) => OnTheGoSnapshot;
  readonly events: (
    authenticatedSessionId: string,
    scope: OnTheGoReadScope,
  ) => ReadonlyArray<OnTheGoEvent>;
  readonly subscribe: (
    authenticatedSessionId: string,
    scope: OnTheGoReadScope,
    listener: (event: OnTheGoEvent) => void,
  ) => () => void;
}

const scopeKey = (scope: OnTheGoReadScope) =>
  JSON.stringify([scope.voiceSessionId, scope.deviceId]);

export const safeAnnouncementSummary = (text: string) => {
  const prose = redactSensitiveText(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(at\s+|[+\-@]{2,}|error:|stack:)/i.test(line) &&
        !/(?:api[_ -]?key|token|password|passwd|secret|authorization|credential).*(?:\[redacted\]|\[provider token redacted\]|\[private key redacted\])/i.test(
          line,
        ),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return (prose || "The coding agent finished without a safe spoken summary").slice(0, 500);
};

export const makeOnTheGoServerService = (
  options: OnTheGoServerServiceOptions,
): OnTheGoServerService => {
  const trustedDevices = new Set<OnTheGoDeviceId>();
  const authorizedScopes = new Set<string>();
  const sessionScopes = new Map<string, string>();
  const deviceSessions = new Map<OnTheGoDeviceId, string>();
  const dispositions = new Map<string, OnTheGoCommandDisposition>();
  const subscribers = new Set<{
    readonly scope: string;
    readonly listener: (event: OnTheGoEvent) => void;
  }>();
  const completionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const availableContext = new Map<
    string,
    { readonly ownerScope: string; readonly excerpt: string }
  >();
  const remoteModelCalls = new Map<string, number>();
  const agentOutcomes = new Map<string, "failed" | "decision-required">();
  let configuredModels: Readonly<
    Record<
      "transcription" | "reasoning" | "speech",
      {
        readonly primary: string;
        readonly fallbacks: ReadonlySet<string>;
      }
    >
  > | null = null;
  let turnExecutor: ((request: OnTheGoTurnDeliveryRequest) => Promise<void>) | null = null;
  let dispatchWithEvents: (command: OnTheGoCommand) => OnTheGoCommandDisposition;
  const followQuietTimer = setInterval(() => {
    const deviceId = trustedDevices.values().next().value;
    if (!deviceId || !dispatchWithEvents) return;
    dispatchWithEvents({
      type: "follow.quiet-tick",
      commandId: `follow-quiet:${options.now()}` as OnTheGoCommand["commandId"],
      deviceId,
    });
  }, 30_000);
  followQuietTimer.unref?.();

  const resolveDelivery = (
    request: OnTheGoTurnDeliveryRequest,
    outcome: "dispatched" | "failed" | "unknown",
  ) => {
    const deviceId = trustedDevices.values().next().value;
    if (!deviceId) return;
    dispatchWithEvents({
      type: "delivery.resolve",
      commandId: `${request.submissionId}:${outcome}` as OnTheGoCommand["commandId"],
      deviceId,
      submissionId: request.submissionId,
      outcome,
    });
  };

  const ports: OnTheGoRuntimePorts = {
    authorization: { canRead: (scope) => authorizedScopes.has(scopeKey(scope)) },
    capabilities: { isModeAvailable: () => true },
    clock: { now: options.now },
    commandModel: { resolve: () => ({ _tag: "NoMatch" }) },
    audioOutput: {
      speak: () => undefined,
      stop: () => undefined,
      duck: () => undefined,
      pause: () => undefined,
      reconcile: () => ({ disposition: "failed" }),
    },
    audioFocus: { current: () => "available" },
    audioPolicy: {
      render: ({ publicSummary }) => publicSummary,
    },
    contextFetch: {
      fetch: (source, reference) => {
        const evidence = availableContext.get(`${source}:${reference}`);
        return evidence
          ? { _tag: "Success", ownerScope: evidence.ownerScope, excerpt: evidence.excerpt }
          : { _tag: "Denied", reason: "authorization" };
      },
    },
    connectivity: { isOnline: () => true },
    turnDelivery: {
      deliver: (request) => {
        if (!turnExecutor) return { disposition: "rejected" };
        const current = options.persistence.load()?.foundation;
        const pending = current?.pendingTurns.find(
          (turn) => turn.submissionId === request.submissionId,
        );
        const handoff = pending
          ? current?.agentHandoffs.find(
              (candidate) =>
                candidate.promptId === pending.promptId &&
                candidate.revisionId === pending.revisionId,
            )
          : undefined;
        const deliveryRequest = handoff
          ? {
              ...request,
              handoff: {
                sourceChatId: handoff.sourceScope,
                worktreeName: handoff.worktreeName,
                includedReferences: handoff.includedReferences,
              },
            }
          : request;
        void turnExecutor(deliveryRequest).then(
          () => resolveDelivery(request, "dispatched"),
          () => resolveDelivery(request, "unknown"),
        );
        return {
          disposition:
            request.intent === "steer"
              ? "steered"
              : request.intent === "interrupt-and-replace"
                ? "interrupted"
                : "queued",
        };
      },
      canSteer: (activeTurnId) => activeTurnId.trim().length > 0,
      reconcile: () => ({ disposition: "failed" }),
      interruptForDeletion: () => ({ disposition: "no-active" }),
    },
    handoffBuilder: {
      create: (request) => {
        if (
          request.sharedWritable ||
          request.references.some((reference) =>
            /secret|token|password|api[_ -]?key/i.test(reference),
          )
        ) {
          return { _tag: "Denied" };
        }
        const includedReferences = request.references.filter(
          (reference) =>
            reference.includes(request.targetChatId) || reference.startsWith("project:"),
        );
        return {
          _tag: "Success",
          worktreeName: `dev-${request.agentId
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-|-$/g, "")
            .toLocaleLowerCase()}`,
          includedReferences,
        };
      },
      reconcile: () => ({ _tag: "Failed" }),
    },
    modelPolicy: {
      select: ({ capability, providerId, modelId }) => {
        const policy = configuredModels?.[capability];
        const identity = `${providerId}/${modelId}`;
        if (!policy) return { _tag: "Denied", reason: "fallback-not-approved" };
        if (policy.primary === identity) {
          return { _tag: "Selected", providerId, modelId, fallback: false };
        }
        if (policy.fallbacks.has(identity)) {
          return { _tag: "Selected", providerId, modelId, fallback: true };
        }
        return { _tag: "Denied", reason: "fallback-not-approved" };
      },
    },
    reconciliation: { canMarkReady: () => true },
    deviceTrust: { isTrusted: (deviceId) => trustedDevices.has(deviceId) },
    persistence: {
      ...options.persistence,
      loadDisposition: (commandId) =>
        options.persistence.loadDisposition(commandId) ?? dispositions.get(commandId) ?? null,
      saveDisposition: (commandId, disposition) => {
        dispositions.set(commandId, disposition);
        options.persistence.saveDisposition(commandId, disposition);
      },
    },
    providerCheckpoints: { read: () => [] },
    wakeDetection: {
      resolve: (phrase) => {
        const normalized = phrase.trim().toLocaleLowerCase();
        if (normalized === "t3") return "command";
        if (normalized === "hey theo") return "theo-conversation";
        return null;
      },
    },
    rawAudio: { discard: () => undefined },
    transcription: { transcribe: () => ({ _tag: "Failure" }) },
    theoModel: { generate: () => ({ _tag: "Failure" }) },
  };
  const runtime = makeOnTheGoRuntime(ports);

  dispatchWithEvents = (command: OnTheGoCommand) => {
    const beforeCount = options.persistence.load()?.eventLog?.length ?? 0;
    const disposition = runtime.dispatch(command);
    const after = options.persistence.load()?.eventLog ?? [];
    for (const event of after.slice(beforeCount)) {
      for (const subscriber of subscribers) {
        if (authorizedScopes.has(subscriber.scope)) subscriber.listener(event);
      }
    }
    return disposition;
  };

  const recordCompatibleCompletion = (input: {
    readonly targetAgentId: string;
    readonly activeTurnId: string;
    readonly completionId: string;
  }) => {
    const deviceId = trustedDevices.values().next().value;
    if (!deviceId) return;
    dispatchWithEvents({
      type: "turn.complete",
      commandId: `turn-complete:${input.completionId}` as OnTheGoCommand["commandId"],
      deviceId,
      targetAgentId: input.targetAgentId,
      outcome: "compatible",
      activeTurnId: input.activeTurnId,
    });
    const queued = options.persistence
      .load()
      ?.foundation?.pendingTurns.find(
        (turn) =>
          turn.targetAgentId === input.targetAgentId &&
          turn.state === "queued" &&
          turn.workspaceReady,
      );
    if (!queued || Date.parse(queued.correctionExpiresAt) < Date.parse(options.now())) return;
    if (completionTimers.has(queued.submissionId)) return;
    const delay = Math.max(
      0,
      Date.parse(queued.correctionExpiresAt) - Date.parse(options.now()) + 1,
    );
    const timer = setTimeout(() => {
      completionTimers.delete(queued.submissionId);
      const current = options.persistence
        .load()
        ?.foundation?.pendingTurns.find((turn) => turn.submissionId === queued.submissionId);
      if (current?.state !== "queued" || !current.workspaceReady) return;
      dispatchWithEvents({
        type: "turn.complete",
        commandId:
          `turn-complete:${input.completionId}:${queued.submissionId}` as OnTheGoCommand["commandId"],
        deviceId,
        targetAgentId: input.targetAgentId,
        outcome: "compatible",
        activeTurnId: input.activeTurnId,
      });
    }, delay);
    completionTimers.set(queued.submissionId, timer);
  };

  const assertAuthorized = (authenticatedSessionId: string, scope: OnTheGoReadScope) => {
    if (sessionScopes.get(authenticatedSessionId) !== scopeKey(scope)) {
      throw new Error("On-the-Go scope is not authorized");
    }
  };

  return {
    dispose: () => {
      clearInterval(followQuietTimer);
      for (const timer of completionTimers.values()) clearTimeout(timer);
      completionTimers.clear();
      subscribers.clear();
      authorizedScopes.clear();
      sessionScopes.clear();
      deviceSessions.clear();
      trustedDevices.clear();
      remoteModelCalls.clear();
      agentOutcomes.clear();
      configuredModels = null;
      availableContext.clear();
      turnExecutor = null;
    },
    setTurnExecutor: (executor) => {
      turnExecutor = executor;
    },
    configureModelPolicy: (settings) => {
      const capabilityPolicy = <Capability extends "transcription" | "reasoning" | "speech">(
        capability: Capability,
        primary:
          | OnTheGoSettings["transcriptionModel"]
          | OnTheGoSettings["theoModel"]
          | OnTheGoSettings["speechModel"],
      ) => ({
        primary: `${primary.providerId}/${primary.modelId}`,
        fallbacks: new Set(
          settings.fallbackModels[capability].map(
            (fallback) => `${fallback.providerId}/${fallback.modelId}`,
          ),
        ),
      });
      configuredModels = {
        transcription: capabilityPolicy("transcription", settings.transcriptionModel),
        reasoning: capabilityPolicy("reasoning", settings.theoModel),
        speech: capabilityPolicy("speech", settings.speechModel),
      };
    },
    recordAssistantResponse: ({ threadId, messageId, text, completedAt }) => {
      const deviceId =
        trustedDevices.values().next().value ?? OnTheGoDeviceId.make("system:on-the-go");
      const expiresAt = DateTime.formatIso(
        DateTime.add(DateTime.makeUnsafe(completedAt), { days: 30 }),
      );
      const outcome = agentOutcomes.get(threadId) ?? "completed";
      dispatchWithEvents({
        type: "response.record",
        commandId: `response:${messageId}` as OnTheGoCommand["commandId"],
        deviceId,
        response: {
          responseId: OnTheGoResponseId.make(`response:${messageId}`),
          projectId: "t3-code",
          chatId: threadId,
          agentId: threadId,
          outcome,
          safeSummary: safeAnnouncementSummary(text),
          completedAt,
          handledAt: null,
          expiresAt,
        },
      });
      if (outcome === "completed") {
        recordCompatibleCompletion({
          targetAgentId: threadId,
          activeTurnId: messageId,
          completionId: messageId,
        });
      }
    },
    recordAgentCheckpoint: (checkpoint) => {
      const deviceId =
        trustedDevices.values().next().value ?? OnTheGoDeviceId.make("system:on-the-go");
      dispatchWithEvents({
        type: "follow.checkpoint.record",
        commandId: `follow:${checkpoint.checkpointId}` as OnTheGoCommand["commandId"],
        deviceId,
        checkpoint: {
          ...checkpoint,
          summary: safeAnnouncementSummary(checkpoint.summary),
          confidence: "known",
        },
      });
      const blockingOutcome =
        checkpoint.kind === "approval"
          ? ("approval" as const)
          : checkpoint.kind === "blocked"
            ? ("input" as const)
            : checkpoint.kind === "failed"
              ? ("failure" as const)
              : null;
      if (blockingOutcome) {
        agentOutcomes.set(
          checkpoint.chatId,
          checkpoint.kind === "failed" ? "failed" : "decision-required",
        );
        dispatchWithEvents({
          type: "turn.complete",
          commandId: `turn-blocked:${checkpoint.checkpointId}` as OnTheGoCommand["commandId"],
          deviceId,
          targetAgentId: checkpoint.chatId,
          outcome: blockingOutcome,
          activeTurnId: checkpoint.checkpointId,
        });
      } else if (checkpoint.kind === "started") {
        agentOutcomes.delete(checkpoint.chatId);
      }
    },
    recordThreadLifecycle: ({ threadId, eventId, lifecycle }) => {
      const deviceId =
        trustedDevices.values().next().value ?? OnTheGoDeviceId.make("system:on-the-go");
      dispatchWithEvents({
        type: lifecycle === "archived" ? "follow.chat-archived" : "follow.chat-deleted",
        commandId: `follow-lifecycle:${eventId}` as OnTheGoCommand["commandId"],
        deviceId,
        chatId: threadId,
      });
    },
    recordContextEvidence: (input) => {
      const commandId =
        `context:${input.source}:${input.reference}:${input.sourceVersion}` as OnTheGoCommand["commandId"];
      if (!trustedDevices.has(input.deviceId)) {
        return { status: "rejected", commandId, reason: "device-untrusted" };
      }
      const key = `${input.source}:${input.reference}`;
      availableContext.set(key, { ownerScope: input.ownerScope, excerpt: input.excerpt });
      try {
        return dispatchWithEvents({
          type: "theo.context.fetch",
          commandId,
          deviceId: input.deviceId,
          source: input.source,
          reference: input.reference,
          sourceVersion: input.sourceVersion,
          ownerScope: input.ownerScope,
        });
      } finally {
        availableContext.delete(key);
      }
    },
    consumeRemoteModelCall: (authenticatedSessionId, scope, budget) => {
      if (sessionScopes.get(authenticatedSessionId) !== scopeKey(scope)) {
        return { allowed: false, used: 0, reason: "policy-denied" };
      }
      const voiceSnapshot = runtime.snapshot(scope);
      if (
        voiceSnapshot.owner?.deviceId !== scope.deviceId ||
        voiceSnapshot.owner.continueRequired
      ) {
        return { allowed: false, used: 0, reason: "policy-denied" };
      }
      const key = scopeKey(scope);
      const used = remoteModelCalls.get(key) ?? 0;
      if (used >= budget.hardLimit) {
        return { allowed: false, used, reason: "budget-exhausted" };
      }
      const next = used + 1;
      remoteModelCalls.set(key, next);
      return {
        allowed: true,
        used: next,
        warning: next >= Math.min(budget.warningAt, budget.hardLimit),
      };
    },
    connect: (authenticatedSessionId, scope, binding) => {
      const key = scopeKey(scope);
      const priorScope = sessionScopes.get(authenticatedSessionId);
      if (priorScope && priorScope !== key) {
        throw new Error("The authenticated session is already bound to another On-the-Go scope");
      }
      const claimedSession = deviceSessions.get(scope.deviceId);
      if (claimedSession && claimedSession !== authenticatedSessionId) {
        throw new Error("The On-the-Go device is active in another authenticated session");
      }
      const durableBinding = options.persistence.loadDeviceBinding?.(scope.deviceId);
      const durablePrincipalId = binding?.durablePrincipalId ?? authenticatedSessionId;
      const isAuthorizedLegacyBinding =
        durableBinding != null && binding?.legacySessionIds?.includes(durableBinding) === true;
      if (durableBinding && durableBinding !== durablePrincipalId && !isAuthorizedLegacyBinding) {
        throw new Error("The On-the-Go device belongs to another authenticated session");
      }
      if (durableBinding !== durablePrincipalId) {
        options.persistence.saveDeviceBinding?.(scope.deviceId, durablePrincipalId);
      }
      sessionScopes.set(authenticatedSessionId, key);
      deviceSessions.set(scope.deviceId, authenticatedSessionId);
      authorizedScopes.add(key);
      trustedDevices.add(scope.deviceId);
    },
    disconnect: (authenticatedSessionId) => {
      const key = sessionScopes.get(authenticatedSessionId);
      sessionScopes.delete(authenticatedSessionId);
      if (key && ![...sessionScopes.values()].includes(key)) {
        authorizedScopes.delete(key);
        for (const [deviceId, sessionId] of deviceSessions) {
          if (sessionId !== authenticatedSessionId) continue;
          deviceSessions.delete(deviceId);
          trustedDevices.delete(deviceId);
        }
      }
    },
    dispatchClient: (authenticatedSessionId, command) => {
      const boundScope = sessionScopes.get(authenticatedSessionId);
      if (!boundScope) {
        return { status: "rejected", commandId: command.commandId, reason: "policy-denied" };
      }
      if (
        isOnTheGoFoundationCommand(command) &&
        onTheGoFoundationCommandRegistry[command.type] === "system"
      ) {
        return { status: "rejected", commandId: command.commandId, reason: "policy-denied" };
      }
      if (
        "deviceId" in command &&
        deviceSessions.get(command.deviceId) !== authenticatedSessionId
      ) {
        return { status: "rejected", commandId: command.commandId, reason: "not-owner" };
      }
      const disposition = dispatchWithEvents(command);
      if (
        disposition.status === "accepted" &&
        command.type === "mode.set" &&
        command.mode === "off"
      ) {
        remoteModelCalls.delete(boundScope);
      }
      return disposition;
    },
    dispatchSystem: (command) => dispatchWithEvents(command),
    snapshot: (authenticatedSessionId, scope) => {
      assertAuthorized(authenticatedSessionId, scope);
      return runtime.snapshot(scope);
    },
    events: (authenticatedSessionId, scope) => {
      assertAuthorized(authenticatedSessionId, scope);
      return runtime.events(scope);
    },
    subscribe: (authenticatedSessionId, scope, listener) => {
      assertAuthorized(authenticatedSessionId, scope);
      const subscriber = { scope: scopeKey(scope), listener };
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  };
};
