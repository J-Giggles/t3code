import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
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
import { makeNativeSpeechAdapter } from "./NativeSpeechAdapter";

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
  state,
  enabledSetting,
  persistEnabled,
}: {
  readonly controller: OnTheGoController;
  readonly state: OnTheGoControllerState;
  readonly enabledSetting: boolean;
  readonly persistEnabled: (enabled: boolean) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [startedController, setStartedController] = useState<OnTheGoController | null>(null);
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
    const speech = makeNativeSpeechAdapter();
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
    return makeOnTheGoController({
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
  }, [dispatchCommand, environmentId, scope, serverConfig, snapshotCommand, theoCommand]);

  useEffect(() => (controller ? controller.subscribe(setState) : undefined), [controller]);
  if (!controller || !state || !serverConfig) return null;
  return (
    <NativeDockView
      controller={controller}
      state={state}
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
  row: { flexDirection: "row", gap: 8 },
  action: {
    borderRadius: 12,
    backgroundColor: "#0369a1",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  actionText: { color: "white", fontWeight: "600" },
  close: { color: "#bae6fd", textAlign: "right", paddingVertical: 4 },
});
