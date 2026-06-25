import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { ServerLifecycleEvents, ServerLifecycleEventsLive } from "./serverLifecycleEvents.ts";
import { makeServerRuntimeRestart } from "./serverRuntimeRestart.ts";

const restartEnvNames = [
  "T3CODE_RESTART_CONTROL_URL",
  "T3CODE_RESTART_CONTROL_TOKEN",
  "T3CODE_RESTART_CONTROL_KIND",
] as const;

function withRestartEnv<A, E, R>(
  env: Partial<Record<(typeof restartEnvNames)[number], string>>,
  effect: Effect.Effect<A, E, R>,
) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = Object.fromEntries(
        restartEnvNames.map((name) => [name, process.env[name]]),
      ) as Record<(typeof restartEnvNames)[number], string | undefined>;
      for (const name of restartEnvNames) {
        const value = env[name];
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      return previous;
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        for (const name of restartEnvNames) {
          const value = previous[name];
          if (value === undefined) {
            delete process.env[name];
          } else {
            process.env[name] = value;
          }
        }
      }),
  );
}

function jsonResponse(request: HttpClientRequest.HttpClientRequest, body: unknown, status = 200) {
  return HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function makeHttpClientLayer(
  handler: (
    request: HttpClientRequest.HttpClientRequest,
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, never>,
) {
  return Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => handler(request)),
  );
}

it.effect("publishes restart-required events from authorized supervisor notifications", () =>
  withRestartEnv(
    {
      T3CODE_RESTART_CONTROL_URL: "http://127.0.0.1:1",
      T3CODE_RESTART_CONTROL_TOKEN: "secret-token",
      T3CODE_RESTART_CONTROL_KIND: "desktop-dev-supervisor",
    },
    Effect.gen(function* () {
      const restart = yield* makeServerRuntimeRestart;
      const unauthorized = yield* Effect.flip(
        restart.notifyRequiredFromSupervisor({
          authorization: "Bearer wrong-token",
          reason: "Code changed.",
        }),
      );
      assert.equal(unauthorized.reason, "Unauthorized restart supervisor notification.");

      const event = yield* restart.notifyRequiredFromSupervisor({
        authorization: "Bearer secret-token",
        reason: "Code changed.",
      });
      assert.equal(event.type, "runtimeRestartRequired");
      if (event.type === "runtimeRestartRequired") {
        assert.equal(event.payload.reason, "Code changed.");
        assert.equal(event.payload.capability.available, true);
        assert.equal(event.payload.capability.kind, "desktop-dev-supervisor");
      }

      const lifecycleEvents = yield* ServerLifecycleEvents;
      const snapshot = yield* lifecycleEvents.snapshot;
      assert.deepEqual(
        snapshot.events.map((entry) => entry.type),
        ["runtimeRestartRequired"],
      );
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          ServerLifecycleEventsLive,
          makeHttpClientLayer((request) => Effect.succeed(jsonResponse(request, {}))),
        ),
      ),
    ),
  ),
);

it.effect("posts restart requests to the configured supervisor endpoint", () =>
  Effect.gen(function* () {
    const received: Array<{
      readonly url: string;
      readonly authorization: string | undefined;
      readonly contentType: string | undefined;
    }> = [];
    const httpClientLayer = makeHttpClientLayer((request) =>
      Effect.sync(() => {
        received.push({
          url: request.url,
          authorization: request.headers.authorization,
          contentType: request.headers["content-type"],
        });
        return jsonResponse(request, {}, 202);
      }),
    );
    yield* withRestartEnv(
      {
        T3CODE_RESTART_CONTROL_URL: "http://127.0.0.1:41777",
        T3CODE_RESTART_CONTROL_TOKEN: "secret-token",
        T3CODE_RESTART_CONTROL_KIND: "desktop-dev-supervisor",
      },
      Effect.gen(function* () {
        const restart = yield* makeServerRuntimeRestart;
        const result = yield* restart.restart({
          mode: "full-setup",
          reason: "user-requested",
        });
        assert.equal(result.accepted, true);
      }).pipe(Effect.provide(Layer.mergeAll(ServerLifecycleEventsLive, httpClientLayer))),
    );

    assert.deepEqual(received, [
      {
        url: "http://127.0.0.1:41777/restart",
        authorization: "Bearer secret-token",
        contentType: "application/json",
      },
    ]);
  }),
);

it.effect("reports and calls a standalone supervisor restart capability", () =>
  Effect.gen(function* () {
    const received: Array<{
      readonly url: string;
      readonly authorization: string | undefined;
    }> = [];
    const httpClientLayer = makeHttpClientLayer((request) =>
      Effect.sync(() => {
        received.push({
          url: request.url,
          authorization: request.headers.authorization,
        });
        return jsonResponse(request, {}, 202);
      }),
    );

    yield* withRestartEnv(
      {
        T3CODE_RESTART_CONTROL_URL: "http://127.0.0.1:42777",
        T3CODE_RESTART_CONTROL_TOKEN: "secret-token",
        T3CODE_RESTART_CONTROL_KIND: "standalone-supervisor",
      },
      Effect.gen(function* () {
        const restart = yield* makeServerRuntimeRestart;
        const capability = yield* restart.capability;
        assert.equal(capability.available, true);
        assert.equal(capability.kind, "standalone-supervisor");

        const result = yield* restart.restart({
          mode: "full-setup",
          reason: "user-requested",
        });
        assert.equal(result.accepted, true);
      }).pipe(Effect.provide(Layer.mergeAll(ServerLifecycleEventsLive, httpClientLayer))),
    );

    assert.deepEqual(received, [
      {
        url: "http://127.0.0.1:42777/restart",
        authorization: "Bearer secret-token",
      },
    ]);
  }),
);
