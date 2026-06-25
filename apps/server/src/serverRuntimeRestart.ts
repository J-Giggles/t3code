import {
  type ServerLifecycleStreamEvent,
  type ServerRestartRuntimeInput,
  type ServerRestartRuntimeResult,
  type ServerRuntimeRestartCapability,
  ServerRuntimeRestartError,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Context from "effect/Context";
import {
  HttpBody,
  HttpClient,
  HttpClientResponse,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import * as NodeCrypto from "node:crypto";

import { ServerLifecycleEvents } from "./serverLifecycleEvents.ts";

export const RUNTIME_RESTART_REQUIRED_PATH = "/.well-known/t3/runtime/restart-required";

const RESTART_CONTROL_URL_ENV = "T3CODE_RESTART_CONTROL_URL";
const RESTART_CONTROL_TOKEN_ENV = "T3CODE_RESTART_CONTROL_TOKEN";
const RESTART_CONTROL_KIND_ENV = "T3CODE_RESTART_CONTROL_KIND";
const RESTART_REQUEST_TIMEOUT_MS = 2_000;

type RestartControlKind = Extract<
  ServerRuntimeRestartCapability["kind"],
  "desktop-dev-supervisor" | "standalone-supervisor"
>;

interface RestartControlConfig {
  readonly url: URL;
  readonly token: string;
  readonly kind: RestartControlKind;
}

export interface ServerRuntimeRestartShape {
  readonly capability: Effect.Effect<ServerRuntimeRestartCapability>;
  readonly notifyRequired: (input?: {
    readonly reason?: string;
  }) => Effect.Effect<ServerLifecycleStreamEvent>;
  readonly notifyRequiredFromSupervisor: (input: {
    readonly authorization: string | undefined;
    readonly reason?: string;
  }) => Effect.Effect<ServerLifecycleStreamEvent, ServerRuntimeRestartError>;
  readonly restart: (
    input: ServerRestartRuntimeInput,
  ) => Effect.Effect<ServerRestartRuntimeResult, ServerRuntimeRestartError>;
}

export class ServerRuntimeRestart extends Context.Service<
  ServerRuntimeRestart,
  ServerRuntimeRestartShape
>()("t3/serverRuntimeRestart") {}

function readNonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function normalizeReason(reason: string | undefined, fallback: string): string {
  const normalized = reason?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function resolveControlKind(): RestartControlKind {
  return readNonEmptyEnv(RESTART_CONTROL_KIND_ENV) === "standalone-supervisor"
    ? "standalone-supervisor"
    : "desktop-dev-supervisor";
}

function resolveControlConfig(): RestartControlConfig | null {
  const rawUrl = readNonEmptyEnv(RESTART_CONTROL_URL_ENV);
  const token = readNonEmptyEnv(RESTART_CONTROL_TOKEN_ENV);
  if (!rawUrl || !token) {
    return null;
  }

  try {
    return {
      url: new URL(rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`),
      token,
      kind: resolveControlKind(),
    };
  } catch {
    return null;
  }
}

function capabilityForControlConfig(
  controlConfig: RestartControlConfig | null,
): ServerRuntimeRestartCapability {
  if (!controlConfig) {
    return {
      available: false,
      kind: "unsupported",
      scope: "full-setup",
      reason: "No restart supervisor is configured.",
    };
  }

  return {
    available: true,
    kind: controlConfig.kind,
    scope: "full-setup",
  };
}

function bearerTokenFromAuthorization(authorization: string | undefined): string | null {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) {
    return null;
  }
  const token = authorization.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

function secureTokenEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && NodeCrypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export const makeServerRuntimeRestart = Effect.gen(function* () {
  const lifecycleEvents = yield* ServerLifecycleEvents;
  const httpClient = yield* HttpClient.HttpClient;
  const controlConfig = resolveControlConfig();
  const capability = capabilityForControlConfig(controlConfig);
  const restarting = yield* Ref.make(false);

  const publishRequired = (input?: { readonly reason?: string }) =>
    Effect.gen(function* () {
      const detectedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
      return yield* lifecycleEvents.publish({
        version: 1,
        type: "runtimeRestartRequired",
        payload: {
          detectedAt,
          reason: normalizeReason(input?.reason, "Running code changed."),
          capability,
        },
      });
    });

  return ServerRuntimeRestart.of({
    capability: Effect.succeed(capability),
    notifyRequired: publishRequired,
    notifyRequiredFromSupervisor: (input) =>
      Effect.gen(function* () {
        if (!controlConfig) {
          return yield* new ServerRuntimeRestartError({
            reason: "Restart supervisor notifications are not available for this server.",
          });
        }

        const presentedToken = bearerTokenFromAuthorization(input.authorization);
        if (!presentedToken || !secureTokenEquals(presentedToken, controlConfig.token)) {
          return yield* new ServerRuntimeRestartError({
            reason: "Unauthorized restart supervisor notification.",
          });
        }

        return yield* publishRequired(
          input.reason === undefined ? undefined : { reason: input.reason },
        );
      }),
    restart: (input) =>
      Effect.gen(function* () {
        if (!controlConfig || !capability.available) {
          return yield* new ServerRuntimeRestartError({
            reason: "Runtime restart is not available for this server.",
          });
        }

        const acquired = yield* Ref.modify(restarting, (current) =>
          current ? [false, current] : [true, true],
        );
        if (!acquired) {
          return yield* new ServerRuntimeRestartError({
            reason: "Runtime restart is already in progress.",
          });
        }

        const requestedAt = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
        yield* Effect.logInfo("Runtime restart requested", {
          mode: input.mode,
          reason: input.reason ?? "user-requested",
          requestedAt,
          supervisorKind: capability.kind,
        });

        yield* httpClient
          .post(new URL("restart", controlConfig.url), {
            body: HttpBody.jsonUnsafe({
              mode: input.mode,
              reason: normalizeReason(input.reason, "user-requested"),
            }),
            headers: {
              Authorization: `Bearer ${controlConfig.token}`,
            },
          })
          .pipe(
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.timeout(`${RESTART_REQUEST_TIMEOUT_MS} millis`),
            Effect.mapError(
              (cause) =>
                new ServerRuntimeRestartError({
                  reason:
                    cause instanceof Error
                      ? cause.message
                      : "Failed to request runtime restart from supervisor.",
                  cause,
                }),
            ),
            Effect.ensuring(Ref.set(restarting, false)),
          );

        return {
          accepted: true,
          message: "Runtime restart accepted.",
        };
      }),
  });
});

export const ServerRuntimeRestartLive = Layer.effect(
  ServerRuntimeRestart,
  makeServerRuntimeRestart,
);

function normalizeHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function parseRestartRequiredReason(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  const reason = (body as { readonly reason?: unknown }).reason;
  return typeof reason === "string" ? reason : undefined;
}

export const runtimeRestartNotificationRouteLayer = HttpRouter.add(
  "POST",
  RUNTIME_RESTART_REQUIRED_PATH,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const runtimeRestart = yield* ServerRuntimeRestart;
    const body = yield* request.json.pipe(Effect.orElseSucceed(() => ({})));
    const authorization = normalizeHeaderValue(request.headers.authorization);
    const reason = parseRestartRequiredReason(body);

    yield* runtimeRestart.notifyRequiredFromSupervisor({
      authorization,
      ...(reason === undefined ? {} : { reason }),
    });

    return HttpServerResponse.empty({ status: 204 });
  }).pipe(
    Effect.catch((error: ServerRuntimeRestartError) => {
      const status = error.reason === "Unauthorized restart supervisor notification." ? 401 : 404;
      return Effect.succeed(HttpServerResponse.text(error.message, { status }));
    }),
  ),
);
