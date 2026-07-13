import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as QuickActions from "expo-quick-actions";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import {
  makeOnTheGoController,
  type OnTheGoClientTransport,
  type OnTheGoController,
  type OnTheGoControllerState,
} from "@t3tools/client-runtime/onTheGo";
import {
  OnTheGoDeviceId,
  OnTheGoVoiceSessionId,
  type OnTheGoEvent,
  type OnTheGoReadScope,
} from "@t3tools/contracts";

import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useServerConfigs, useThreadShells } from "../../state/entities";
import { onTheGoMobileEnvironment } from "../../state/on-the-go";
import { makeNativeSpeechAdapter, type NativeSpeechAdapter } from "./NativeSpeechAdapter";
import { isOnTheGoQuickAction } from "./NativeQuickAction";

const DEVICE_KEY = "t3code.on-the-go.device";
const VOICE_SESSION_KEY = "t3code.on-the-go.voice-session";

const secureId = async (key: string, prefix: string) => {
  const current = await SecureStore.getItemAsync(key);
  if (current) return current;
  const next = `${prefix}:${Crypto.randomUUID()}`;
  await SecureStore.setItemAsync(key, next);
  return next;
};

const unwrapCommand = <A,>(result: AsyncResult.AsyncResult<A, unknown>): A =>
  Option.match(AsyncResult.value(result), {
    onNone: () => {
      if (result._tag === "Failure") throw Cause.squash(result.cause);
      throw new Error("The mobile On-the-Go request did not complete");
    },
    onSome: (value) => value,
  });

function NativeDockView({
  controller,
  speech,
  state,
  localDeviceId,
  outputPrivacy,
  enabledSetting,
  persistEnabled,
}: {
  readonly controller: OnTheGoController;
  readonly speech: NativeSpeechAdapter;
  readonly state: OnTheGoControllerState;
  readonly localDeviceId: string;
  readonly outputPrivacy: "private" | "public";
  readonly enabledSetting: boolean;
  readonly persistEnabled: (enabled: boolean) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [manualPhrase, setManualPhrase] = useState("");
  const [nativeAppState, setNativeAppState] = useState(AppState.currentState);
  const [audioFocus, setAudioFocus] = useState<"available" | "call">("available");
  const [startedController, setStartedController] = useState<OnTheGoController | null>(null);
  const handledInitialQuickAction = useRef(false);
  const persistEnabledRef = useRef(persistEnabled);
  persistEnabledRef.current = persistEnabled;
  useEffect(() => {
    const subscription = AppState.addEventListener("change", setNativeAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    speech.setPolicyState({
      enabled: state.enabled,
      appState:
        nativeAppState === "active"
          ? "foreground"
          : nativeAppState === "background"
            ? "background"
            : "locked",
      audioFocus,
      microphonePermission: "granted",
      ownerDeviceId: state.ownerDeviceId,
      localDeviceId,
      continueRequired: state.continueRequired,
      route: "speaker",
      outputPrivacy,
    });
  }, [audioFocus, localDeviceId, nativeAppState, outputPrivacy, speech, state]);
  useEffect(() => {
    speech.setPolicySleepListener((reason) => {
      setAudioFocus("call");
      void controller.sleep(reason);
    });
    return () => speech.setPolicySleepListener(() => undefined);
  }, [controller, speech]);
  useEffect(() => {
    let mounted = true;
    void controller.start().then(() => {
      if (mounted) setStartedController(controller);
    });
    return () => {
      mounted = false;
      controller.stop();
    };
  }, [controller]);
  useEffect(() => {
    if (startedController === controller) {
      void controller.toggle(enabledSetting).catch(() => undefined);
    }
  }, [controller, enabledSetting, startedController]);

  const toggle = async () => {
    const enabled = !state.enabled;
    await controller.toggle(enabled);
    if (controller.state().enabled === enabled) await persistEnabled(enabled);
  };
  const runManualPhrase = () => {
    const phrase = manualPhrase.trim();
    if (!phrase) return;
    setManualPhrase("");
    void controller.acceptTranscript(phrase, "composer");
  };
  useEffect(() => {
    if (startedController !== controller) return;
    const activate = (action: Parameters<typeof isOnTheGoQuickAction>[0]) => {
      if (!isOnTheGoQuickAction(action)) return;
      void controller.toggle(true).then(() => {
        if (controller.state().enabled) return persistEnabledRef.current(true);
      });
    };
    if (!handledInitialQuickAction.current) {
      handledInitialQuickAction.current = true;
      activate(QuickActions.initial);
    }
    const subscription = QuickActions.addListener(activate);
    return () => subscription.remove();
  }, [controller, startedController]);
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      {expanded ? (
        <View accessibilityLabel="On-the-Go Voice Dock" style={styles.panel}>
          <Text style={styles.title}>On-the-Go · {state.mode}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.caption}>
            {state.caption}
          </Text>
          <Text style={styles.badges}>
            Responses {state.responseBadge} · Attention {state.attentionBadge}
          </Text>
          {state.preparedPrompt ? (
            <View accessibilityLabel="Prepared Prompt" style={styles.preparedPrompt}>
              <Text style={styles.preparedTitle}>
                Prepared Prompt · {state.preparedPrompt.intent}
              </Text>
              <Text style={styles.preparedMeta}>
                Target {state.preparedPrompt.targetAgentId} · Revision{" "}
                {state.preparedPrompt.revisionId}
              </Text>
              <Text selectable style={styles.preparedContent}>
                {state.preparedPrompt.content}
              </Text>
              <Text style={styles.preparedMeta}>Review this exact revision, then say Send it.</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void toggle()}
              style={styles.action}
            >
              <Text style={styles.actionText}>{state.enabled ? "Turn off" : "Turn on"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void controller.acceptTranscript("Stop", "composer")}
              style={styles.action}
            >
              <Text style={styles.actionText}>Stop</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void controller.acceptTranscript("Send it", "composer")}
              style={styles.action}
            >
              <Text style={styles.actionText}>Send it</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Push to talk"
              onPress={() => {
                setAudioFocus("available");
                speech.armPushToTalk();
              }}
              style={styles.action}
            >
              <Text style={styles.actionText}>Push to talk</Text>
            </Pressable>
          </View>
          <View style={styles.commandRow}>
            <TextInput
              accessibilityLabel="Type a voice-equivalent command"
              value={manualPhrase}
              onChangeText={setManualPhrase}
              onSubmitEditing={runManualPhrase}
              placeholder="Type a command"
              placeholderTextColor="#7dd3fc"
              returnKeyType="send"
              style={styles.commandInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Run voice-equivalent command"
              onPress={runManualPhrase}
              style={styles.action}
            >
              <Text style={styles.actionText}>Run</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setExpanded(false)}>
            <Text style={styles.close}>Collapse</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open On-the-Go Voice Dock. ${state.responseBadge + state.attentionBadge} notifications.`}
          onPress={() => setExpanded(true)}
          style={styles.fab}
        >
          <Text style={styles.fabText}>🎙 {state.responseBadge + state.attentionBadge || ""}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function OnTheGoNativeDock() {
  const serverConfigs = useServerConfigs();
  const threads = useThreadShells();
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const [scope, setScope] = useState<OnTheGoReadScope | null>(null);
  const [state, setState] = useState<OnTheGoControllerState | null>(null);
  const listeners = useRef(new Set<(event: OnTheGoEvent) => void>());
  const entry = serverConfigs.entries().next().value;
  const environmentId = entry?.[0] ?? null;
  const serverConfig = entry?.[1] ?? null;
  const snapshotCommand = useAtomCommand(onTheGoMobileEnvironment.snapshot, {
    reportFailure: false,
  });
  const dispatchCommand = useAtomCommand(onTheGoMobileEnvironment.dispatch, {
    reportFailure: false,
  });
  const theoCommand = useAtomCommand(onTheGoMobileEnvironment.askTheo, { reportFailure: false });
  const settingsCommand = useAtomCommand(onTheGoMobileEnvironment.updateSettings, {
    reportFailure: false,
  });
  const events = useEnvironmentQuery(
    environmentId && scope
      ? onTheGoMobileEnvironment.eventAtom({ environmentId, input: scope })
      : null,
  );

  useEffect(() => {
    void Promise.all([
      secureId(DEVICE_KEY, "mobile-device"),
      secureId(VOICE_SESSION_KEY, "voice-session"),
    ]).then(([deviceId, voiceSessionId]) => {
      setScope({
        deviceId: OnTheGoDeviceId.make(deviceId),
        voiceSessionId: OnTheGoVoiceSessionId.make(voiceSessionId),
      });
    });
  }, []);

  useEffect(() => {
    if (!events.data) return;
    for (const listener of listeners.current) listener(events.data);
  }, [events.data]);

  const controller = useMemo(() => {
    if (!environmentId || !scope || !serverConfig) return null;
    const speech = makeNativeSpeechAdapter(serverConfig.settings.onTheGo);
    speech.setBargeInEnabled(serverConfig.settings.onTheGo.bargeInEnabled);
    const latestTarget = () =>
      threadsRef.current
        .filter((thread) => thread.environmentId === environmentId)
        .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
    const transport: OnTheGoClientTransport = {
      snapshot: async (input) => unwrapCommand(await snapshotCommand({ environmentId, input })),
      dispatch: async (input) => unwrapCommand(await dispatchCommand({ environmentId, input })),
      subscribe: (_input, listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    };
    const controller = makeOnTheGoController({
      scope,
      createId: Crypto.randomUUID,
      transport,
      speech,
      voiceSettings: () => serverConfig.settings.onTheGo,
      target: () => {
        const target = latestTarget();
        return target
          ? {
              targetChatId: target.id,
              targetAgentId: target.id,
              activeTurnId:
                target.latestTurn?.state === "running" ? target.latestTurn.turnId : null,
            }
          : null;
      },
      theo: {
        ask: async ({ utterance, signal }) => {
          if (signal.aborted) throw new Error("Theo stopped");
          return unwrapCommand(await theoCommand({ environmentId, input: { utterance, scope } }));
        },
      },
    });
    return { controller, speech };
  }, [dispatchCommand, environmentId, scope, serverConfig, snapshotCommand, theoCommand]);

  useEffect(
    () => (controller ? controller.controller.subscribe(setState) : undefined),
    [controller],
  );
  if (!controller || !state || !serverConfig || !scope) return null;
  return (
    <NativeDockView
      controller={controller.controller}
      speech={controller.speech}
      state={state}
      localDeviceId={scope.deviceId}
      outputPrivacy={serverConfig.settings.onTheGo.outputPrivacy}
      enabledSetting={serverConfig.settings.onTheGo.enabled}
      persistEnabled={async (enabled) => {
        unwrapCommand(
          await settingsCommand({
            environmentId: environmentId!,
            input: { patch: { onTheGo: { enabled } } },
          }),
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", right: 16, bottom: 32, zIndex: 100 },
  fab: {
    minWidth: 58,
    minHeight: 58,
    borderRadius: 29,
    backgroundColor: "#0c4a6e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  fabText: { color: "white", fontWeight: "700" },
  panel: { width: 340, borderRadius: 20, padding: 16, backgroundColor: "#082f49", gap: 10 },
  title: { color: "white", fontSize: 16, fontWeight: "700" },
  caption: { color: "#e0f2fe", fontSize: 14 },
  badges: { color: "#7dd3fc", fontSize: 12 },
  preparedPrompt: { borderRadius: 12, backgroundColor: "#064e3b", padding: 10, gap: 4 },
  preparedTitle: { color: "#a7f3d0", fontSize: 12, fontWeight: "700" },
  preparedMeta: { color: "#6ee7b7", fontSize: 11 },
  preparedContent: { color: "white", fontSize: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  commandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  commandInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#0c4a6e",
    color: "white",
    paddingHorizontal: 12,
  },
  action: {
    borderRadius: 12,
    backgroundColor: "#0369a1",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionText: { color: "white", fontWeight: "600" },
  close: { color: "#bae6fd", textAlign: "right", paddingVertical: 4 },
});
