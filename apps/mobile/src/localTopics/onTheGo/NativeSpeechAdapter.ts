import type { OnTheGoSpeechAdapter } from "@t3tools/client-runtime/onTheGo";
import { setAudioModeAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

export interface NativeSpeechAdapter extends OnTheGoSpeechAdapter {
  readonly setBargeInEnabled: (enabled: boolean) => void;
}

export const makeNativeSpeechAdapter = (language = "en-GB"): NativeSpeechAdapter => {
  let active = false;
  let disposed = false;
  let bargeInEnabled = true;
  let speaking = false;
  let listener: ((transcript: string) => void) | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const begin = async () => {
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted || disposed || !active) return;
    await setAudioModeAsync({
      allowsRecording: true,
      allowsBackgroundRecording: true,
      shouldPlayInBackground: true,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
      shouldRouteThroughEarpiece: false,
    });
    ExpoSpeechRecognitionModule.start({
      lang: language,
      continuous: true,
      interimResults: false,
      requiresOnDeviceRecognition: false,
    });
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
    if (speaking && !bargeInEnabled && transcript.toLocaleLowerCase() !== "stop") return;
    if (speaking) void Speech.stop();
    listener?.(transcript);
  });
  const endSubscription = ExpoSpeechRecognitionModule.addListener("end", scheduleRestart);
  const errorSubscription = ExpoSpeechRecognitionModule.addListener("error", (event) => {
    if (event.error !== "aborted" && event.error !== "interrupted") scheduleRestart();
  });

  return {
    availability: () => ({ available: !disposed, background: true }),
    start: (nextListener) => {
      listener = nextListener;
      active = true;
      void begin();
      return () => {
        active = false;
        listener = null;
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = null;
        ExpoSpeechRecognitionModule.abort();
      };
    },
    speak: (text) =>
      new Promise<void>((resolve, reject) => {
        speaking = true;
        Speech.speak(text, {
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
      }),
    stop: () => {
      speaking = false;
      void Speech.stop();
    },
    tone: (kind) => {
      void Haptics.notificationAsync(
        kind === "attention"
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      );
    },
    setBargeInEnabled: (enabled) => {
      bargeInEnabled = enabled;
    },
    dispose: () => {
      disposed = true;
      active = false;
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = null;
      ExpoSpeechRecognitionModule.abort();
      void Speech.stop();
      resultSubscription.remove();
      endSubscription.remove();
      errorSubscription.remove();
    },
  };
};
