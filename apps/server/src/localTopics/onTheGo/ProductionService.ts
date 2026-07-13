// @effect-diagnostics globalTimers:off - This synchronous runtime schedules persisted queue heads after their correction window.
import {
  OnTheGoDeviceId,
  OnTheGoResponseId,
  type OnTheGoCommand,
  type OnTheGoCommandDisposition,
  type OnTheGoEvent,
  type OnTheGoFoundationCommand,
  type OnTheGoReadScope,
  type OnTheGoSnapshot,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { isOnTheGoFoundationCommand, onTheGoFoundationCommandRegistry } from "./CommandRegistry.ts";
import type { OnTheGoPersistence, OnTheGoRuntimePorts } from "./Ports.ts";
import type { OnTheGoTurnDeliveryRequest } from "./Ports.ts";
import { makeOnTheGoRuntime } from "./Runtime.ts";

export interface OnTheGoServerServiceOptions {
  readonly persistence: OnTheGoPersistence;
  readonly now: () => string;
}

export interface OnTheGoServerService {
  readonly acquireEventIngestion: () => (() => void) | null;
  readonly dispose: () => void;
  readonly setTurnExecutor: (
    executor: (request: OnTheGoTurnDeliveryRequest) => Promise<void>,
  ) => void;
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
  readonly connect: (authenticatedSessionId: string, scope: OnTheGoReadScope) => void;
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

const scopeKey = (scope: OnTheGoReadScope) => `${scope.voiceSessionId}:${scope.deviceId}`;

export const safeAnnouncementSummary = (text: string) => {
  const prose = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(at\s+|[+\-@]{2,}|error:|stack:)/i.test(line) &&
        !/(api[_-]?key|access[_-]?token|password|secret)\s*[:=]/i.test(line),
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
  const dispositions = new Map<string, OnTheGoCommandDisposition>();
  const subscribers = new Set<{
    readonly scope: string;
    readonly listener: (event: OnTheGoEvent) => void;
  }>();
  const scheduledSubmissions = new Set<string>();
  const schedulerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let eventIngestionClaimed = false;
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
    contextFetch: { fetch: () => ({ _tag: "Denied", reason: "authorization" }) },
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
          () => resolveDelivery(request, "failed"),
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
      select: ({ capability, providerId, modelId }) => ({
        _tag: "Selected",
        capability,
        providerId,
        modelId,
        fallback: false,
      }),
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

  const scheduleQueued = () => {
    if (!turnExecutor) return;
    const deviceId = trustedDevices.values().next().value;
    if (!deviceId) return;
    const snapshot = options.persistence.load();
    for (const turn of snapshot?.foundation?.pendingTurns ?? []) {
      if (turn.state !== "queued" || !turn.workspaceReady) continue;
      if (scheduledSubmissions.has(turn.submissionId)) continue;
      scheduledSubmissions.add(turn.submissionId);
      const delay = Math.max(
        0,
        Date.parse(turn.correctionExpiresAt) - Date.parse(options.now()) + 1,
      );
      const timer = setTimeout(() => {
        scheduledSubmissions.delete(turn.submissionId);
        schedulerTimers.delete(turn.submissionId);
        dispatchWithEvents({
          type: "scheduler.tick",
          commandId: `scheduler:${turn.submissionId}` as OnTheGoCommand["commandId"],
          deviceId,
          targetAgentId: turn.targetAgentId,
        });
      }, delay);
      schedulerTimers.set(turn.submissionId, timer);
    }
  };

  const assertAuthorized = (authenticatedSessionId: string, scope: OnTheGoReadScope) => {
    if (sessionScopes.get(authenticatedSessionId) !== scopeKey(scope)) {
      throw new Error("On-the-Go scope is not authorized");
    }
  };

  return {
    acquireEventIngestion: () => {
      if (eventIngestionClaimed) return null;
      eventIngestionClaimed = true;
      return () => {
        eventIngestionClaimed = false;
      };
    },
    dispose: () => {
      clearInterval(followQuietTimer);
      for (const timer of schedulerTimers.values()) clearTimeout(timer);
      schedulerTimers.clear();
      scheduledSubmissions.clear();
      subscribers.clear();
      authorizedScopes.clear();
      sessionScopes.clear();
      trustedDevices.clear();
      turnExecutor = null;
      eventIngestionClaimed = false;
    },
    setTurnExecutor: (executor) => {
      turnExecutor = executor;
      scheduleQueued();
    },
    recordAssistantResponse: ({ threadId, messageId, text, completedAt }) => {
      const deviceId =
        trustedDevices.values().next().value ?? OnTheGoDeviceId.make("system:on-the-go");
      const expiresAt = DateTime.formatIso(
        DateTime.add(DateTime.makeUnsafe(completedAt), { days: 30 }),
      );
      dispatchWithEvents({
        type: "response.record",
        commandId: `response:${messageId}` as OnTheGoCommand["commandId"],
        deviceId,
        response: {
          responseId: OnTheGoResponseId.make(`response:${messageId}`),
          projectId: "t3-code",
          chatId: threadId,
          agentId: threadId,
          outcome: "completed",
          safeSummary: safeAnnouncementSummary(text),
          completedAt,
          handledAt: null,
          expiresAt,
        },
      });
      dispatchWithEvents({
        type: "turn.complete",
        commandId: `turn-complete:${messageId}` as OnTheGoCommand["commandId"],
        deviceId,
        targetAgentId: threadId,
        outcome: "compatible",
        activeTurnId: messageId,
      });
      scheduleQueued();
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
    },
    connect: (authenticatedSessionId, scope) => {
      const key = scopeKey(scope);
      sessionScopes.set(authenticatedSessionId, key);
      authorizedScopes.add(key);
      trustedDevices.add(scope.deviceId);
      scheduleQueued();
    },
    disconnect: (authenticatedSessionId) => {
      const key = sessionScopes.get(authenticatedSessionId);
      sessionScopes.delete(authenticatedSessionId);
      if (key && ![...sessionScopes.values()].includes(key)) authorizedScopes.delete(key);
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
      if ("deviceId" in command && !boundScope.endsWith(`:${command.deviceId}`)) {
        return { status: "rejected", commandId: command.commandId, reason: "not-owner" };
      }
      const disposition = dispatchWithEvents(command);
      scheduleQueued();
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
