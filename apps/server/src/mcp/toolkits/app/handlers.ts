import * as Effect from "effect/Effect";
import {
  BrowserAutomationUnavailableError,
  type AppAutomationOperation,
  type AppAutomationSnapshot,
  type AppAutomationStatus,
} from "@t3tools/contracts";

import * as AppAutomationBroker from "../../AppAutomationBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { AppAutomationToolkit, AppSnapshotToolkit, AppStandardToolkit } from "./tools.ts";

const requireDesktopShellScope = Effect.fn("AppToolkit.requireDesktopShellScope")(function* () {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  if (!scope.capabilities.has("desktop-shell")) {
    return yield* new BrowserAutomationUnavailableError({
      message: "MCP credential does not grant local T3 Code shell control.",
    });
  }
  return scope;
});

const invoke = Effect.fn("AppToolkit.invoke")(function* <A>(
  operation: AppAutomationOperation,
  input: unknown,
  timeoutMs?: number,
): Effect.fn.Return<
  A,
  import("@t3tools/contracts").AppAutomationError,
  McpInvocationContext.McpInvocationContext | AppAutomationBroker.AppAutomationBroker
> {
  const scope = yield* requireDesktopShellScope();
  const broker = yield* AppAutomationBroker.AppAutomationBroker;
  return yield* broker.invoke<A>({
    scope,
    operation,
    input,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
});

const handlers = {
  app_status: () => invoke<AppAutomationStatus>("status", {}),
  app_show: () => invoke<AppAutomationStatus>("show", {}),
  app_snapshot: () => invoke<AppAutomationSnapshot>("snapshot", {}),
  app_click: (input) => invoke<void>("click", input, input.timeoutMs).pipe(Effect.as(null)),
  app_type: (input) => invoke<void>("type", input, input.timeoutMs).pipe(Effect.as(null)),
  app_press: (input) => invoke<void>("press", input).pipe(Effect.as(null)),
  app_scroll: (input) => invoke<void>("scroll", input).pipe(Effect.as(null)),
  app_evaluate: (input) =>
    invoke<unknown>("evaluate", input).pipe(Effect.map((result) => result ?? null)),
  app_wait_for: (input) => invoke<void>("waitFor", input, input.timeoutMs).pipe(Effect.as(null)),
} satisfies Parameters<typeof AppAutomationToolkit.toLayer>[0];

const { app_snapshot, ...standardHandlers } = handlers;

export const AppStandardToolkitHandlersLive = AppStandardToolkit.toLayer(standardHandlers);

export const AppSnapshotToolkitHandlersLive = AppSnapshotToolkit.toLayer({
  app_snapshot,
});

export const AppAutomationToolkitHandlersLive = AppAutomationToolkit.toLayer(handlers);
