import {
  makeOnTheGoController,
  type OnTheGoClientTransport,
} from "@t3tools/client-runtime/onTheGo";
import { OnTheGoDeviceId, OnTheGoVoiceSessionId, type EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo, useRef } from "react";

import { isElectron } from "../../env";
import { readEnvironmentRpcClient } from "../../environmentApi";
import { randomUUID } from "../../lib/utils";
import { useActiveEnvironmentId, useThreadShells } from "../../state/entities";
import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
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

const makeTransport = (environmentId: EnvironmentId): OnTheGoClientTransport => ({
  snapshot: async (scope) => {
    const client = readEnvironmentRpcClient(environmentId);
    if (!client) throw new Error("The On-the-Go server is unavailable");
    return client.onTheGo.snapshot(scope);
  },
  dispatch: async (command) => {
    const client = readEnvironmentRpcClient(environmentId);
    if (!client) throw new Error("The On-the-Go server is unavailable");
    return client.onTheGo.dispatch(command);
  },
  subscribe: (scope, listener) => {
    const client = readEnvironmentRpcClient(environmentId);
    return client?.onTheGo.onEvent(scope, listener) ?? (() => undefined);
  },
});

export function OnTheGoRoot() {
  const environmentId = useActiveEnvironmentId();
  const threadShells = useThreadShells();
  const threadShellsRef = useRef(threadShells);
  threadShellsRef.current = threadShells;
  const settings = usePrimarySettings((value) => value.onTheGo);
  const updateSettings = useUpdatePrimarySettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const runtime = useMemo(() => {
    if (!environmentId) return null;
    const scope = {
      deviceId: OnTheGoDeviceId.make(durableId(localStorage, DEVICE_STORAGE_KEY, "device")),
      voiceSessionId: OnTheGoVoiceSessionId.make(
        durableId(localStorage, SESSION_STORAGE_KEY, "voice-session"),
      ),
    };
    const speech = makeNativeBrowserSpeechAdapter(isElectron);
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
      transport: makeTransport(environmentId),
      speech,
      voiceSettings: () => settingsRef.current,
      theo: {
        ask: async ({ utterance, signal }) => {
          const client = readEnvironmentRpcClient(environmentId);
          if (!client) throw new Error("Theo is unavailable while the T3 Code server is offline");
          if (signal.aborted) throw new DOMException("Theo request stopped", "AbortError");
          return client.onTheGo.askTheo({ utterance, scope });
        },
      },
    });
    return { controller, speech };
  }, [environmentId]);

  useEffect(() => {
    runtime?.speech.setBargeInEnabled(settings.bargeInEnabled);
  }, [runtime, settings.bargeInEnabled]);

  return runtime ? (
    <VoiceDock
      controller={runtime.controller}
      enabledSetting={settings.enabled}
      onEnabledSettingChange={(enabled) =>
        updateSettings({ onTheGo: { ...settingsRef.current, enabled } })
      }
    />
  ) : null;
}
