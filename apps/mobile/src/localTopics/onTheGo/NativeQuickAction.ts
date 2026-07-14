import type { Action } from "expo-quick-actions";

export const ON_THE_GO_QUICK_ACTION_ID = "on-the-go";

export const ON_THE_GO_QUICK_ACTION: Action = {
  id: ON_THE_GO_QUICK_ACTION_ID,
  title: "On-the-Go voice",
  subtitle: "Start hands-free control",
  icon: "shortcut_icon",
  params: { onTheGo: "start" },
};

export const isOnTheGoQuickAction = (action: Action | null | undefined) =>
  action?.id === ON_THE_GO_QUICK_ACTION_ID && action.params?.onTheGo === "start";
