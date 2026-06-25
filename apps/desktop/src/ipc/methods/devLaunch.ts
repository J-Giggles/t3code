import {
  DesktopDevLaunchCollisionPromptInput,
  DesktopDevLaunchCollisionPromptResult,
  DesktopDevLaunchLaunchInput,
  DesktopDevLaunchState,
  DesktopDevLaunchStopInput,
  DesktopDevLaunchThreadRef,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { DesktopDevAppLaunchManager } from "../../backend/DesktopDevAppLaunchManager.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const getDevLaunchState = makeIpcMethod({
  channel: IpcChannels.GET_DEV_LAUNCH_STATE_CHANNEL,
  payload: DesktopDevLaunchThreadRef,
  result: DesktopDevLaunchState,
  handler: Effect.fn("desktop.ipc.devLaunch.getState")(function* (threadRef) {
    const manager = yield* DesktopDevAppLaunchManager;
    return yield* manager.getState(threadRef);
  }),
});

export const launchDevApp = makeIpcMethod({
  channel: IpcChannels.LAUNCH_DEV_APP_CHANNEL,
  payload: DesktopDevLaunchLaunchInput,
  result: DesktopDevLaunchState,
  handler: Effect.fn("desktop.ipc.devLaunch.launch")(function* (input) {
    const manager = yield* DesktopDevAppLaunchManager;
    return yield* manager.launch(input);
  }),
});

export const stopDevApp = makeIpcMethod({
  channel: IpcChannels.STOP_DEV_APP_CHANNEL,
  payload: DesktopDevLaunchStopInput,
  result: DesktopDevLaunchState,
  handler: Effect.fn("desktop.ipc.devLaunch.stop")(function* (input) {
    const manager = yield* DesktopDevAppLaunchManager;
    return yield* manager.stop(input);
  }),
});

export const listActiveDevLaunches = makeIpcMethod({
  channel: IpcChannels.LIST_ACTIVE_DEV_LAUNCHES_CHANNEL,
  payload: Schema.Void,
  result: DesktopDevLaunchState,
  handler: Effect.fn("desktop.ipc.devLaunch.listActive")(function* () {
    const manager = yield* DesktopDevAppLaunchManager;
    return yield* manager.listActive;
  }),
});

export const buildDevLaunchCollisionPrompt = makeIpcMethod({
  channel: IpcChannels.BUILD_DEV_LAUNCH_COLLISION_PROMPT_CHANNEL,
  payload: DesktopDevLaunchCollisionPromptInput,
  result: DesktopDevLaunchCollisionPromptResult,
  handler: Effect.fn("desktop.ipc.devLaunch.buildCollisionPrompt")(function* (input) {
    const manager = yield* DesktopDevAppLaunchManager;
    return yield* manager.buildCollisionPrompt(input);
  }),
});
