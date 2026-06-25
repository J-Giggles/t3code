import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { registerConnectedDeviceNotifications } from "./pushNotifications";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        eas: {
          projectId: "expo-project-id",
        },
      },
    },
  },
}));

vi.mock("expo-notifications", () => ({
  getExpoPushTokenAsync: vi.fn(() => Promise.resolve({ data: "ExponentPushToken[test]" })),
  getPermissionsAsync: vi.fn(() => Promise.resolve({ status: "granted" })),
  requestPermissionsAsync: vi.fn(() => Promise.resolve({ status: "granted" })),
  setNotificationHandler: vi.fn(),
}));

describe("registerConnectedDeviceNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Constants.expoConfig!.extra = {
      eas: {
        projectId: "expo-project-id",
      },
    };
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
      status: "granted",
    } as never);
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: "ExponentPushToken[test]",
    } as never);
  });

  it("registers an Expo push token with the connected environment", async () => {
    const client = {
      server: {
        registerPushNotifications: vi.fn(() => Promise.resolve({ registered: true })),
      },
    };

    await registerConnectedDeviceNotifications(client as never);

    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: "expo-project-id",
    });
    expect(client.server.registerPushNotifications).toHaveBeenCalledWith({
      platform: "expo",
      token: "ExponentPushToken[test]",
    });
  });

  it("does not register when notification permission is denied", async () => {
    const client = {
      server: {
        registerPushNotifications: vi.fn(() => Promise.resolve({ registered: true })),
      },
    };
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: "denied" } as never);
    vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({
      status: "denied",
    } as never);

    await registerConnectedDeviceNotifications(client as never);

    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(client.server.registerPushNotifications).not.toHaveBeenCalled();
  });
});
