import {
  AppAutomationSnapshot,
  AppAutomationStatus,
  DesktopAppAutomationClickInputSchema,
  DesktopAppAutomationEvaluateInputSchema,
  DesktopAppAutomationPressInputSchema,
  DesktopAppAutomationScrollInputSchema,
  DesktopAppAutomationTypeInputSchema,
  DesktopAppAutomationWaitForInputSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as AppAutomationManager from "../../appAutomation/AppAutomationManager.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

export const status = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_STATUS_CHANNEL,
  payload: Schema.Void,
  result: AppAutomationStatus,
  handler: Effect.fn("desktop.ipc.appAutomation.status")(function* () {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    return yield* manager.status();
  }),
});

export const show = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_SHOW_CHANNEL,
  payload: Schema.Void,
  result: AppAutomationStatus,
  handler: Effect.fn("desktop.ipc.appAutomation.show")(function* () {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    return yield* manager.show();
  }),
});

export const snapshot = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_SNAPSHOT_CHANNEL,
  payload: Schema.Void,
  result: AppAutomationSnapshot,
  handler: Effect.fn("desktop.ipc.appAutomation.snapshot")(function* () {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    return yield* manager.snapshot();
  }),
});

export const click = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_CLICK_CHANNEL,
  payload: DesktopAppAutomationClickInputSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.appAutomation.click")(function* ({ input }) {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    yield* manager.click(input);
  }),
});

export const type = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_TYPE_CHANNEL,
  payload: DesktopAppAutomationTypeInputSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.appAutomation.type")(function* ({ input }) {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    yield* manager.type(input);
  }),
});

export const press = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_PRESS_CHANNEL,
  payload: DesktopAppAutomationPressInputSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.appAutomation.press")(function* ({ input }) {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    yield* manager.press(input);
  }),
});

export const scroll = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_SCROLL_CHANNEL,
  payload: DesktopAppAutomationScrollInputSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.appAutomation.scroll")(function* ({ input }) {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    yield* manager.scroll(input);
  }),
});

export const evaluate = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_EVALUATE_CHANNEL,
  payload: DesktopAppAutomationEvaluateInputSchema,
  result: Schema.Unknown,
  handler: Effect.fn("desktop.ipc.appAutomation.evaluate")(function* ({ input }) {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    return yield* manager.evaluate(input);
  }),
});

export const waitFor = makeIpcMethod({
  channel: IpcChannels.APP_AUTOMATION_WAIT_FOR_CHANNEL,
  payload: DesktopAppAutomationWaitForInputSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.appAutomation.waitFor")(function* ({ input }) {
    const manager = yield* AppAutomationManager.AppAutomationManager;
    yield* manager.waitFor(input);
  }),
});

export const methods = [
  status,
  show,
  snapshot,
  click,
  type,
  press,
  scroll,
  evaluate,
  waitFor,
] as const;
