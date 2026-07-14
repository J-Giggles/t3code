import { describe, expect, it, vi } from "vite-plus/test";

import { configureOnTheGoDesktopVoice, setOnTheGoBackgroundEnabled } from "./index.ts";

describe("On-the-Go desktop voice", () => {
  it("OTG-UT-020/021: grants only main-window audio capture and removes the handler on close", () => {
    const setPermissionRequestHandler = vi.fn();
    const once = vi.fn();
    const window = {
      webContents: { id: 7, session: { setPermissionRequestHandler } },
      once,
    };
    configureOnTheGoDesktopVoice(window as never, { platform: "linux" });
    const handler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const callback = vi.fn();
    handler({ id: 7 }, "media", callback, { mediaTypes: ["audio"] });
    expect(callback).toHaveBeenLastCalledWith(true);
    handler({ id: 8 }, "media", callback, { mediaTypes: ["audio"] });
    handler({ id: 7 }, "media", callback, { mediaTypes: ["video"] });
    handler({ id: 7 }, "notifications", callback, { mediaTypes: [] });
    expect(callback.mock.calls.slice(1)).toEqual([[false], [false], [false]]);
    const closeHandler = once.mock.calls[0]?.[1] as (() => void) | undefined;
    closeHandler?.();
    expect(setPermissionRequestHandler).toHaveBeenLastCalledWith(null);
  });

  it("OTG-UT-020 waits for native macOS microphone consent before granting media", async () => {
    const setPermissionRequestHandler = vi.fn();
    const window = {
      webContents: { id: 7, session: { setPermissionRequestHandler } },
      once: vi.fn(),
    };
    const nativeMediaAccess = {
      getMediaAccessStatus: vi.fn(() => "not-determined" as const),
      askForMediaAccess: vi.fn(async () => true),
    };
    configureOnTheGoDesktopVoice(window as never, {
      platform: "darwin",
      nativeMediaAccess,
    });
    const handler = setPermissionRequestHandler.mock.calls[0]?.[0];
    const callback = vi.fn();

    handler({ id: 7 }, "media", callback, { mediaTypes: ["audio"] });

    expect(callback).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true));
    expect(nativeMediaAccess.getMediaAccessStatus).toHaveBeenCalledWith("microphone");
    expect(nativeMediaAccess.askForMediaAccess).toHaveBeenCalledWith("microphone");
  });

  it("OTG-UT-021 disables background throttling only while On-the-Go is enabled", () => {
    const setBackgroundThrottling = vi.fn();
    const window = { webContents: { setBackgroundThrottling } };
    setOnTheGoBackgroundEnabled(window as never, true);
    setOnTheGoBackgroundEnabled(window as never, false);
    expect(setBackgroundThrottling.mock.calls).toEqual([[false], [true]]);
  });
});
