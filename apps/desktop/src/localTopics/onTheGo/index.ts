import type * as Electron from "electron";

type OnTheGoWindow = Pick<Electron.BrowserWindow, "once" | "webContents">;

export const configureOnTheGoDesktopVoice = (window: OnTheGoWindow) => {
  const browserSession = window.webContents.session;
  if (!browserSession?.setPermissionRequestHandler) return;
  browserSession.setPermissionRequestHandler(
    (requestingContents, permission, callback, details) => {
      const mediaTypes = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
      const audioOnly =
        mediaTypes.length > 0 && mediaTypes.every((type: string) => type === "audio");
      callback(
        requestingContents.id === window.webContents.id && permission === "media" && audioOnly,
      );
    },
  );
  window.once("closed", () => browserSession.setPermissionRequestHandler(null));
};
