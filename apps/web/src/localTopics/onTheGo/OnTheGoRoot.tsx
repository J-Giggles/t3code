import {
  makeOnTheGoController,
  type OnTheGoClientTransport,
} from "@t3tools/client-runtime/onTheGo";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  OnTheGoDeviceId,
  OnTheGoVoiceSessionId,
  WS_METHODS,
  type EnvironmentId,
  type OnTheGoEvent,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useMemo, useRef } from "react";

import { isElectron } from "../../env";
import { randomUUID } from "../../lib/utils";
import { useActiveEnvironmentId, useThreadShells } from "../../state/entities";
import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { connectionAtomRuntime } from "../../connection/runtime";
import { useAtomCommand } from "../../state/use-atom-command";
import { makeNativeBrowserSpeechAdapter } from "./BrowserSpeechAdapter.ts";
import { VoiceDock } from "./VoiceDock.tsx";

const DEVICE_STORAGE_KEY = "t3code:on-the-go:device-id";
const SESSION_STORAGE_KEY = "t3code:on-the-go:voice-session-id";

const durableId = (storage: Storage, key: string, prefix: string) => {
  const existing = storage.getItem(key)?.trim();
  if (existing) return existing;
  const generated = `${prefix}:${randomUUID()}`;
  storage.setItem(key, generated);
  return generated;
};

const currentTarget = () => {
  const routePath = window.location.hash.replace(/^#/, "") || window.location.pathname;
  const segments = routePath.split("/").filter(Boolean);
  const threadId = segments.length >= 2 ? decodeURIComponent(segments.at(-1) ?? "") : "";
  if (!threadId || segments[0] === "settings" || segments[0] === "draft") return null;
  return { targetChatId: threadId, targetAgentId: threadId };
};

const snapshotCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "on-the-go:snapshot",
  tag: WS_METHODS.onTheGoSnapshot,
});
const dispatchCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "on-the-go:dispatch",
  tag: WS_METHODS.onTheGoDispatch,
});
const askTheoCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "on-the-go:theo",
  tag: WS_METHODS.onTheGoTheo,
});
const eventAtom = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "on-the-go:events",
  tag: WS_METHODS.subscribeOnTheGoEvents,
});

const unwrapCommand = <A, E>(result: AtomCommandResult<A, E>): A => {
  if (result._tag === "Success") return result.value;
  throw Cause.squash(result.cause);
};

function ConnectedOnTheGoRoot({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const threadShells = useThreadShells();
  const threadShellsRef = useRef(threadShells);
  threadShellsRef.current = threadShells;
  const settings = usePrimarySettings((value) => value.onTheGo);
  const updateSettings = useUpdatePrimarySettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const scope = useMemo(
    () => ({
      deviceId: OnTheGoDeviceId.make(durableId(localStorage, DEVICE_STORAGE_KEY, "device")),
      voiceSessionId: OnTheGoVoiceSessionId.make(
        durableId(localStorage, SESSION_STORAGE_KEY, "voice-session"),
      ),
    }),
    [],
  );
  const runSnapshot = useAtomCommand(snapshotCommand, { reportFailure: false });
  const runDispatch = useAtomCommand(dispatchCommand, { reportFailure: false });
  const runAskTheo = useAtomCommand(askTheoCommand, { reportFailure: false });
  const eventResult = useAtomValue(eventAtom({ environmentId, input: scope }));
  const latestEvent = Option.getOrNull(AsyncResult.value(eventResult));
  const eventListenerRef = useRef<((event: OnTheGoEvent) => void) | null>(null);

  useEffect(() => {
    if (latestEvent) eventListenerRef.current?.(latestEvent);
  }, [latestEvent]);

  const runtime = useMemo(() => {
    const transport: OnTheGoClientTransport = {
      snapshot: async (input) => unwrapCommand(await runSnapshot({ environmentId, input })),
      dispatch: async (input) => unwrapCommand(await runDispatch({ environmentId, input })),
      subscribe: (_input, listener) => {
        eventListenerRef.current = listener;
        return () => {
          if (eventListenerRef.current === listener) eventListenerRef.current = null;
        };
      },
    };
    const speech = makeNativeBrowserSpeechAdapter(isElectron, settingsRef.current);
    const controller = makeOnTheGoController({
      scope,
      target: () => {
        const target = currentTarget();
        if (!target) return null;
        const thread = threadShellsRef.current.find(
          (candidate) =>
            candidate.environmentId === environmentId && candidate.id === target.targetChatId,
        );
        return {
          ...target,
          activeTurnId: thread?.latestTurn?.state === "running" ? thread.latestTurn.turnId : null,
        };
      },
      createId: randomUUID,
      transport,
      speech,
      voiceSettings: () => settingsRef.current,
      theo: {
        ask: async ({ utterance, signal }) => {
          if (signal.aborted) throw new DOMException("Theo request stopped", "AbortError");
          return unwrapCommand(await runAskTheo({ environmentId, input: { utterance, scope } }));
        },
      },
    });
    return { controller, speech };
  }, [
    environmentId,
    runAskTheo,
    runDispatch,
    runSnapshot,
    scope,
    settings.speechModel.modelId,
    settings.speechModel.providerId,
    settings.transcriptionModel.modelId,
    settings.transcriptionModel.providerId,
  ]);

  useEffect(() => {
    runtime?.speech.setBargeInEnabled(settings.bargeInEnabled);
    if (runtime?.controller.state().enabled) {
      void runtime.controller.setBargeInEnabled(settings.bargeInEnabled).catch(() => undefined);
    }
  }, [runtime, settings.bargeInEnabled]);

  useEffect(() => {
    const setBackgroundEnabled = window.desktopBridge?.setOnTheGoBackgroundEnabled;
    if (!setBackgroundEnabled) return;
    void setBackgroundEnabled(settings.enabled);
    return () => {
      void setBackgroundEnabled(false);
    };
  }, [settings.enabled]);

  return (
    <VoiceDock
      controller={runtime.controller}
      enabledSetting={settings.enabled}
      onEnabledSettingChange={(enabled) =>
        updateSettings({ onTheGo: { ...settingsRef.current, enabled } })
      }
    />
  );
}

export function OnTheGoRoot() {
  const environmentId = useActiveEnvironmentId();
  return environmentId ? <ConnectedOnTheGoRoot environmentId={environmentId} /> : null;
}
