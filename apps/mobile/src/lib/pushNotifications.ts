import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import type { WsRpcClient } from "@t3tools/client-runtime/wsRpcClient";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getExpoProjectId(): string | undefined {
  const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof easProjectId === "string" && easProjectId.length > 0 ? easProjectId : undefined;
}

export async function registerConnectedDeviceNotifications(client: WsRpcClient): Promise<void> {
  const currentPermissions = await Notifications.getPermissionsAsync();
  const permissions =
    currentPermissions.status === "granted"
      ? currentPermissions
      : await Notifications.requestPermissionsAsync();

  if (permissions.status !== "granted") {
    return;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    return;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await client.server.registerPushNotifications({
    platform: "expo",
    token: token.data,
  });
}
