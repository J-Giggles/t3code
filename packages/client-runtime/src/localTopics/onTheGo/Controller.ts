// @effect-diagnostics globalTimers:off - The framework-neutral controller retries a temporarily unavailable transport.
import {
  OnTheGoCommandId,
  OnTheGoPromptId,
  OnTheGoPromptRevisionId,
  type OnTheGoCommand,
  type OnTheGoCommandDisposition,
  type OnTheGoEvent,
  type OnTheGoReadScope,
  type OnTheGoSnapshot,
  type OnTheGoActionId,
} from "@t3tools/contracts";

import { renderOnTheGoDisplay, renderOnTheGoSpeech } from "./SpeechPrivacy.ts";

export interface OnTheGoClientTransport {
  readonly snapshot: (scope: OnTheGoReadScope) => Promise<OnTheGoSnapshot>;
  readonly dispatch: (command: OnTheGoCommand) => Promise<OnTheGoCommandDisposition>;
  readonly subscribe: (
    scope: OnTheGoReadScope,
    listener: (event: OnTheGoEvent) => void,
  ) => () => void;
}

export interface OnTheGoSpeechAdapter {
  readonly availability: () => {
    readonly available: boolean;
    readonly background: boolean;
    readonly reason?: string;
  };
  readonly start: (
    listener: (transcript: string) => void,
    onFailure?: (reason: string) => void,
  ) => () => void;
  readonly speak: (text: string) => Promise<void>;
  readonly stop: () => void;
  readonly dispose?: () => void;
  readonly tone?: (kind: "response" | "attention") => void;
}

export interface OnTheGoTheoAdapter {
  readonly ask: (input: {
    readonly utterance: string;
    readonly focusedResponse: string | null;
    readonly signal: AbortSignal;
  }) => Promise<{ readonly reply: string; readonly preparedPrompt: string | null }>;
}

export interface OnTheGoControllerState {
  readonly enabled: boolean;
  readonly available: boolean;
  readonly availabilityReason: string | null;
  readonly backgroundAvailable: boolean;
  readonly mode: OnTheGoSnapshot["mode"];
  readonly caption: string;
  readonly transcript: string;
  readonly responseBadge: number;
  readonly attentionBadge: number;
  readonly queuedWork: number;
  readonly ownerDeviceId: string | null;
  readonly continueRequired: boolean;
  readonly theoMessages: ReadonlyArray<{ readonly role: "user" | "theo"; readonly text: string }>;
  readonly theoPreferences: ReadonlyArray<string>;
  readonly preparedPrompt: {
    readonly revisionId: string;
    readonly content: string;
    readonly targetChatId: string;
    readonly targetAgentId: string;
    readonly intent: "queue" | "steer";
  } | null;
  readonly vocabulary: OnTheGoSnapshot["vocabulary"];
  readonly followTimeline: OnTheGoSnapshot["foundation"]["followTimeline"];
}

export interface OnTheGoControllerOptions {
  readonly scope: OnTheGoReadScope;
  readonly target: () => {
    readonly targetChatId: string;
    readonly targetAgentId: string;
    readonly activeTurnId?: string | null;
  } | null;
  readonly followTargets?: () => ReadonlyArray<{
    readonly chatId: string;
    readonly title: string;
  }>;
  readonly createId: () => string;
  readonly now?: () => number;
  readonly transport: OnTheGoClientTransport;
  readonly speech: OnTheGoSpeechAdapter;
  readonly theo: OnTheGoTheoAdapter;
  readonly voiceSettings?: () => {
    readonly wakePhrases: ReadonlyArray<string>;
    readonly bargeInEnabled?: boolean;
    readonly outputPrivacy?: "private" | "public";
  };
}

export const resolveFollowTarget = (
  targets: ReadonlyArray<{ readonly chatId: string; readonly title: string }>,
  query: string,
):
  | { readonly _tag: "Found"; readonly chatId: string; readonly title: string }
  | { readonly _tag: "Ambiguous"; readonly titles: ReadonlyArray<string> }
  | { readonly _tag: "NotFound" } => {
  const needle = normalize(query);
  const exact = targets.filter(
    (target) => normalize(target.chatId) === needle || normalize(target.title) === needle,
  );
  const candidates =
    exact.length > 0
      ? exact
      : targets.filter(
          (target) =>
            normalize(target.chatId).includes(needle) || normalize(target.title).includes(needle),
        );
  if (candidates.length === 0) return { _tag: "NotFound" };
  if (candidates.length > 1) {
    return { _tag: "Ambiguous", titles: candidates.slice(0, 3).map((target) => target.title) };
  }
  return { _tag: "Found", chatId: candidates[0]!.chatId, title: candidates[0]!.title };
};

export const extractTheoPreference = (utterance: string) => {
  const detail = utterance
    .match(/^(?:i prefer|i want theo to|please always|theo,? always)\s+(.+)$/i)?.[1]
    ?.trim();
  if (!detail) return null;
  const sensitive = /password|secret|token|api[_ -]?key|credential/i.test(detail);
  const oneOff = /\b(?:just once|this time|for this chat|today only)\b/i.test(detail);
  const key =
    detail
      .toLocaleLowerCase()
      .match(/[a-z0-9]+/g)
      ?.slice(0, 4)
      .join("-") || "general";
  return {
    preference: `conversation-${key}: ${detail}`,
    sensitive,
    oneOff,
  };
};

export interface OnTheGoController {
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly toggle: (enabled: boolean) => Promise<void>;
  readonly setBargeInEnabled: (enabled: boolean) => Promise<void>;
  readonly sleep: (reason?: string) => Promise<void>;
  readonly acceptTranscript: (transcript: string, source?: "voice" | "composer") => Promise<void>;
  readonly state: () => OnTheGoControllerState;
  readonly subscribe: (listener: (state: OnTheGoControllerState) => void) => () => void;
}

const acousticPhraseAliases: Readonly<Record<string, string>> = {
  "what changed in the follow chat": "what changed in the followed chat",
  "inspect the odata": "inspect theo data",
  "inspect the o data": "inspect theo data",
};

export const normalizeRecognizedVoicePhrase = (value: string) => {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[?.!,]+/g, "");
  return acousticPhraseAliases[normalized] ?? normalized;
};

const normalize = normalizeRecognizedVoicePhrase;
const dispositionReason = (disposition: OnTheGoCommandDisposition) =>
  disposition.status === "rejected"
    ? disposition.reason
    : disposition.status === "confirmation-required"
      ? `confirmation required for ${disposition.action}`
      : "accepted";

const spokenActionIds: Readonly<Record<string, OnTheGoActionId>> = {
  stop: "speech.stop",
  cancel: "interaction.cancel",
  confirm: "confirmation.confirm",
  send: "prompt.send",
  "send it": "prompt.send",
  steer: "agent.steer",
  follow: "follow.start",
  sleep: "mode.sleep",
};

export const makeOnTheGoController = (options: OnTheGoControllerOptions): OnTheGoController => {
  let snapshot: OnTheGoSnapshot | null = null;
  let caption = "On-the-Go Mode is off";
  let transcript = "";
  let localMode: OnTheGoSnapshot["mode"] = "off";
  let prepared: {
    readonly promptId: ReturnType<typeof OnTheGoPromptId.make>;
    readonly revisionId: ReturnType<typeof OnTheGoPromptRevisionId.make>;
    readonly content: string;
    readonly targetChatId: string;
    readonly targetAgentId: string;
  } | null = null;
  let preparedIntent: "queue" | "steer" = "queue";
  let lastQueuedCorrection: {
    readonly submissionId: OnTheGoSnapshot["foundation"]["pendingTurns"][number]["submissionId"];
    readonly activeTurnId: string;
  } | null = null;
  let stagedHandoff: {
    readonly agentId: string;
    readonly sourceChatId: string;
    readonly references: ReadonlyArray<string>;
  } | null = null;
  let theoMessages = new Array<{ readonly role: "user" | "theo"; readonly text: string }>();
  let stopListening: (() => void) | null = null;
  let stopEvents: (() => void) | null = null;
  let activeTheo: AbortController | null = null;
  let dictationDraft = "";
  let activeSpeechSegments = 0;
  let pendingFollowSummary: string | null = null;
  let lastResponseToneAt: number | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryWake: (() => void) | null = null;
  let stopped = false;
  const listeners = new Set<(state: OnTheGoControllerState) => void>();
  let availability = options.speech.availability();
  const wakePhrases = () => {
    const configured = options.voiceSettings?.().wakePhrases ?? [];
    const commandDisplay = configured[0]?.trim() || "T3";
    const theoDisplay = configured[1]?.trim() || "Hey Theo";
    return {
      command: normalize(commandDisplay),
      theo: normalize(theoDisplay),
      commandDisplay,
      theoDisplay,
    };
  };

  const currentState = (): OnTheGoControllerState => ({
    enabled: localMode !== "off",
    available: availability.available,
    availabilityReason: availability.reason ?? null,
    backgroundAvailable: availability.background,
    mode: localMode,
    caption,
    transcript,
    responseBadge: snapshot?.foundation.responseBadge ?? 0,
    attentionBadge: snapshot?.foundation.attentionBadge ?? 0,
    queuedWork:
      snapshot?.foundation.pendingTurns.filter((turn) =>
        ["queued", "frozen", "unknown-outcome"].includes(turn.state),
      ).length ?? 0,
    ownerDeviceId: snapshot?.owner?.deviceId ?? null,
    continueRequired: snapshot?.owner?.continueRequired ?? false,
    theoMessages,
    theoPreferences:
      snapshot?.foundation.profileHistory.find(
        (revision) => revision.version === snapshot?.foundation.activeProfileVersion,
      )?.preferences ?? [],
    preparedPrompt: prepared
      ? {
          revisionId: prepared.revisionId,
          content: prepared.content,
          targetChatId: prepared.targetChatId,
          targetAgentId: prepared.targetAgentId,
          intent: preparedIntent,
        }
      : null,
    vocabulary: snapshot?.vocabulary ?? [],
    followTimeline: snapshot?.foundation.followTimeline ?? [],
  });
  const notify = () => {
    const state = currentState();
    for (const listener of listeners) listener(state);
  };
  const refresh = async () => {
    snapshot = await options.transport.snapshot(options.scope);
    localMode = snapshot.mode;
    const latestPrompt = snapshot.foundation.prompts.at(-1);
    const latestRevision = latestPrompt?.revisions.find(
      (revision) => revision.revisionId === latestPrompt.activeRevisionId,
    );
    const alreadySubmitted = latestRevision
      ? snapshot.foundation.pendingTurns.some(
          (turn) =>
            turn.promptId === latestPrompt?.promptId &&
            turn.revisionId === latestRevision.revisionId,
        )
      : false;
    if (
      latestPrompt &&
      latestRevision &&
      !alreadySubmitted &&
      (latestRevision.readiness === "ready" ||
        latestRevision.readiness === "pending-reconciliation")
    ) {
      prepared = {
        promptId: latestPrompt.promptId,
        revisionId: latestRevision.revisionId,
        content: latestRevision.content,
        targetChatId: latestRevision.targetChatId,
        targetAgentId: latestRevision.targetAgentId,
      };
      preparedIntent = "queue";
    } else if (prepared) {
      const stillPresent = snapshot.foundation.prompts.some(
        (prompt) =>
          prompt.promptId === prepared?.promptId &&
          prompt.revisions.some((revision) => revision.revisionId === prepared?.revisionId),
      );
      if (!stillPresent || alreadySubmitted) prepared = null;
    }
    notify();
  };
  const commandId = (purpose: string) => OnTheGoCommandId.make(`${purpose}:${options.createId()}`);
  const dispatch = async (command: OnTheGoCommand) => options.transport.dispatch(command);
  const speak = async (text: string) => {
    const rendered = renderOnTheGoSpeech(
      text,
      options.voiceSettings?.().outputPrivacy ?? "private",
    );
    caption = rendered;
    notify();
    activeSpeechSegments += 1;
    try {
      await options.speech.speak(rendered);
    } finally {
      activeSpeechSegments -= 1;
      if (
        activeSpeechSegments === 0 &&
        pendingFollowSummary &&
        localMode !== "theo-conversation" &&
        localMode !== "dictation" &&
        !snapshot?.pendingConfirmation
      ) {
        const summary = pendingFollowSummary;
        pendingFollowSummary = null;
        void speak(summary);
      }
    }
  };
  const setMode = async (mode: OnTheGoSnapshot["mode"]) => {
    const result = await dispatch({
      type: "mode.set",
      commandId: commandId(`mode-${mode}`),
      mode,
      source: "visual",
    });
    if (result.status === "accepted") localMode = mode;
    return result;
  };
  const focusedResponse = () => {
    const selectedId = snapshot?.foundation.selectedResponseId;
    return (
      snapshot?.foundation.responses.find((response) => response.responseId === selectedId) ?? null
    );
  };

  const preparePrompt = async (content: string) => {
    const target = options.target();
    if (!target) {
      await speak("No coding agent chat is selected");
      return false;
    }
    const promptId = OnTheGoPromptId.make(`prompt:${options.createId()}`);
    const revisionId = OnTheGoPromptRevisionId.make(`revision:${options.createId()}`);
    const preparedResult = await dispatch({
      type: "prompt.prepare",
      commandId: commandId("prompt-prepare"),
      deviceId: options.scope.deviceId,
      promptId,
      revisionId,
      content,
      targetChatId: target.targetChatId,
      targetAgentId: target.targetAgentId,
      requiresWorkspace: false,
    });
    if (preparedResult.status !== "accepted") return false;
    const readyResult = await dispatch({
      type: "prompt.mark-ready",
      commandId: commandId("prompt-ready"),
      deviceId: options.scope.deviceId,
      promptId,
      revisionId,
    });
    if (readyResult.status !== "accepted") return false;
    prepared = {
      promptId,
      revisionId,
      content,
      targetChatId: target.targetChatId,
      targetAgentId: target.targetAgentId,
    };
    preparedIntent = "queue";
    stagedHandoff = null;
    notify();
    await speak(
      `Prepared exact ${preparedIntent} prompt for ${target.targetAgentId}: ${content}. Say Send it to submit it.`,
    );
    return true;
  };

  const announceResponse = async (direction: "last" | "next" | "previous") => {
    const result = await dispatch({
      type: "response.navigate",
      commandId: commandId(`response-${direction}`),
      deviceId: options.scope.deviceId,
      direction,
    });
    if (result.status !== "accepted") {
      await speak("There is no matching announcement to read");
      return;
    }
    await refresh();
    const response = focusedResponse();
    if (!response) {
      await speak("There is no matching announcement to read");
      return;
    }
    await speak(
      `Announcement from ${response.agentId} in chat ${response.chatId}. Outcome ${response.outcome}. ${response.safeSummary}. ${response.outcome === "decision-required" ? "A decision is required." : "No decision is required."}`,
    );
    await dispatch({
      type: "response.handle",
      commandId: commandId("response-handle"),
      deviceId: options.scope.deviceId,
      responseId: response.responseId,
    });
    await refresh();
    options.speech.tone?.("response");
  };

  const acceptTranscript = async (
    rawTranscript: string,
    source: "voice" | "composer" = "voice",
  ) => {
    transcript = rawTranscript.trim();
    const phrase = normalize(transcript);
    notify();
    if (
      source === "composer" &&
      localMode === "off" &&
      phrase !== "turn off on the go mode" &&
      phrase !== "turn off on-the-go mode"
    ) {
      if (snapshot?.owner?.deviceId !== options.scope.deviceId) {
        const owner = await dispatch({
          type: "owner.acquire",
          commandId: commandId("typed-owner-acquire"),
          deviceId: options.scope.deviceId,
        });
        if (owner.status !== "accepted") {
          caption = `Typed controls could not start: ${dispositionReason(owner)}`;
          notify();
          return;
        }
        await refresh();
      }
      if (snapshot?.owner?.continueRequired) {
        caption = "Ownership was restored. Use Continue before typed controls start.";
        notify();
        return;
      }
      const typedMode = await setMode("sleep");
      if (typedMode.status !== "accepted") {
        caption = `Typed controls could not start: ${dispositionReason(typedMode)}`;
        notify();
        return;
      }
    }
    if (phrase === "stop") {
      activeTheo?.abort();
      activeTheo = null;
      options.speech.stop();
      await dispatch({
        type: "speech.interrupt",
        commandId: commandId("stop"),
        deviceId: options.scope.deviceId,
        phrase: "stop",
      });
      await setMode("sleep");
      caption = "Stopped";
      notify();
      return;
    }
    if (phrase === "turn off on the go mode" || phrase === "turn off on-the-go mode") {
      await setMode("off");
      stopListening?.();
      stopListening = null;
      caption = "On-the-Go Mode is off";
      notify();
      return;
    }
    if (phrase === "yes") {
      await speak("Say Confirm to authorize the exact action, or Cancel");
      return;
    }
    if (phrase === "confirm") {
      const confirmation = snapshot?.pendingConfirmation;
      if (!confirmation) {
        await speak("There is no action waiting for confirmation");
        return;
      }
      const result = await dispatch({
        type: "confirmation.respond",
        commandId: commandId("confirmation-confirm"),
        deviceId: options.scope.deviceId,
        confirmationId: confirmation.confirmationId,
        phrase: "confirm",
        target: confirmation.target,
        source: source === "voice" ? "voice" : "keyboard",
      });
      await refresh();
      await speak(
        result.status === "accepted"
          ? `Confirmed ${confirmation.action} for ${confirmation.target}`
          : `The action was not confirmed: ${dispositionReason(result)}`,
      );
      return;
    }
    if (phrase === "cancel") {
      activeTheo?.abort();
      activeTheo = null;
      const confirmation = snapshot?.pendingConfirmation;
      if (confirmation) {
        await dispatch({
          type: "confirmation.respond",
          commandId: commandId("confirmation-cancel"),
          deviceId: options.scope.deviceId,
          confirmationId: confirmation.confirmationId,
          phrase: "cancel",
          target: confirmation.target,
          source: source === "voice" ? "voice" : "keyboard",
        });
      }
      if (prepared) {
        await dispatch({
          type: "prompt.cancel",
          commandId: commandId("prompt-cancel"),
          deviceId: options.scope.deviceId,
          promptId: prepared.promptId,
          revisionId: prepared.revisionId,
        });
      }
      prepared = null;
      stagedHandoff = null;
      lastQueuedCorrection = null;
      dictationDraft = "";
      await dispatch({
        type: "action.resolve",
        commandId: commandId("interaction-cancel"),
        deviceId: options.scope.deviceId,
        phrase: "cancel",
        source: source === "voice" ? "voice" : "keyboard",
      });
      await setMode("command");
      await speak("Cancelled");
      return;
    }
    if (phrase === "send it" && prepared) {
      const target = options.target();
      const result = await dispatch({
        type: "prompt.send",
        commandId: commandId("prompt-send"),
        deviceId: options.scope.deviceId,
        promptId: prepared.promptId,
        revisionId: prepared.revisionId,
        phrase: "send it",
        intent: preparedIntent,
        source,
        expectedActiveTurnId: target?.activeTurnId ?? null,
      });
      if (result.status === "accepted") {
        const sent = prepared;
        prepared = null;
        if (stagedHandoff) {
          const handoff = stagedHandoff;
          stagedHandoff = null;
          const handoffResult = await dispatch({
            type: "agent.handoff.create",
            commandId: commandId("agent-handoff"),
            deviceId: options.scope.deviceId,
            promptId: sent.promptId,
            agentId: handoff.agentId,
            sourceScope: handoff.sourceChatId,
            references: handoff.references,
            sharedWritable: false,
            sharedWriteConfirmationId: null,
          });
          if (handoffResult.status !== "accepted") {
            await refresh();
            caption = `The prompt was not released because the isolated agent handoff failed: ${dispositionReason(handoffResult)}`;
            notify();
            return;
          }
        }
        await refresh();
        const pending = snapshot?.foundation.pendingTurns.find(
          (turn) => turn.promptId === sent.promptId && turn.revisionId === sent.revisionId,
        );
        lastQueuedCorrection =
          pending?.state === "queued" && pending.expectedActiveTurnId
            ? { submissionId: pending.submissionId, activeTurnId: pending.expectedActiveTurnId }
            : null;
        await setMode("command");
        caption =
          pending?.state === "queued"
            ? "This has been queued. Say No, steer the running agent within ten seconds to correct it."
            : "Prompt sent";
      } else {
        caption = `Prompt was not sent: ${dispositionReason(result)}`;
      }
      notify();
      return;
    }
    if (phrase === "send this to a new agent with the context needed on this project") {
      if (!prepared) {
        await speak("Ask Theo to prepare the next prompt before creating a new agent handoff");
        return;
      }
      const agentId = `agent-${options.createId()}`;
      const revisionId = OnTheGoPromptRevisionId.make(`revision:${options.createId()}`);
      const revised = await dispatch({
        type: "prompt.revise",
        commandId: commandId("prompt-new-agent"),
        deviceId: options.scope.deviceId,
        promptId: prepared.promptId,
        revisionId,
        content: prepared.content,
        targetChatId: prepared.targetChatId,
        targetAgentId: agentId,
        requiresWorkspace: true,
      });
      if (revised.status !== "accepted") {
        await speak(`The new agent handoff could not be prepared: ${dispositionReason(revised)}`);
        return;
      }
      const ready = await dispatch({
        type: "prompt.mark-ready",
        commandId: commandId("prompt-new-agent-ready"),
        deviceId: options.scope.deviceId,
        promptId: prepared.promptId,
        revisionId,
      });
      if (ready.status !== "accepted") {
        await speak(`The new agent handoff is not ready: ${dispositionReason(ready)}`);
        return;
      }
      prepared = { ...prepared, revisionId, targetAgentId: agentId };
      stagedHandoff = {
        agentId,
        sourceChatId: prepared.targetChatId,
        references: [`thread:${prepared.targetChatId}`, `project:${prepared.targetChatId}`],
      };
      await speak(
        `Prepared an isolated new agent with the exact prompt and bounded context from ${prepared.targetChatId}. Say Send it to create the worktree and submit it.`,
      );
      return;
    }
    if (phrase === "steer" && prepared) {
      const target = options.target();
      if (!target?.activeTurnId) {
        await speak("The selected coding agent has no running turn to steer");
        return;
      }
      preparedIntent = "steer";
      await speak("Steer selected. Say Send it to steer the running agent.");
      return;
    }
    if (phrase === "no steer the running agent") {
      if (!lastQueuedCorrection) {
        await speak("There is no unchanged queued prompt in its steering correction window");
        return;
      }
      const result = await dispatch({
        type: "pending.correct-to-steer",
        commandId: commandId("pending-correct-steer"),
        deviceId: options.scope.deviceId,
        submissionId: lastQueuedCorrection.submissionId,
        activeTurnId: lastQueuedCorrection.activeTurnId,
      });
      if (result.status === "accepted") lastQueuedCorrection = null;
      await refresh();
      await speak(
        result.status === "accepted"
          ? "The queued prompt was steered into the running agent"
          : `The prompt remains safely queued: ${dispositionReason(result)}`,
      );
      return;
    }
    if (phrase === "start dictation") {
      const result = await setMode("dictation");
      if (result.status === "accepted") {
        dictationDraft = "";
        caption =
          "Dictation State. Command words are protected as text until you say Finish dictation.";
      } else {
        caption = `Dictation could not start: ${dispositionReason(result)}`;
      }
      notify();
      return;
    }
    if (phrase === "follow this chat" || phrase === "switch follow to this chat") {
      const target = options.target();
      if (!target) {
        await speak("No chat is selected to follow");
        return;
      }
      const result = await dispatch(
        phrase === "follow this chat"
          ? {
              type: "follow.start",
              commandId: commandId("follow-start"),
              deviceId: options.scope.deviceId,
              chatId: target.targetChatId,
            }
          : {
              type: "follow.switch",
              commandId: commandId("follow-switch"),
              deviceId: options.scope.deviceId,
              chatId: target.targetChatId,
              expectedChatId: snapshot?.foundation.followedChatId ?? null,
            },
      );
      if (result.status === "accepted") {
        await refresh();
        await speak(`Following ${target.targetChatId}`);
      } else {
        await speak(`Follow selection did not change: ${dispositionReason(result)}`);
      }
      return;
    }
    const namedFollow = transcript.match(/^(follow|switch follow to)\s+(?:chat\s+)?(.+)$/i);
    if (namedFollow) {
      const resolved = resolveFollowTarget(options.followTargets?.() ?? [], namedFollow[2] ?? "");
      if (resolved._tag === "NotFound") {
        await speak("No chat uniquely matched that follow request");
        return;
      }
      if (resolved._tag === "Ambiguous") {
        await speak(`That chat name is ambiguous: ${resolved.titles.join(", ")}`);
        return;
      }
      const switching = normalize(namedFollow[1] ?? "") === "switch follow to";
      const result = await dispatch(
        switching
          ? {
              type: "follow.switch",
              commandId: commandId("follow-switch-named"),
              deviceId: options.scope.deviceId,
              chatId: resolved.chatId,
              expectedChatId: snapshot?.foundation.followedChatId ?? null,
            }
          : {
              type: "follow.start",
              commandId: commandId("follow-start-named"),
              deviceId: options.scope.deviceId,
              chatId: resolved.chatId,
            },
      );
      if (result.status === "accepted") await refresh();
      await speak(
        result.status === "accepted"
          ? `Following ${resolved.title}`
          : `Follow selection did not change: ${dispositionReason(result)}`,
      );
      return;
    }
    if (phrase === "stop following") {
      const result = await dispatch({
        type: "follow.stop",
        commandId: commandId("follow-stop"),
        deviceId: options.scope.deviceId,
      });
      if (result.status === "accepted") await refresh();
      await speak(
        result.status === "accepted"
          ? "Stopped following"
          : `Follow Mode did not stop: ${dispositionReason(result)}`,
      );
      return;
    }
    if (phrase === "resume following") {
      const result = await dispatch({
        type: "follow.resume",
        commandId: commandId("follow-resume"),
        deviceId: options.scope.deviceId,
      });
      if (result.status === "accepted") await refresh();
      await speak(
        result.status === "accepted"
          ? `Resumed following ${snapshot?.foundation.followedChatId ?? "the selected chat"}`
          : "There is no paused followed chat to resume",
      );
      return;
    }
    if (phrase === "what changed in the followed chat") {
      const result = await dispatch({
        type: "follow.catch-up",
        commandId: commandId("follow-catch-up"),
        deviceId: options.scope.deviceId,
      });
      if (result.status !== "accepted") {
        await speak("There is no followed-chat update to read");
        return;
      }
      await refresh();
      await speak(
        snapshot?.foundation.followTimeline.at(-1)?.summary ??
          "There is no followed-chat update to read",
      );
      return;
    }
    if (localMode === "dictation") {
      if (phrase === "cancel dictation") {
        dictationDraft = "";
        await setMode("command");
        caption = "Dictation cancelled";
        notify();
        return;
      }
      if (phrase === "finish dictation") {
        if (!dictationDraft) {
          caption = "The dictation draft is empty";
          notify();
          return;
        }
        const draft = dictationDraft;
        dictationDraft = "";
        await setMode("command");
        await preparePrompt(draft);
        return;
      }
      const replacement = transcript.match(/^replace dictation with\s+(.+)$/i)?.[1]?.trim();
      dictationDraft = replacement || [dictationDraft, transcript].filter(Boolean).join(" ");
      caption = `Dictation draft: ${dictationDraft}`;
      notify();
      return;
    }
    if (phrase === "continue") {
      const result = await dispatch({
        type: "owner.continue",
        commandId: commandId("owner-continue"),
        deviceId: options.scope.deviceId,
      });
      if (result.status === "accepted") {
        await refresh();
        caption = "Ownership continued. Turn on voice control when ready.";
      } else {
        caption = `Ownership could not continue: ${dispositionReason(result)}`;
      }
      notify();
      return;
    }
    if (
      phrase === "inspect theo data" ||
      phrase === "preview theo export" ||
      phrase === "show on the go diagnostics"
    ) {
      const target = options.target();
      const result = await dispatch(
        phrase === "show on the go diagnostics"
          ? {
              type: "data.diagnostics",
              commandId: commandId("data-diagnostics"),
              deviceId: options.scope.deviceId,
            }
          : phrase === "preview theo export"
            ? {
                type: "data.export-preview",
                commandId: commandId("data-export"),
                deviceId: options.scope.deviceId,
                scope: target?.targetChatId ?? "account",
              }
            : {
                type: "data.inspect",
                commandId: commandId("data-inspect"),
                deviceId: options.scope.deviceId,
                scope: target?.targetChatId ?? "account",
              },
      );
      if (result.status !== "accepted") {
        await speak(`The data request failed: ${dispositionReason(result)}`);
        return;
      }
      await refresh();
      const values =
        phrase === "show on the go diagnostics"
          ? snapshot?.foundation.diagnostics
          : phrase === "preview theo export"
            ? snapshot?.foundation.lastExportPreview
            : snapshot?.foundation.lastInspection;
      await speak(values?.join(", ") || "There is no matching On-the-Go data");
      return;
    }
    const aliasRequest = transcript.match(/^map (?:command )?(.+?) to (.+)$/i);
    if (aliasRequest) {
      const alias = aliasRequest[1]?.trim() ?? "";
      const requestedAction = normalize(aliasRequest[2] ?? "");
      const action = spokenActionIds[requestedAction];
      if (!alias || !action) {
        await speak("That command can only map to a cataloged On-the-Go action");
        return;
      }
      const result = await dispatch({
        type: "vocabulary.alias.set",
        commandId: commandId("vocabulary-alias"),
        phrase: alias,
        action,
      });
      if (result.status === "accepted") await refresh();
      await speak(
        result.status === "accepted"
          ? `Mapped ${alias} to ${requestedAction}`
          : `That command was not mapped: ${dispositionReason(result)}`,
      );
      return;
    }
    const rememberedPreference = transcript
      .match(/^remember that (?:i |I )?(?:prefer|want)\s+(.+)$/)?.[1]
      ?.trim();
    if (rememberedPreference) {
      const result = await dispatch({
        type: "profile.observe",
        commandId: commandId("profile-observe"),
        deviceId: options.scope.deviceId,
        evidence: transcript,
        preference: `voice: ${rememberedPreference}`,
        scope: "user",
        scopeId: "account",
        projectId: null,
        confidence: "explicit",
        sensitive: /password|secret|token|api[_ -]?key/i.test(rememberedPreference),
        oneOff: false,
      });
      await refresh();
      await speak(
        result.status === "accepted"
          ? (snapshot?.foundation.profileHistory.at(-1)?.updateNotice ?? "Theo preference saved")
          : `Theo did not save that preference: ${dispositionReason(result)}`,
      );
      return;
    }
    if (phrase === "undo theo preference" || phrase === "forget my theo preferences") {
      const result = await dispatch({
        type: phrase === "undo theo preference" ? "profile.undo" : "profile.reset",
        commandId: commandId("profile-change"),
        deviceId: options.scope.deviceId,
      });
      if (result.status === "accepted") await refresh();
      await speak(
        result.status === "accepted"
          ? phrase === "undo theo preference"
            ? "The last Theo preference change was undone"
            : "Theo preferences were reset"
          : `Theo preferences did not change: ${dispositionReason(result)}`,
      );
      return;
    }
    if (phrase === wakePhrases().theo) {
      const wake = await dispatch({
        type: "wake.detected",
        commandId: commandId("wake-theo"),
        deviceId: options.scope.deviceId,
        phrase: "hey theo",
      });
      if (wake.status !== "accepted") {
        caption = `Theo did not activate: ${dispositionReason(wake)}`;
        notify();
        return;
      }
      localMode = "theo-conversation";
      caption = "Theo conversation";
      notify();
      return;
    }
    if (phrase === "back to commands") {
      await setMode("command");
      caption = "Command State";
      notify();
      return;
    }
    let commandPhrase = phrase;
    const commandWake = wakePhrases().command;
    if (phrase.startsWith(`${commandWake} `)) {
      const wake = await dispatch({
        type: "wake.detected",
        commandId: commandId("wake-command"),
        deviceId: options.scope.deviceId,
        phrase: "t3",
      });
      if (wake.status !== "accepted") {
        caption = `T3 did not activate: ${dispositionReason(wake)}`;
        notify();
        return;
      }
      localMode = "command";
      commandPhrase = phrase.slice(commandWake.length).trim();
    }
    if (commandPhrase === "what was the last announcement") {
      await announceResponse("last");
      return;
    }
    if (commandPhrase === "next response") {
      await announceResponse("next");
      return;
    }
    if (commandPhrase === "previous response") {
      await announceResponse("previous");
      return;
    }
    if (commandPhrase === "what needs me") {
      const attention = snapshot?.foundation.attention.find((item) => item.resolvedAt === null);
      await speak(attention?.safeSummary ?? "There is no unresolved Attention item");
      return;
    }
    if (localMode === "theo-conversation") {
      const learnedPreference = extractTheoPreference(transcript);
      let preferenceSaved = false;
      if (learnedPreference && !learnedPreference.sensitive && !learnedPreference.oneOff) {
        const observation = await dispatch({
          type: "profile.observe",
          commandId: commandId("profile-conversation-observe"),
          deviceId: options.scope.deviceId,
          evidence: transcript,
          preference: learnedPreference.preference,
          scope: "user",
          scopeId: "account",
          projectId: null,
          confidence: "explicit",
          sensitive: false,
          oneOff: false,
        });
        preferenceSaved = observation.status === "accepted";
        if (preferenceSaved) await refresh();
      }
      theoMessages = [...theoMessages, { role: "user", text: renderOnTheGoDisplay(transcript) }];
      caption = "Theo is thinking";
      notify();
      const request = new AbortController();
      activeTheo?.abort();
      activeTheo = request;
      const result = await options.theo.ask({
        utterance: transcript,
        focusedResponse: focusedResponse()?.safeSummary ?? null,
        signal: request.signal,
      });
      if (request.signal.aborted || activeTheo !== request) return;
      activeTheo = null;
      const safeReply = renderOnTheGoSpeech(
        preferenceSaved ? `I saved that preference. ${result.reply}` : result.reply,
        options.voiceSettings?.().outputPrivacy ?? "private",
      );
      theoMessages = [...theoMessages, { role: "theo", text: safeReply }];
      await speak(safeReply);
      if (result.preparedPrompt) await preparePrompt(result.preparedPrompt);
      return;
    }
    if (localMode === "command") {
      const resolved = await dispatch({
        type: "action.resolve",
        commandId: commandId("action-resolve"),
        deviceId: options.scope.deviceId,
        phrase: commandPhrase,
        source: source === "voice" ? "voice" : "keyboard",
      });
      if (resolved.status === "accepted") {
        await refresh();
        switch (snapshot?.lastResolvedAction) {
          case "speech.stop":
            await acceptTranscript("Stop", source);
            return;
          case "prompt.send":
            await acceptTranscript("Send it", source);
            return;
          case "agent.steer":
            await acceptTranscript("Steer", source);
            return;
          case "follow.start":
            await acceptTranscript("Follow this chat", source);
            return;
          case "mode.sleep":
            await setMode("sleep");
            await speak("Sleep");
            return;
          default:
            await speak("That mapped action needs its reciprocal confirmation control");
            return;
        }
      }
    }
    caption = `Command not recognized: ${transcript}`;
    notify();
  };

  return {
    start: async () => {
      stopped = false;
      const connect = async (): Promise<void> => {
        for (;;) {
          if (stopped) return;
          try {
            await refresh();
            break;
          } catch {
            localMode = "degraded";
            caption = "The On-the-Go server is reconnecting";
            notify();
            await new Promise<void>((resolve) => {
              const wake = () => {
                retryTimer = null;
                retryWake = null;
                resolve();
              };
              retryWake = wake;
              retryTimer = setTimeout(wake, 1_000);
            });
          }
        }
        if (stopped) return;
        stopEvents?.();
        stopEvents = options.transport.subscribe(options.scope, () => {
          const previousResponseBadge = snapshot?.foundation.responseBadge ?? 0;
          const previousAttentionBadge = snapshot?.foundation.attentionBadge ?? 0;
          const previousFollowCount = snapshot?.foundation.followTimeline?.length ?? 0;
          void refresh()
            .then(() => {
              const nextResponseBadge = snapshot?.foundation.responseBadge ?? 0;
              const nextAttentionBadge = snapshot?.foundation.attentionBadge ?? 0;
              if (nextAttentionBadge > previousAttentionBadge) {
                options.speech.tone?.("attention");
              } else if (nextResponseBadge > previousResponseBadge) {
                const now = options.now?.() ?? performance.now();
                if (lastResponseToneAt === null || now - lastResponseToneAt >= 2_000) {
                  options.speech.tone?.("response");
                  lastResponseToneAt = now;
                }
              }
              const followTimeline = snapshot?.foundation.followTimeline ?? [];
              if (followTimeline.length > previousFollowCount) {
                const latest = followTimeline.at(-1);
                if (!latest) return;
                if (
                  activeSpeechSegments > 0 ||
                  localMode === "theo-conversation" ||
                  localMode === "dictation" ||
                  snapshot?.pendingConfirmation
                ) {
                  pendingFollowSummary = latest.summary;
                  caption = "A Follow Mode update is waiting";
                  notify();
                  return;
                }
                void speak(latest.summary);
              }
            })
            .catch(() => {
              localMode = "degraded";
              caption = "The On-the-Go server is reconnecting";
              notify();
            });
        });
      };
      await connect();
    },
    stop: () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      retryWake?.();
      retryWake = null;
      stopListening?.();
      stopEvents?.();
      stopListening = null;
      stopEvents = null;
      activeTheo?.abort();
      activeTheo = null;
      options.speech.stop();
      options.speech.dispose?.();
    },
    toggle: async (enabled) => {
      if (!enabled) {
        await setMode("off");
        stopListening?.();
        stopListening = null;
        caption = "On-the-Go Mode is off";
        notify();
        return;
      }
      if (!availability.available) {
        caption = availability.reason ?? "Voice input is unavailable on this device";
        notify();
        return;
      }
      if (snapshot?.owner && snapshot.owner.deviceId !== options.scope.deviceId) {
        caption = "On-the-Go Mode is active on another device";
        notify();
        return;
      }
      if (snapshot?.owner?.continueRequired) {
        caption = "Ownership was restored. Use Continue before the microphone starts.";
        notify();
        return;
      }
      if (!snapshot?.owner) {
        const owner = await dispatch({
          type: "owner.acquire",
          commandId: commandId("owner-acquire"),
          deviceId: options.scope.deviceId,
        });
        if (owner.status !== "accepted") {
          caption = `On-the-Go Mode could not start: ${dispositionReason(owner)}`;
          notify();
          return;
        }
      }
      const bargeInEnabled = options.voiceSettings?.().bargeInEnabled;
      if (bargeInEnabled !== undefined) {
        await dispatch({
          type: "barge-in.set",
          commandId: commandId("barge-in-setting"),
          deviceId: options.scope.deviceId,
          enabled: bargeInEnabled,
        });
      }
      await setMode("sleep");
      stopListening ??= options.speech.start(
        (value) => {
          void acceptTranscript(value).catch(() => {
            localMode = "degraded";
            caption = "The On-the-Go server is reconnecting";
            notify();
          });
        },
        (reason) => {
          availability = { available: false, background: availability.background, reason };
          localMode = "off";
          caption = reason;
          stopListening?.();
          stopListening = null;
          options.speech.stop();
          notify();
          void dispatch({
            type: "mode.set",
            commandId: commandId("transcription-failed"),
            mode: "off",
            source: "voice",
          }).catch(() => undefined);
        },
      );
      const configuredWake = wakePhrases();
      caption = `Listening for ${configuredWake.commandDisplay} or ${configuredWake.theoDisplay}`;
      notify();
    },
    setBargeInEnabled: async (enabled) => {
      const result = await dispatch({
        type: "barge-in.set",
        commandId: commandId("barge-in-setting"),
        deviceId: options.scope.deviceId,
        enabled,
      });
      if (result.status === "accepted") await refresh();
    },
    sleep: async (reason = "Sleep") => {
      activeTheo?.abort();
      activeTheo = null;
      options.speech.stop();
      await setMode("sleep");
      await speak(reason);
    },
    acceptTranscript,
    state: currentState,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(currentState());
      return () => listeners.delete(listener);
    },
  };
};
