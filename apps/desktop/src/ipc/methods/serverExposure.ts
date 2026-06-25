import {
  AdvertisedEndpoint,
  DesktopServerExposureModeSchema,
  DesktopServerExposureStateSchema,
  DesktopTailscaleAccessEnableInputSchema,
  DesktopTailscaleAccessStateSchema,
  DesktopTailscaleServeRouteProbeInputSchema,
  DesktopTailscaleServeRouteProbeResultSchema,
  DesktopTailscaleServePathUpdateInputSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopLifecycle from "../../app/DesktopLifecycle.ts";
import * as DesktopServerExposure from "../../backend/DesktopServerExposure.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

const SetTailscaleServeEnabledInput = Schema.Struct({
  enabled: Schema.Boolean,
  port: Schema.optionalKey(Schema.Number),
  servePath: Schema.optionalKey(Schema.String),
});

const relaunchForTailscaleAccessChange = Effect.fn(
  "desktop.ipc.serverExposure.relaunchForTailscaleAccessChange",
)(function* (change: DesktopServerExposure.DesktopServerExposureChange) {
  if (!change.requiresRelaunch) {
    return;
  }

  const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
  yield* lifecycle.relaunch(
    change.state.tailscaleServeEnabled ? "tailscale-access-enabled" : "tailscale-access-disabled",
  );
});

export const getServerExposureState = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_SERVER_EXPOSURE_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.getState")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.getState;
  }),
});

export const setServerExposureMode = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_SERVER_EXPOSURE_MODE_CHANNEL,
  payload: DesktopServerExposureModeSchema,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.setMode")(function* (mode) {
    const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.setMode(mode);
    if (change.requiresRelaunch) {
      yield* lifecycle.relaunch(`serverExposureMode=${mode}`);
    }
    return change.state;
  }),
});

export const setTailscaleServeEnabled = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_TAILSCALE_SERVE_ENABLED_CHANNEL,
  payload: SetTailscaleServeEnabledInput,
  result: DesktopServerExposureStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.setTailscaleServeEnabled")(function* (input) {
    const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.setTailscaleServeEnabled(input);
    if (change.requiresRelaunch) {
      yield* lifecycle.relaunch(
        change.state.tailscaleServeEnabled ? "tailscale-serve-enabled" : "tailscale-serve-disabled",
      );
    }
    return change.state;
  }),
});

export const getAdvertisedEndpoints = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_ADVERTISED_ENDPOINTS_CHANNEL,
  payload: Schema.Void,
  result: Schema.Array(AdvertisedEndpoint),
  handler: Effect.fn("desktop.ipc.serverExposure.getAdvertisedEndpoints")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.getAdvertisedEndpoints;
  }),
});

export const getTailscaleAccessState = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_TAILSCALE_ACCESS_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopTailscaleAccessStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.getTailscaleAccessState")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.getTailscaleAccessState();
  }),
});

export const enableTailscaleAccess = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.ENABLE_TAILSCALE_ACCESS_CHANNEL,
  payload: Schema.UndefinedOr(DesktopTailscaleAccessEnableInputSchema),
  result: DesktopTailscaleAccessStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.enableTailscaleAccess")(function* (input) {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.enableTailscaleAccess(input);
    yield* relaunchForTailscaleAccessChange(change);
    return yield* serverExposure.getTailscaleAccessState({ probe: true });
  }),
});

export const disableTailscaleAccess = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.DISABLE_TAILSCALE_ACCESS_CHANNEL,
  payload: Schema.Void,
  result: DesktopTailscaleAccessStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.disableTailscaleAccess")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.disableTailscaleAccess;
    yield* relaunchForTailscaleAccessChange(change);
    return yield* serverExposure.getTailscaleAccessState({ probe: true });
  }),
});

export const repairTailscaleAccess = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.REPAIR_TAILSCALE_ACCESS_CHANNEL,
  payload: Schema.Void,
  result: DesktopTailscaleAccessStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.repairTailscaleAccess")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.repairTailscaleAccess;
  }),
});

export const probeTailscaleAccess = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PROBE_TAILSCALE_ACCESS_CHANNEL,
  payload: Schema.Void,
  result: DesktopTailscaleAccessStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.probeTailscaleAccess")(function* () {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.probeTailscaleAccess;
  }),
});

export const checkTailscaleServeRoute = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.CHECK_TAILSCALE_SERVE_ROUTE_CHANNEL,
  payload: DesktopTailscaleServeRouteProbeInputSchema,
  result: DesktopTailscaleServeRouteProbeResultSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.checkTailscaleServeRoute")(function* (input) {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    return yield* serverExposure.checkTailscaleServeRoute(input);
  }),
});

export const updateTailscaleServePath = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.UPDATE_TAILSCALE_SERVE_PATH_CHANNEL,
  payload: DesktopTailscaleServePathUpdateInputSchema,
  result: DesktopTailscaleAccessStateSchema,
  handler: Effect.fn("desktop.ipc.serverExposure.updateTailscaleServePath")(function* (input) {
    const serverExposure = yield* DesktopServerExposure.DesktopServerExposure;
    const change = yield* serverExposure.updateTailscaleServePath(input);
    if (change.requiresRelaunch) {
      const lifecycle = yield* DesktopLifecycle.DesktopLifecycle;
      yield* lifecycle.relaunch(`tailscale-serve-path=${change.state.servePath}`);
    }
    return change.state;
  }),
});
