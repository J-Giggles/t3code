import type * as Electron from "electron";

type OnTheGoWindow = Pick<Electron.BrowserWindow, "once" | "webContents">;
type NativeMediaAccess = Pick<
  Electron.SystemPreferences,
  "askForMediaAccess" | "getMediaAccessStatus"
>;

type OnTheGoDesktopVoiceOptions = {
  readonly platform: NodeJS.Platform;
  readonly nativeMediaAccess?: NativeMediaAccess;
};

export const setOnTheGoBackgroundEnabled = (
  window: Pick<Electron.BrowserWindow, "webContents">,
  enabled: boolean,
) => {
  window.webContents.setBackgroundThrottling(!enabled);
};

export const configureOnTheGoDesktopVoice = (
  window: OnTheGoWindow,
  options: OnTheGoDesktopVoiceOptions,
) => {
  const browserSession = window.webContents.session;
  if (!browserSession?.setPermissionRequestHandler) return;
  browserSession.setPermissionRequestHandler(
    (requestingContents, permission, callback, details) => {
      const mediaTypes = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
      const audioOnly =
        mediaTypes.length > 0 && mediaTypes.every((type: string) => type === "audio");
      const browserRequestAllowed =
        requestingContents.id === window.webContents.id && permission === "media" && audioOnly;
      if (!browserRequestAllowed) {
        callback(false);
        return;
      }

      if (options.platform !== "darwin") {
        callback(true);
        return;
      }

      const nativeMediaAccess = options.nativeMediaAccess;
      if (!nativeMediaAccess) {
        callback(false);
        return;
      }

      let status: ReturnType<NativeMediaAccess["getMediaAccessStatus"]>;
      try {
        status = nativeMediaAccess.getMediaAccessStatus("microphone");
      } catch {
        callback(false);
        return;
      }

      if (status === "granted") {
        callback(true);
        return;
      }
      if (status !== "not-determined") {
        callback(false);
        return;
      }

      void nativeMediaAccess.askForMediaAccess("microphone").then(
        (granted) => callback(granted),
        () => callback(false),
      );
    },
  );
  window.once("closed", () => browserSession.setPermissionRequestHandler(null));
};
