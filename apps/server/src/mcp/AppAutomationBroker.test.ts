import { expect, it } from "@effect/vitest";
import {
  BrowserAutomationNoFocusedOwnerError,
  BrowserAutomationUnavailableError,
  EnvironmentId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import * as AppAutomationBroker from "./AppAutomationBroker.ts";
import type { McpInvocationScope } from "./McpInvocationContext.ts";

const scope: McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("thread-1"),
  providerSessionId: "provider-session-1",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["preview", "desktop-shell"]),
  issuedAt: 1,
  expiresAt: 2,
};

it.effect("routes a request to the focused local shell owner and correlates its response", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const broker = yield* AppAutomationBroker.__testing.make;
      const requests = yield* broker.connect("client-1");
      yield* Stream.runForEach(requests, (request) =>
        broker.respond({
          requestId: request.requestId,
          ok: true,
          result: { available: true, visible: true, url: null, title: null, loading: false },
        }),
      ).pipe(Effect.forkScoped);
      yield* Effect.yieldNow;
      yield* broker.reportOwner({
        clientId: "client-1",
        environmentId: scope.environmentId,
        threadId: scope.threadId,
        visible: true,
        supportsAutomation: true,
        focusedAt: "2026-06-11T00:00:00.000Z",
      });

      const result = yield* broker.invoke<{ available: boolean }>({
        scope,
        operation: "status",
        input: {},
      });

      expect(result.available).toBe(true);
    }),
  ),
);

it.effect("rejects app automation when no focused owner exists", () =>
  Effect.gen(function* () {
    const broker = yield* AppAutomationBroker.__testing.make;
    const error = yield* broker
      .invoke<void>({ scope, operation: "status", input: {} })
      .pipe(Effect.flip);
    expect(error).toBeInstanceOf(BrowserAutomationNoFocusedOwnerError);
  }),
);

it.effect("rejects scopes without desktop-shell capability", () =>
  Effect.gen(function* () {
    const broker = yield* AppAutomationBroker.__testing.make;
    const error = yield* broker
      .invoke<void>({
        scope: { ...scope, capabilities: new Set(["preview"]) },
        operation: "status",
        input: {},
      })
      .pipe(Effect.flip);
    expect(error).toBeInstanceOf(BrowserAutomationUnavailableError);
  }),
);
