import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface ConnectedDeviceNotificationsShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

export class ConnectedDeviceNotifications extends Context.Service<
  ConnectedDeviceNotifications,
  ConnectedDeviceNotificationsShape
>()("t3/orchestration/Services/ConnectedDeviceNotifications") {}
