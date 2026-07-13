import { ON_THE_GO_ACTION_IDS, OnTheGoConfirmationId } from "@t3tools/contracts";
import type {
  OnTheGoActionId,
  OnTheGoCommand,
  OnTheGoCommandDisposition,
  OnTheGoDeviceId,
  OnTheGoEvent,
  OnTheGoReadScope,
  OnTheGoSnapshot,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import type { OnTheGoRuntimePorts } from "./Ports.ts";
import { isOnTheGoFoundationCommand, onTheGoFoundationCommandRegistry } from "./CommandRegistry.ts";
import {
  dispatchOnTheGoFoundation,
  initialOnTheGoFoundationState,
  normalizeOnTheGoFoundationState,
  pruneOnTheGoFoundationState,
} from "./FoundationRuntime.ts";

export interface OnTheGoRuntime {
  readonly dispatch: (command: OnTheGoCommand) => OnTheGoCommandDisposition;
  readonly events: (scope: OnTheGoReadScope) => ReadonlyArray<OnTheGoEvent>;
  readonly snapshot: (scope: OnTheGoReadScope) => OnTheGoSnapshot;
}

const withMode = (snapshot: OnTheGoSnapshot, mode: OnTheGoSnapshot["mode"]): OnTheGoSnapshot => {
  switch (mode) {
    case "off":
      return { ...snapshot, mode, listener: "disabled", output: "disabled" };
    case "sleep":
      return { ...snapshot, mode, listener: "wake-only", output: "disabled" };
    default:
      return { ...snapshot, mode, listener: "active", output: "enabled" };
  }
};

const initialSnapshot = (): OnTheGoSnapshot => ({
  mode: "off",
  listener: "disabled",
  output: "disabled",
  bargeInEnabled: true,
  dictation: { status: "idle", text: "" },
  vocabulary: [],
  lastResolvedAction: null,
  pendingConfirmation: null,
  owner: null,
  foundation: initialOnTheGoFoundationState(),
  eventLog: [],
});

const safetyActions = new Map<string, OnTheGoActionId>([
  ["stop", "speech.stop"],
  ["cancel", "interaction.cancel"],
  ["confirm", "confirmation.confirm"],
  ["send it", "prompt.send"],
]);

const catalogedActions = new Set<OnTheGoActionId>(ON_THE_GO_ACTION_IDS);

const isCatalogedAction = (action: string): action is OnTheGoActionId =>
  catalogedActions.has(action as OnTheGoActionId);

const normalizePhrase = (phrase: string) => phrase.trim().toLocaleLowerCase();
const EVENT_LOG_LIMIT = 2_048;

export const makeOnTheGoRuntime = (ports: OnTheGoRuntimePorts): OnTheGoRuntime => {
  const restored = ports.persistence.load();
  let current: OnTheGoSnapshot = restored
    ? {
        ...restored,
        owner: restored.owner ? { ...restored.owner, continueRequired: true } : null,
        foundation: {
          ...normalizeOnTheGoFoundationState(restored.foundation),
          followPaused: restored.foundation?.followedChatId != null,
        },
        eventLog: restored.eventLog ?? [],
      }
    : initialSnapshot();
  current = {
    ...current,
    foundation: pruneOnTheGoFoundationState(
      normalizeOnTheGoFoundationState(current.foundation),
      ports.clock.now(),
    ),
  };
  if (restored) {
    const durableLayers = current.foundation.profileLayers.filter(
      (layer) => layer.scope !== "session",
    );
    current = {
      ...current,
      foundation: {
        ...current.foundation,
        profileLayers: durableLayers,
        profileHistory: current.foundation.profileHistory.filter(
          (revision) => revision.scope !== "session",
        ),
        profileEvidenceCandidates: current.foundation.profileEvidenceCandidates.filter(
          (candidate) => candidate.scope !== "session",
        ),
        profileConflictQuestion: null,
        activeProfileVersion: Math.max(0, ...durableLayers.map((layer) => layer.version)),
      },
    };
  }
  const emittedEvents: Array<OnTheGoEvent> = [...current.eventLog].slice(-EVENT_LOG_LIMIT);
  let nextEventSequence =
    emittedEvents.reduce((maximum, event) => Math.max(maximum, event.sequence), -1) + 1;
  const trimEvents = () => {
    if (emittedEvents.length > EVENT_LOG_LIMIT) {
      emittedEvents.splice(0, emittedEvents.length - EVENT_LOG_LIMIT);
    }
  };
  current = { ...current, eventLog: emittedEvents };
  ports.persistence.save(current);

  const accept = (commandId: OnTheGoCommand["commandId"]): OnTheGoCommandDisposition => {
    current = { ...current, eventLog: emittedEvents };
    ports.persistence.save(current);
    return { status: "accepted", commandId };
  };

  const reject = (
    commandId: OnTheGoCommand["commandId"],
    reason: Extract<OnTheGoCommandDisposition, { status: "rejected" }>["reason"],
  ): OnTheGoCommandDisposition => ({ status: "rejected", commandId, reason });

  const requireReadyOwner = (
    commandId: OnTheGoCommand["commandId"],
    deviceId?: OnTheGoDeviceId,
  ): OnTheGoCommandDisposition | null => {
    if (current.mode === "off") return reject(commandId, "invalid-state");
    if (!current.owner) return reject(commandId, "owner-required");
    if (deviceId !== undefined && current.owner.deviceId !== deviceId) {
      return reject(commandId, "not-owner");
    }
    if (current.owner.continueRequired) return reject(commandId, "continue-required");
    return null;
  };

  const dispatchNew = (command: OnTheGoCommand): OnTheGoCommandDisposition => {
    if (isOnTheGoFoundationCommand(command)) {
      if (onTheGoFoundationCommandRegistry[command.type] !== "system") {
        const ownerRejection = requireReadyOwner(command.commandId, command.deviceId);
        if (ownerRejection) return ownerRejection;
      }
      if (
        command.type === "queue.continue" ||
        command.type === "data.delete" ||
        command.type === "effect.abandon" ||
        (command.type === "data.reset" && command.scope !== "profile")
      ) {
        const action =
          command.type === "queue.continue"
            ? "queue.continue"
            : command.type === "data.delete"
              ? "data.delete"
              : command.type === "effect.abandon"
                ? "effect.abandon"
                : "data.reset";
        const target =
          command.type === "queue.continue"
            ? `${command.targetAgentId}:${command.expectedPendingCount}`
            : command.type === "data.delete"
              ? `${command.scope}:${command.expectedPendingCount}:${command.expectedActiveTurnId ?? "none"}`
              : command.type === "effect.abandon"
                ? command.effectId
                : `${command.scope}:${command.expectedPendingCount}`;
        const confirmationId = command.confirmationId;
        const authorized = emittedEvents.some(
          (event) =>
            event.type === "action.authorized" &&
            event.confirmationId === confirmationId &&
            event.action === action &&
            event.target === target,
        );
        if (
          !authorized ||
          confirmationId === null ||
          current.foundation.consumedConfirmations.includes(confirmationId)
        )
          return reject(command.commandId, "confirmation-required");
      }
      if (command.type === "agent.handoff.create" && command.sharedWritable) {
        const confirmationId = command.sharedWriteConfirmationId;
        const target = `handoff:${command.agentId}:${command.promptId}:shared`;
        const authorized =
          confirmationId !== null &&
          emittedEvents.some(
            (event) =>
              event.type === "action.authorized" &&
              event.confirmationId === confirmationId &&
              event.action === "agent.shared-write" &&
              event.target === target,
          );
        if (
          !authorized ||
          (confirmationId !== null &&
            current.foundation.consumedConfirmations.includes(confirmationId))
        )
          return reject(command.commandId, "shared-write-confirmation-required");
      }
      const result = dispatchOnTheGoFoundation(current.foundation, command, ports, (foundation) => {
        current = { ...current, foundation };
        ports.persistence.save(current);
      });
      current = { ...current, foundation: result.state };
      const resultEvents = [...(result.event ? [result.event] : []), ...(result.events ?? [])];
      for (const event of resultEvents) {
        emittedEvents.push({ ...event, sequence: nextEventSequence++, at: ports.clock.now() });
        trimEvents();
      }
      current = { ...current, eventLog: emittedEvents };
      ports.persistence.save(current);
      return result.disposition;
    }
    switch (command.type) {
      case "mode.set": {
        if (!ports.capabilities.isModeAvailable(command.mode)) {
          return reject(command.commandId, "unavailable-transition");
        }
        if (
          command.mode === "command" ||
          command.mode === "theo-conversation" ||
          command.mode === "dictation"
        ) {
          if (!current.owner) return reject(command.commandId, "owner-required");
          if (current.owner.continueRequired) {
            return reject(command.commandId, "continue-required");
          }
        }
        current = withMode(current, command.mode);
        return accept(command.commandId);
      }
      case "owner.acquire": {
        if (!ports.deviceTrust.isTrusted(command.deviceId)) {
          return reject(command.commandId, "device-untrusted");
        }
        if (current.owner && current.owner.deviceId !== command.deviceId) {
          return reject(command.commandId, "owner-held");
        }
        current = {
          ...current,
          owner: current.owner ?? { deviceId: command.deviceId, continueRequired: false },
        };
        return accept(command.commandId);
      }
      case "owner.handoff": {
        if (current.owner?.deviceId !== command.deviceId) {
          return reject(command.commandId, "not-owner");
        }
        if (!ports.deviceTrust.isTrusted(command.nextDeviceId)) {
          return reject(command.commandId, "device-untrusted");
        }
        current = {
          ...current,
          owner: { deviceId: command.nextDeviceId, continueRequired: true },
        };
        return accept(command.commandId);
      }
      case "owner.continue": {
        if (current.owner?.deviceId !== command.deviceId) {
          return reject(command.commandId, "not-owner");
        }
        current = { ...current, owner: { ...current.owner, continueRequired: false } };
        return accept(command.commandId);
      }
      case "wake.detected": {
        if (current.mode !== "sleep") return reject(command.commandId, "invalid-state");
        const ownerRejection = requireReadyOwner(command.commandId, command.deviceId);
        if (ownerRejection) return ownerRejection;
        const target = ports.wakeDetection.resolve(command.phrase);
        if (target === null) {
          return reject(command.commandId, "wake-not-recognized");
        }
        current = withMode(current, target);
        return accept(command.commandId);
      }
      case "barge-in.set": {
        const ownerRejection = requireReadyOwner(command.commandId, command.deviceId);
        if (ownerRejection) return ownerRejection;
        current = { ...current, bargeInEnabled: command.enabled };
        return accept(command.commandId);
      }
      case "speech.interrupt": {
        const ownerRejection = requireReadyOwner(command.commandId, command.deviceId);
        if (ownerRejection) return ownerRejection;
        const isStop = command.phrase.trim().toLocaleLowerCase() === "stop";
        if (!isStop && !current.bargeInEnabled) {
          return reject(command.commandId, "barge-in-disabled");
        }
        ports.audioOutput.stop();
        current = { ...current, output: "disabled" };
        return accept(command.commandId);
      }
      case "dictation.capture": {
        const ownerRejection = requireReadyOwner(command.commandId, command.deviceId);
        if (ownerRejection) return ownerRejection;
        if (current.mode !== "dictation") {
          return reject(command.commandId, "invalid-state");
        }
        try {
          const result = ports.transcription.transcribe(command.rawAudioId);
          if (result._tag === "Failure") {
            current = {
              ...current,
              dictation: { ...current.dictation, status: "error" },
            };
            return reject(command.commandId, "transcription-failed");
          }
          current = {
            ...current,
            dictation: { status: "ready", text: result.text },
          };
          return accept(command.commandId);
        } finally {
          ports.rawAudio.discard(command.rawAudioId);
        }
      }
      case "vocabulary.alias.set": {
        const phrase = normalizePhrase(command.phrase);
        if (safetyActions.has(phrase)) {
          return reject(command.commandId, "immutable-phrase");
        }
        const existing = current.vocabulary.find((entry) => entry.phrase === phrase);
        if (existing && existing.action !== command.action) {
          return reject(command.commandId, "alias-conflict");
        }
        current = {
          ...current,
          vocabulary: [
            ...current.vocabulary.filter((entry) => entry.phrase !== phrase),
            { phrase, action: command.action },
          ],
        };
        return accept(command.commandId);
      }
      case "action.resolve": {
        const ownerRejection = requireReadyOwner(command.commandId, command.deviceId);
        if (ownerRejection) return ownerRejection;
        const phrase = normalizePhrase(command.phrase);
        const safetyAction = safetyActions.get(phrase);
        const aliasAction = current.vocabulary.find((entry) => entry.phrase === phrase)?.action;
        const modelResolution =
          safetyAction || aliasAction
            ? { _tag: "NoMatch" as const }
            : ports.commandModel.resolve(phrase);
        const action =
          safetyAction ??
          aliasAction ??
          (modelResolution._tag === "Candidate" ? modelResolution.action : undefined);
        if (!action || !isCatalogedAction(action)) {
          return reject(command.commandId, "action-not-cataloged");
        }
        const catalogedAction = action;
        if (catalogedAction === "speech.stop") ports.audioOutput.stop();
        current = {
          ...current,
          lastResolvedAction: catalogedAction,
          output: catalogedAction === "speech.stop" ? "disabled" : current.output,
        };
        emittedEvents.push({
          type: "action.resolved",
          sequence: nextEventSequence++,
          at: ports.clock.now(),
          commandId: command.commandId,
          action: catalogedAction,
          source: command.source,
          resolution: safetyAction ? "local-safety" : aliasAction ? "alias" : "model",
        });
        trimEvents();
        current = { ...current, eventLog: emittedEvents };
        ports.persistence.save(current);
        return { status: "accepted", commandId: command.commandId };
      }
      case "confirmation.request": {
        const ownerRejection = requireReadyOwner(command.commandId, command.deviceId);
        if (ownerRejection) return ownerRejection;
        const confirmationId = OnTheGoConfirmationId.make(`confirmation:${command.commandId}`);
        const expiresAt = DateTime.formatIso(
          DateTime.add(DateTime.makeUnsafe(ports.clock.now()), { seconds: 15 }),
        );
        current = {
          ...current,
          pendingConfirmation: {
            confirmationId,
            action: command.action,
            target: command.target,
            expiresAt,
          },
        };
        ports.persistence.save(current);
        return {
          status: "confirmation-required",
          commandId: command.commandId,
          confirmationId,
          action: command.action,
          target: command.target,
          expiresAt,
        };
      }
      case "confirmation.respond": {
        const ownerRejection = requireReadyOwner(command.commandId, command.deviceId);
        if (ownerRejection) return ownerRejection;
        const pending = current.pendingConfirmation;
        if (!pending || pending.confirmationId !== command.confirmationId) {
          return reject(command.commandId, "confirmation-not-found");
        }
        if (normalizePhrase(command.phrase) !== "confirm") {
          const reason = normalizePhrase(command.phrase).includes("confirm")
            ? "confirmation-ambiguous"
            : "confirmation-phrase-required";
          current = { ...current, pendingConfirmation: null };
          ports.persistence.save(current);
          return reject(command.commandId, reason);
        }
        if (
          DateTime.toEpochMillis(DateTime.makeUnsafe(ports.clock.now())) >
          DateTime.toEpochMillis(DateTime.makeUnsafe(pending.expiresAt))
        ) {
          current = { ...current, pendingConfirmation: null };
          ports.persistence.save(current);
          return reject(command.commandId, "confirmation-expired");
        }
        if (command.target !== pending.target) {
          current = { ...current, pendingConfirmation: null };
          ports.persistence.save(current);
          return reject(command.commandId, "confirmation-target-changed");
        }
        current = { ...current, pendingConfirmation: null };
        emittedEvents.push({
          type: "action.authorized",
          sequence: nextEventSequence++,
          at: ports.clock.now(),
          commandId: command.commandId,
          confirmationId: command.confirmationId,
          action: pending.action,
          target: pending.target,
          source: command.source,
        });
        trimEvents();
        current = { ...current, eventLog: emittedEvents };
        ports.persistence.save(current);
        return { status: "accepted", commandId: command.commandId };
      }
    }
  };

  const dispatch = (command: OnTheGoCommand): OnTheGoCommandDisposition => {
    const existing = ports.persistence.loadDisposition(command.commandId);
    if (existing) return existing;
    const disposition = dispatchNew(command);
    ports.persistence.saveDisposition(command.commandId, disposition);
    return disposition;
  };

  return {
    dispatch,
    events: (scope) => {
      if (!ports.authorization.canRead(scope)) throw new Error("On-the-Go scope is not authorized");
      return structuredClone(emittedEvents);
    },
    snapshot: (scope) => {
      if (!ports.authorization.canRead(scope)) throw new Error("On-the-Go scope is not authorized");
      current = {
        ...current,
        foundation: pruneOnTheGoFoundationState(current.foundation, ports.clock.now()),
      };
      ports.persistence.save(current);
      return structuredClone(current);
    },
  };
};
