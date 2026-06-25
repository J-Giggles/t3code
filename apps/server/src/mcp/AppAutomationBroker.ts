import {
  BrowserAutomationControlInterruptedError,
  BrowserAutomationExecutionError,
  BrowserAutomationInvalidSelectorError,
  BrowserAutomationNoFocusedOwnerError,
  BrowserAutomationResultTooLargeError,
  BrowserAutomationTargetNotFoundError,
  BrowserAutomationTimeoutError,
  BrowserAutomationUnavailableError,
  BrowserAutomationUnsupportedClientError,
  type AppAutomationError,
  type AppAutomationOperation,
  type AppAutomationOwner,
  type AppAutomationRequest,
  type AppAutomationResponse,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";

import { selectFocusedAutomationOwner } from "./AutomationBroker.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";

export interface AppAutomationInvokeInput {
  readonly scope: McpInvocationContext.McpInvocationScope;
  readonly operation: AppAutomationOperation;
  readonly input: unknown;
  readonly timeoutMs?: number;
}

export interface AppAutomationBrokerShape {
  readonly connect: (clientId: string) => Effect.Effect<Stream.Stream<AppAutomationRequest>>;
  readonly reportOwner: (owner: AppAutomationOwner) => Effect.Effect<void, AppAutomationError>;
  readonly clearOwner: (clientId: string) => Effect.Effect<void>;
  readonly respond: (response: AppAutomationResponse) => Effect.Effect<void, AppAutomationError>;
  readonly invoke: <A = unknown>(
    request: AppAutomationInvokeInput,
  ) => Effect.Effect<A, AppAutomationError>;
}

export class AppAutomationBroker extends Context.Service<
  AppAutomationBroker,
  AppAutomationBrokerShape
>()("t3/mcp/AppAutomationBroker") {}

interface ClientConnection {
  readonly clientId: string;
  readonly queue: Queue.Queue<AppAutomationRequest>;
}

interface PendingRequest {
  readonly clientId: string;
  readonly deferred: Deferred.Deferred<unknown, AppAutomationError>;
}

interface BrokerState {
  readonly clients: ReadonlyMap<string, ClientConnection>;
  readonly owners: ReadonlyMap<string, AppAutomationOwner>;
  readonly pending: ReadonlyMap<string, PendingRequest>;
  readonly requestSequence: number;
}

const makeResponseError = (
  error: NonNullable<AppAutomationResponse["error"]>,
): AppAutomationError => {
  switch (error._tag) {
    case "BrowserAutomationNoFocusedOwnerError":
      return new BrowserAutomationNoFocusedOwnerError({ message: error.message });
    case "BrowserAutomationUnsupportedClientError":
      return new BrowserAutomationUnsupportedClientError({ message: error.message });
    case "BrowserAutomationTargetNotFoundError":
      return new BrowserAutomationTargetNotFoundError({ message: error.message });
    case "BrowserAutomationTimeoutError":
      return new BrowserAutomationTimeoutError({ message: error.message });
    case "BrowserAutomationControlInterruptedError":
      return new BrowserAutomationControlInterruptedError({ message: error.message });
    case "BrowserAutomationInvalidSelectorError": {
      const detail =
        typeof error.detail === "object" && error.detail !== null ? error.detail : undefined;
      return new BrowserAutomationInvalidSelectorError({
        message: error.message,
        selector:
          detail && "selector" in detail && typeof detail.selector === "string"
            ? detail.selector
            : "",
      });
    }
    case "BrowserAutomationResultTooLargeError": {
      const detail =
        typeof error.detail === "object" && error.detail !== null ? error.detail : undefined;
      return new BrowserAutomationResultTooLargeError({
        message: error.message,
        maximumBytes:
          detail && "maximumBytes" in detail && typeof detail.maximumBytes === "number"
            ? detail.maximumBytes
            : 64_000,
      });
    }
    case "BrowserAutomationUnavailableError":
      return new BrowserAutomationUnavailableError({ message: error.message });
    default:
      return new BrowserAutomationExecutionError({
        message: error.message,
        detail: error.detail,
      });
  }
};

const make = Effect.gen(function* AppAutomationBrokerMake() {
  const state = yield* SynchronizedRef.make<BrokerState>({
    clients: new Map(),
    owners: new Map(),
    pending: new Map(),
    requestSequence: 0,
  });

  const disconnect = Effect.fn("AppAutomationBroker.disconnect")(function* (
    clientId: string,
    queue: ClientConnection["queue"],
  ) {
    const toFail = yield* SynchronizedRef.modify(state, (current) => {
      if (current.clients.get(clientId)?.queue !== queue) {
        return [[] as ReadonlyArray<PendingRequest>, current] as const;
      }
      const clients = new Map(current.clients);
      const owners = new Map(current.owners);
      const pending = new Map(current.pending);
      const disconnected: PendingRequest[] = [];
      clients.delete(clientId);
      owners.delete(clientId);
      for (const [requestId, entry] of pending) {
        if (entry.clientId === clientId) {
          pending.delete(requestId);
          disconnected.push(entry);
        }
      }
      return [disconnected, { ...current, clients, owners, pending }] as const;
    });
    yield* Effect.forEach(
      toFail,
      ({ deferred }) =>
        Deferred.fail(
          deferred,
          new BrowserAutomationUnavailableError({
            message: "The app automation client disconnected.",
          }),
        ),
      { discard: true },
    );
    yield* Queue.shutdown(queue);
  });

  const connect: AppAutomationBrokerShape["connect"] = Effect.fn("AppAutomationBroker.connect")(
    function* (clientId) {
      const queue = yield* Queue.unbounded<AppAutomationRequest>();
      const previous = yield* SynchronizedRef.modify(state, (current) => {
        const clients = new Map(current.clients);
        clients.set(clientId, { clientId, queue });
        return [current.clients.get(clientId), { ...current, clients }] as const;
      });
      if (previous) yield* disconnect(clientId, previous.queue);
      return Stream.fromQueue(queue).pipe(Stream.ensuring(disconnect(clientId, queue)));
    },
  );

  const reportOwner: AppAutomationBrokerShape["reportOwner"] = Effect.fn(
    "AppAutomationBroker.reportOwner",
  )(function* (owner) {
    yield* SynchronizedRef.update(state, (current) => {
      const owners = new Map(current.owners);
      owners.set(owner.clientId, owner);
      return { ...current, owners };
    });
  });

  const clearOwner: AppAutomationBrokerShape["clearOwner"] = Effect.fn(
    "AppAutomationBroker.clearOwner",
  )(function* (clientId) {
    yield* SynchronizedRef.update(state, (current) => {
      const owners = new Map(current.owners);
      owners.delete(clientId);
      return { ...current, owners };
    });
  });

  const respond: AppAutomationBrokerShape["respond"] = Effect.fn("AppAutomationBroker.respond")(
    function* (response) {
      const pending = yield* SynchronizedRef.modify(state, (current) => {
        const entry = current.pending.get(response.requestId);
        if (!entry) return [undefined, current] as const;
        const next = new Map(current.pending);
        next.delete(response.requestId);
        return [entry, { ...current, pending: next }] as const;
      });
      if (!pending) return;
      if (response.ok) {
        yield* Deferred.succeed(pending.deferred, response.result);
      } else {
        yield* Deferred.fail(
          pending.deferred,
          response.error
            ? makeResponseError(response.error)
            : new BrowserAutomationExecutionError({
                message: "App automation failed without an error payload.",
              }),
        );
      }
    },
  );

  const invoke = Effect.fn("AppAutomationBroker.invoke")(function* <A = unknown>(
    input: Parameters<AppAutomationBrokerShape["invoke"]>[0],
  ): Effect.fn.Return<A, AppAutomationError> {
    if (!input.scope.capabilities.has("desktop-shell")) {
      return yield* new BrowserAutomationUnavailableError({
        message: "MCP credential does not grant local T3 Code shell control.",
      });
    }
    const current = yield* SynchronizedRef.get(state);
    const owner = selectFocusedAutomationOwner(current.owners.values(), input.scope);
    if (!owner) {
      return yield* new BrowserAutomationNoFocusedOwnerError({
        message: "No local desktop shell host is available for this thread.",
      });
    }
    const connection = current.clients.get(owner.clientId);
    if (!connection) {
      return yield* new BrowserAutomationUnavailableError({
        message: "The desktop shell host is not connected.",
      });
    }
    const timeoutMs = input.timeoutMs ?? 15_000;
    const deferred = yield* Deferred.make<unknown, AppAutomationError>();
    const requestId = yield* SynchronizedRef.modify(state, (next) => {
      const requestId = `app-automation-${next.requestSequence}`;
      const pending = new Map(next.pending);
      pending.set(requestId, { clientId: owner.clientId, deferred });
      return [requestId, { ...next, pending, requestSequence: next.requestSequence + 1 }] as const;
    });
    const removePending = SynchronizedRef.update(state, (next) => {
      if (!next.pending.has(requestId)) return next;
      const pending = new Map(next.pending);
      pending.delete(requestId);
      return { ...next, pending };
    });
    const awaitResponse = Effect.fn("AppAutomationBroker.awaitResponse")(function* () {
      const offered = yield* Queue.offer(connection.queue, {
        requestId,
        threadId: input.scope.threadId,
        operation: input.operation,
        input: input.input,
        timeoutMs,
      });
      if (!offered) {
        return yield* new BrowserAutomationUnavailableError({
          message: "The app automation client is no longer accepting requests.",
        });
      }
      const result = yield* Deferred.await(deferred).pipe(Effect.timeoutOption(timeoutMs));
      return yield* Option.match(result, {
        onNone: () =>
          Effect.fail(
            new BrowserAutomationTimeoutError({
              message: `App automation timed out after ${timeoutMs}ms.`,
            }),
          ),
        onSome: (value) => Effect.succeed(value as A),
      });
    });
    return yield* awaitResponse().pipe(Effect.ensuring(removePending));
  });

  return AppAutomationBroker.of({ connect, reportOwner, clearOwner, respond, invoke });
}).pipe(Effect.withSpan("AppAutomationBroker.make"));

export const layer = Layer.effect(AppAutomationBroker, make);

/** Exposed for tests. */
export const __testing = {
  make,
};
