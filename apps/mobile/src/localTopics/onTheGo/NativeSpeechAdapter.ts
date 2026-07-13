import { renderOnTheGoSpeech, type OnTheGoSpeechAdapter } from "@t3tools/client-runtime/onTheGo";
import type { OnTheGoSettings } from "@t3tools/contracts";
import { setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import {
  decideNativeVoicePolicy,
  makeNativeRecognitionOptions,
  resolveNativeSpeechSelection,
  shouldAcceptNativeTranscript,
  type NativeVoicePolicyState,
} from "./NativeVoicePolicy";

export interface NativeSpeechAdapter extends OnTheGoSpeechAdapter {
  readonly setBargeInEnabled: (enabled: boolean) => void;
  readonly setPolicyState: (state: NativeVoicePolicyState) => void;
  readonly setPolicySleepListener: (listener: (reason: string) => void) => void;
  readonly armPushToTalk: () => void;
}

export const makeNativeSpeechAdapter = (
  settings: OnTheGoSettings,
  language = "en-GB",
): NativeSpeechAdapter => {
  const selection = resolveNativeSpeechSelection(settings);
  const unavailableReason = selection.reason;
  let active = false;
  let disposed = false;
  let bargeInEnabled = true;
  let pushToTalkArmed = false;
  let speaking = false;
  let recognitionRunning = false;
  let listener: ((transcript: string) => void) | null = null;
  let policySleepListener: ((reason: string) => void) | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let policyState: NativeVoicePolicyState = {
    enabled: false,
    appState: "foreground",
    audioFocus: "available",
    microphonePermission: "granted",
    ownerDeviceId: null,
    localDeviceId: "unbound",
    continueRequired: false,
    route: "speaker",
    outputPrivacy: settings.outputPrivacy,
  };
  let policyDecision = decideNativeVoicePolicy(policyState);

  const stopRecognition = () => {
    recognitionRunning = false;
    ExpoSpeechRecognitionModule.abort();
  };

  const begin = async () => {
    if (unavailableReason || !policyDecision.listen || recognitionRunning) return;
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      policyState = { ...policyState, microphonePermission: "denied" };
      policyDecision = decideNativeVoicePolicy(policyState);
      policySleepListener?.("Microphone permission was denied. On-the-Go is sleeping.");
      return;
    }
    if (disposed || !active || !policyDecision.listen) return;
    await setAudioModeAsync({
      allowsRecording: true,
      allowsBackgroundRecording: true,
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
      shouldRouteThroughEarpiece: false,
    });
    recognitionRunning = true;
    ExpoSpeechRecognitionModule.start(makeNativeRecognitionOptions(settings, language));
  };
  const scheduleRestart = () => {
    if (!active || disposed || restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      void begin();
    }, 250);
  };
  const resultSubscription = ExpoSpeechRecognitionModule.addListener("result", (event) => {
    const transcript = event.results[0]?.transcript?.trim();
    if (!event.isFinal || !transcript) return;
    const accepted = shouldAcceptNativeTranscript({
      transcript,
      speaking,
      bargeInEnabled,
      pushToTalkArmed,
    });
    pushToTalkArmed = false;
    if (!accepted) return;
    if (speaking) void Speech.stop();
    listener?.(transcript);
  });
  const endSubscription = ExpoSpeechRecognitionModule.addListener("end", () => {
    recognitionRunning = false;
    scheduleRestart();
  });
  const errorSubscription = ExpoSpeechRecognitionModule.addListener("error", (event) => {
    recognitionRunning = false;
    if (event.error === "interrupted") {
      policyState = { ...policyState, audioFocus: "call" };
      policyDecision = decideNativeVoicePolicy(policyState);
      void Speech.stop();
      policySleepListener?.(
        "A call or system audio interruption paused On-the-Go. Say Continue when ready.",
      );
      return;
    }
    if (event.error !== "aborted") scheduleRestart();
  });

  return {
    availability: () => ({
      available: !disposed && unavailableReason === null,
      background: true,
      ...(unavailableReason ? { reason: unavailableReason } : {}),
    }),
    start: (nextListener) => {
      listener = nextListener;
      active = true;
      void begin();
      return () => {
        active = false;
        listener = null;
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = null;
        stopRecognition();
      };
    },
    speak: (text) => {
      if (!policyDecision.speak) return Promise.resolve();
      const rendered = renderOnTheGoSpeech(
        text,
        policyDecision.speechDetail === "detail" ? "private" : "public",
      );
      return new Promise<void>((resolve, reject) => {
        speaking = true;
        Speech.speak(rendered, {
          language,
          useApplicationAudioSession: true,
          onDone: () => {
            speaking = false;
            resolve();
          },
          onStopped: () => {
            speaking = false;
            resolve();
          },
          onError: (error) => {
            speaking = false;
            reject(error);
          },
        });
      });
    },
    stop: () => {
      speaking = false;
      void Speech.stop();
    },
    tone: (kind) => {
      if (!policyDecision.tones) return;
      void Haptics.notificationAsync(
        kind === "attention"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      );
    },
    setBargeInEnabled: (enabled) => {
      bargeInEnabled = enabled;
    },
    setPolicyState: (state) => {
      policyState = state;
      policyDecision = decideNativeVoicePolicy(state);
      if (!policyDecision.listen) stopRecognition();
      if (!policyDecision.speak) void Speech.stop();
      if (active && policyDecision.listen) void begin();
    },
    setPolicySleepListener: (nextListener) => {
      policySleepListener = nextListener;
    },
    armPushToTalk: () => {
      pushToTalkArmed = true;
      policyState = { ...policyState, audioFocus: "available" };
      policyDecision = decideNativeVoicePolicy(policyState);
      if (!active) return;
      stopRecognition();
      scheduleRestart();
    },
    dispose: () => {
      disposed = true;
      active = false;
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = null;
      stopRecognition();
      void Speech.stop();
      resultSubscription.remove();
      endSubscription.remove();
      errorSubscription.remove();
    },
  };
};
