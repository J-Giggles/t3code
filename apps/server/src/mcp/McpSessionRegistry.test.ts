import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpServer } from "effect/unstable/http";

import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/Services/ServerEnvironment.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-1");
const makeFakeHttpServer = (hostname: string, port = 43123) =>
  HttpServer.HttpServer.of({
    address: { _tag: "TcpAddress", hostname, port },
    serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
  });
const fakeHttpServer = makeFakeHttpServer("127.0.0.1");
const fakeEnvironment = ServerEnvironment.ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});

const makeServerConfig = (overrides: Partial<ServerConfig.ServerConfigShape> = {}) =>
  ServerConfig.ServerConfig.of({
    logLevel: "Error",
    traceMinLevel: "Info",
    traceTimingEnabled: true,
    traceBatchWindowMs: 200,
    traceMaxBytes: 10 * 1024 * 1024,
    traceMaxFiles: 10,
    otlpTracesUrl: undefined,
    otlpMetricsUrl: undefined,
    otlpLogsUrl: undefined,
    observabilityGrafanaUrl: undefined,
    otlpExportIntervalMs: 10_000,
    otlpServiceName: "t3-server-test",
    mode: "web",
    port: 43123,
    host: "127.0.0.1",
    cwd: "/tmp/t3",
    baseDir: "/tmp/t3",
    stateDir: "/tmp/t3/userdata",
    dbPath: "/tmp/t3/userdata/state.sqlite",
    keybindingsConfigPath: "/tmp/t3/userdata/keybindings.json",
    settingsPath: "/tmp/t3/userdata/settings.json",
    providerStatusCacheDir: "/tmp/t3/caches",
    worktreesDir: "/tmp/t3/worktrees",
    attachmentsDir: "/tmp/t3/userdata/attachments",
    logsDir: "/tmp/t3/userdata/logs",
    serverLogPath: "/tmp/t3/userdata/logs/server.log",
    serverTracePath: "/tmp/t3/userdata/logs/server.trace.ndjson",
    providerLogsDir: "/tmp/t3/userdata/logs/provider",
    providerEventLogPath: "/tmp/t3/userdata/logs/provider/events.log",
    terminalLogsDir: "/tmp/t3/userdata/logs/terminals",
    anonymousIdPath: "/tmp/t3/userdata/anonymous-id",
    environmentIdPath: "/tmp/t3/userdata/environment-id",
    serverRuntimeStatePath: "/tmp/t3/userdata/server-runtime.json",
    secretsDir: "/tmp/t3/userdata/secrets",
    staticDir: undefined,
    devUrl: undefined,
    noBrowser: true,
    startupPresentation: "headless",
    desktopBootstrapToken: undefined,
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
    tailscaleServePath: undefined,
    ...overrides,
  });

const makeRegistry = (
  now: () => number,
  config: ServerConfig.ServerConfigShape = makeServerConfig(),
) =>
  McpSessionRegistry.__testing
    .make({
      now,
      idleTimeoutMs: 100,
      maximumLifetimeMs: 1_000,
    })
    .pipe(
      Effect.provideService(HttpServer.HttpServer, fakeHttpServer),
      Effect.provideService(ServerEnvironment.ServerEnvironment, fakeEnvironment),
      Effect.provideService(ServerConfig.ServerConfig, config),
      Effect.provide(NodeServices.layer),
    );

it.effect("stores only a token hash, resolves the bearer token, and revokes by thread", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-1");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    expect(issued.config.endpoint).toBe("http://127.0.0.1:43123/mcp");
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    expect(token.length).toBeGreaterThan(20);

    const resolved = yield* registry.resolve(token);
    expect(resolved?.threadId).toBe(threadId);
    expect(resolved?.capabilities.has("preview")).toBe(true);
    expect(resolved?.capabilities.has("desktop-shell")).toBe(false);

    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(token)).toBeUndefined();

    timestamp += 2_000;
  }),
);

it.effect("issues desktop-shell only for the embedded desktop backend", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const desktopRegistry = yield* makeRegistry(
      () => timestamp,
      makeServerConfig({ mode: "desktop", desktopBootstrapToken: "desktop-token" }),
    );
    const desktopCredential = yield* desktopRegistry.issue({
      threadId: ThreadId.make("thread-desktop"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const desktopToken = desktopCredential.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const desktopScope = yield* desktopRegistry.resolve(desktopToken);
    expect(desktopScope?.capabilities.has("preview")).toBe(true);
    expect(desktopScope?.capabilities.has("desktop-shell")).toBe(true);

    timestamp += 1;
    const desktopWithoutTokenRegistry = yield* makeRegistry(
      () => timestamp,
      makeServerConfig({ mode: "desktop", desktopBootstrapToken: undefined }),
    );
    const desktopWithoutTokenCredential = yield* desktopWithoutTokenRegistry.issue({
      threadId: ThreadId.make("thread-desktop-no-token"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const desktopWithoutToken = desktopWithoutTokenCredential.config.authorizationHeader.replace(
      /^Bearer\s+/,
      "",
    );
    const desktopWithoutTokenScope =
      yield* desktopWithoutTokenRegistry.resolve(desktopWithoutToken);
    expect(desktopWithoutTokenScope?.capabilities.has("preview")).toBe(true);
    expect(desktopWithoutTokenScope?.capabilities.has("desktop-shell")).toBe(false);

    timestamp += 1;
    const webRegistry = yield* makeRegistry(
      () => timestamp,
      makeServerConfig({ mode: "web", desktopBootstrapToken: "desktop-token" }),
    );
    const webCredential = yield* webRegistry.issue({
      threadId: ThreadId.make("thread-web"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const webToken = webCredential.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const webScope = yield* webRegistry.resolve(webToken);
    expect(webScope?.capabilities.has("preview")).toBe(true);
    expect(webScope?.capabilities.has("desktop-shell")).toBe(false);
  }),
);

it.effect("expires credentials after inactivity", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-2"),
      providerInstanceId: ProviderInstanceId.make("claude"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    timestamp += 101;
    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);
