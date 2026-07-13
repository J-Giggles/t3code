import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

export const onTheGoMobileEnvironment = {
  snapshot: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "mobile:on-the-go:snapshot",
    tag: WS_METHODS.onTheGoSnapshot,
  }),
  dispatch: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "mobile:on-the-go:dispatch",
    tag: WS_METHODS.onTheGoDispatch,
  }),
  askTheo: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "mobile:on-the-go:theo",
    tag: WS_METHODS.onTheGoTheo,
  }),
  updateSettings: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "mobile:on-the-go:settings",
    tag: WS_METHODS.serverUpdateSettings,
  }),
  eventAtom: createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
    label: "mobile:on-the-go:events",
    tag: WS_METHODS.subscribeOnTheGoEvents,
  }),
};
