// @effect-diagnostics nodeBuiltinImport:off - Test setup needs temporary repo env files.
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NetService from "@t3tools/shared/Net";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  checkPortAvailabilityOnHosts,
  createDevRunnerEnv,
  findFirstAvailableOffset,
  createWorktreeIdentityEnvPatch,
  getDevRunnerModeArgs,
  inferT3WorktreeRole,
  loadDevRunnerBootstrapEnv,
  resolveModePortOffsets,
  resolveOffset,
  runDevRunnerWithInput,
} from "./dev-runner.ts";
import { LOCAL_OBSERVABILITY_URLS } from "./local-observability.ts";
import {
  DEV_CHANGE_POLICY_ENV,
  DESKTOP_DISABLE_RESTART_ON_CHANGE_ENV,
  RESTART_CONTROL_TOKEN_ENV,
} from "./lib/dev-change-policy.ts";

const emptyConfigLayer = ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }));
const DesktopSettingsJson = Schema.fromJsonString(
  Schema.Struct({
    tailscaleServePath: Schema.String,
  }),
);
const encodeDesktopSettingsJson = Schema.encodeSync(DesktopSettingsJson);
const netServiceLayer = Layer.succeed(NetService.NetService, {
  canListenOnHost: () => Effect.succeed(true),
  isPortAvailableOnLoopback: () => Effect.succeed(true),
  reserveLoopbackPort: () => Effect.succeed(49_152),
  findAvailablePort: (port) => Effect.succeed(port),
});

function createGitCheckout(input: { readonly appRoot: string; readonly branch: string }) {
  NodeFS.mkdirSync(input.appRoot, { recursive: true });
  NodeChildProcess.execFileSync("git", ["init", "-b", input.branch], {
    cwd: input.appRoot,
    stdio: "ignore",
  });
  NodeFS.writeFileSync(NodePath.join(input.appRoot, "README.md"), "test\n");
  NodeChildProcess.execFileSync("git", ["add", "README.md"], {
    cwd: input.appRoot,
    stdio: "ignore",
  });
  NodeChildProcess.execFileSync(
    "git",
    ["-c", "user.name=T3 Test", "-c", "user.email=t3@example.test", "commit", "-m", "init"],
    {
      cwd: input.appRoot,
      stdio: "ignore",
    },
  );
}

function mockProcess(exit: number | PlatformError.PlatformError) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode:
      typeof exit === "number"
        ? Effect.succeed(ChildProcessSpawner.ExitCode(exit))
        : Effect.fail(exit),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const devServerInput = {
  mode: "dev:server",
  t3Home: "/tmp/t3code-dev-runner",
  noBrowser: undefined,
  autoBootstrapProjectFromCwd: undefined,
  logWebSocketEvents: undefined,
  host: undefined,
  port: 13_773,
  devUrl: undefined,
  dryRun: false,
  runArgs: ["--inspect", "secret-token-value"],
  startLocalObservability: () => ({
    ok: true,
    disabled: false,
    dockerAvailable: false,
    warnings: [],
    urls: LOCAL_OBSERVABILITY_URLS,
  }),
} as const;

it.layer(NodeServices.layer)("dev-runner", (it) => {
  describe("getDevRunnerModeArgs", () => {
    it.effect("lets Vite+ honor the desktop dev task graph", () =>
      Effect.sync(() => {
        assert.deepStrictEqual(getDevRunnerModeArgs("dev:desktop"), [
          "run",
          "--filter=@t3tools/desktop",
          "--filter=@t3tools/web",
          "dev",
        ]);
      }),
    );

    it.effect("places Vite+ run flags before the task name", () =>
      Effect.sync(() => {
        assert.deepStrictEqual(getDevRunnerModeArgs("dev"), [
          "run",
          "--filter=@t3tools/contracts",
          "--filter=@t3tools/web",
          "--filter=t3",
          "--parallel",
          "dev",
        ]);
      }),
    );
  });

  describe("resolveOffset", () => {
    it.effect("uses explicit T3CODE_PORT_OFFSET when provided", () =>
      Effect.gen(function* () {
        const result = yield* resolveOffset({ portOffset: 12, devInstance: undefined });
        assert.deepStrictEqual(result, {
          offset: 12,
          source: "T3CODE_PORT_OFFSET=12",
        });
      }),
    );

    it.effect("hashes non-numeric instance values", () =>
      Effect.gen(function* () {
        const result = yield* resolveOffset({
          portOffset: undefined,
          devInstance: "feature-branch",
        });
        assert.ok(result.offset >= 1);
        assert.ok(result.offset <= 3000);
      }),
    );

    it.effect("returns structured context for a negative port offset", () =>
      Effect.gen(function* () {
        const error = yield* resolveOffset({ portOffset: -1, devInstance: undefined }).pipe(
          Effect.flip,
        );

        assert.equal(error._tag, "DevRunnerInvalidPortOffsetError");
        assert.equal(error.configKey, "T3CODE_PORT_OFFSET");
        assert.equal(error.portOffset, -1);
        assert.equal(error.minimum, 0);
        assert.ok(!("cause" in error));
      }),
    );
  });

  describe("loadDevRunnerBootstrapEnv", () => {
    it.effect("lets the worktree env identity override inherited app launch env", () =>
      Effect.sync(() => {
        const repoRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-dev-runner-"));
        NodeFS.writeFileSync(
          NodePath.join(repoRoot, ".env.local"),
          [
            "T3CODE_HOME=/tmp/t3-main",
            "T3CODE_DEV_INSTANCE=t3code-local-main",
            "T3CODE_REMOTE_DEBUGGING_PORT=9224",
          ].join("\n"),
        );

        try {
          const env = loadDevRunnerBootstrapEnv({
            repoRoot,
            baseEnv: {
              T3CODE_HOME: "/tmp/t3-staging",
              T3CODE_PORT_OFFSET: "60",
              PORT: "5793",
              HOST: "127.0.0.1",
            },
          });

          assert.equal(env.T3CODE_HOME, "/tmp/t3-main");
          assert.equal(env.T3CODE_DEV_INSTANCE, "t3code-local-main");
          assert.equal(env.T3CODE_PORT_OFFSET, undefined);
          assert.equal(env.PORT, "5793");
          assert.equal(env.HOST, "127.0.0.1");
        } finally {
          NodeFS.rmSync(repoRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("clears inherited web launch ports when a port offset owns selection", () =>
      Effect.sync(() => {
        const env = loadDevRunnerBootstrapEnv({
          baseEnv: {
            T3CODE_PORT_OFFSET: "3000",
            PORT: "5753",
            VITE_DEV_SERVER_URL: "http://127.0.0.1:5753/main/",
          },
        });

        assert.equal(env.T3CODE_PORT_OFFSET, "3000");
        assert.equal(env.PORT, undefined);
        assert.equal(env.VITE_DEV_SERVER_URL, undefined);
      }),
    );
  });

  describe("createDevRunnerEnv", () => {
    it.effect("injects local observability endpoints and worktree identity", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {
            T3CODE_DEV_INSTANCE: "local-observability-test",
            T3CODE_WORKTREE_ROLE: "dev",
            T3CODE_WORKTREE_PATH: "/repo/t3code/.worktrees/dev-local-observability",
          },
          cwd: "/repo/t3code/.worktrees/dev-local-observability",
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.T3CODE_OTLP_TRACES_URL, LOCAL_OBSERVABILITY_URLS.tracesUrl);
        assert.equal(env.T3CODE_OTLP_METRICS_URL, LOCAL_OBSERVABILITY_URLS.metricsUrl);
        assert.equal(env.T3CODE_OTLP_LOGS_URL, LOCAL_OBSERVABILITY_URLS.logsUrl);
        assert.equal(env.T3CODE_OBSERVABILITY_GRAFANA_URL, LOCAL_OBSERVABILITY_URLS.grafanaUrl);
        assert.equal(env.T3CODE_DEV_INSTANCE, "local-observability-test");
        assert.equal(env.T3CODE_WORKTREE_ROLE, "dev");
        assert.equal(env.T3CODE_WORKTREE_PATH, "/repo/t3code/.worktrees/dev-local-observability");
      }),
    );

    it.effect("does not inject local observability endpoints when opted out", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {
            T3CODE_LOCAL_OBSERVABILITY: "0",
          },
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.T3CODE_OTLP_LOGS_URL, undefined);
      }),
    );

    it("infers stable worktree roles from path before inherited env", () => {
      assert.equal(
        inferT3WorktreeRole({
          cwd: "/repo/t3code/.worktrees/staging",
          branch: "feature",
          envRole: undefined,
        }),
        "staging",
      );
      assert.equal(
        inferT3WorktreeRole({
          cwd: "/repo/t3code/.worktrees/dev-observability",
          branch: "feature",
          envRole: undefined,
        }),
        "dev",
      );
      assert.equal(
        inferT3WorktreeRole({
          cwd: "/repo/t3code/.worktrees/staging",
          branch: "staging",
          envRole: "main",
        }),
        "staging",
      );
      assert.equal(
        inferT3WorktreeRole({
          cwd: "/repo/custom",
          branch: "main",
          envRole: " original ",
        }),
        "original",
      );
    });

    it("preserves explicit worktree identity env", () => {
      assert.deepStrictEqual(
        createWorktreeIdentityEnvPatch({
          cwd: "/repo/custom",
          baseEnv: {
            T3CODE_WORKTREE_ROLE: "staging",
            T3CODE_WORKTREE_PATH: "/repo/custom",
            T3CODE_GIT_BRANCH: "branch-a",
            T3CODE_GIT_COMMIT: "abc123",
          },
        }),
        {
          T3CODE_WORKTREE_ROLE: "staging",
          T3CODE_WORKTREE_PATH: "/repo/custom",
          T3CODE_GIT_BRANCH: "branch-a",
          T3CODE_GIT_COMMIT: "abc123",
        },
      );
    });

    it.effect("defaults T3CODE_HOME to ~/.t3 when not provided", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {},
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.T3CODE_HOME, path.resolve(NodeOS.homedir(), ".t3"));
      }),
    );

    it.effect("supports explicit typed overrides", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const env = yield* createDevRunnerEnv({
          mode: "dev:server",
          baseEnv: {},
          serverOffset: 0,
          webOffset: 0,
          t3Home: "/tmp/custom-t3",
          noBrowser: true,
          autoBootstrapProjectFromCwd: false,
          logWebSocketEvents: true,
          host: "0.0.0.0",
          port: 4222,
          devUrl: new URL("http://localhost:7331"),
        });

        assert.equal(env.T3CODE_HOME, path.resolve("/tmp/custom-t3"));
        assert.equal(env.T3CODE_PORT, "4222");
        assert.equal(env.VITE_HTTP_URL, "http://localhost:4222");
        assert.equal(env.VITE_WS_URL, "ws://localhost:4222");
        assert.equal(env.T3CODE_NO_BROWSER, "1");
        assert.equal(env.T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD, "0");
        assert.equal(env.T3CODE_LOG_WS_EVENTS, "1");
        assert.equal(env.T3CODE_HOST, "0.0.0.0");
        assert.equal(env.VITE_DEV_SERVER_URL, "http://localhost:7331/");
      }),
    );

    it.effect("does not force websocket logging on in dev mode when unset", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {
            T3CODE_LOG_WS_EVENTS: "keep-me-out",
          },
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.T3CODE_MODE, "web");
        assert.equal(env.T3CODE_LOG_WS_EVENTS, undefined);
      }),
    );

    it.effect("forwards explicit websocket logging false without coercing it away", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {
            T3CODE_LOG_WS_EVENTS: "1",
          },
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: false,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.T3CODE_LOG_WS_EVENTS, "0");
      }),
    );

    it.effect("uses custom t3Home when provided", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {},
          serverOffset: 0,
          webOffset: 0,
          t3Home: "/tmp/my-t3",
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.T3CODE_HOME, path.resolve("/tmp/my-t3"));
      }),
    );

    it.effect("pins desktop dev to a stable backend port and websocket url", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const env = yield* createDevRunnerEnv({
          mode: "dev:desktop",
          baseEnv: {
            T3CODE_PORT: "13773",
            T3CODE_MODE: "web",
            T3CODE_NO_BROWSER: "0",
            T3CODE_HOST: "0.0.0.0",
            VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
            VITE_WS_URL: "ws://localhost:13773",
          },
          serverOffset: 0,
          webOffset: 0,
          t3Home: "/tmp/my-t3",
          noBrowser: true,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: "127.0.0.1",
          port: 4222,
          devUrl: undefined,
        });

        assert.equal(env.T3CODE_HOME, path.resolve("/tmp/my-t3"));
        assert.equal(env.PORT, "5733");
        assert.equal(env.VITE_DEV_SERVER_URL, "http://127.0.0.1:5733/t3code/");
        assert.equal(env.VITE_T3CODE_PUBLIC_BASE_PATH, "/t3code");
        assert.equal(env.HOST, "127.0.0.1");
        assert.equal(env.T3CODE_PORT, "4222");
        assert.equal(env.VITE_HTTP_URL, "http://127.0.0.1:4222");
        assert.equal(env.T3CODE_MODE, undefined);
        assert.equal(env.T3CODE_NO_BROWSER, undefined);
        assert.equal(env.T3CODE_HOST, undefined);
        assert.equal(env.VITE_WS_URL, "ws://127.0.0.1:4222");
      }),
    );

    it.effect("uses an explicit dev-url port as the Vite web port", () =>
      Effect.gen(function* () {
        const repoParent = NodeFS.mkdtempSync(
          NodePath.join(NodeOS.tmpdir(), "t3-dev-runner-repo-"),
        );
        const appRoot = NodePath.join(repoParent, "t3code");
        createGitCheckout({ appRoot, branch: "main" });

        try {
          const env = yield* createDevRunnerEnv({
            mode: "dev:desktop",
            cwd: appRoot,
            baseEnv: {
              T3CODE_WORKSPACE_SLUG: "main",
            },
            serverOffset: 20,
            webOffset: 2474,
            t3Home: "/tmp/my-t3",
            noBrowser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: 13793,
            devUrl: new URL("http://127.0.0.1:5753"),
          });

          assert.equal(env.PORT, "5753");
          assert.equal(env.VITE_DEV_SERVER_URL, "http://127.0.0.1:5753/main/");
          assert.equal(env.VITE_T3CODE_PUBLIC_BASE_PATH, "/main");
          assert.equal(env.T3CODE_PORT, "13793");
          assert.equal(env.VITE_HTTP_URL, "http://127.0.0.1:13793");
        } finally {
          NodeFS.rmSync(repoParent, { recursive: true, force: true });
        }
      }),
    );

    it.effect("prefers the persisted desktop Tailscale path for Vite base routing", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-dev-runner-home-"));
        try {
          NodeFS.mkdirSync(path.join(baseDir, "dev"), { recursive: true });
          NodeFS.writeFileSync(
            path.join(baseDir, "dev", "desktop-settings.json"),
            encodeDesktopSettingsJson({ tailscaleServePath: "/custom-dev/" }),
          );

          const env = yield* createDevRunnerEnv({
            mode: "dev:desktop",
            baseEnv: {
              T3CODE_WORKSPACE_SLUG: "staging",
            },
            serverOffset: 80,
            webOffset: 80,
            t3Home: baseDir,
            noBrowser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: 13853,
            devUrl: undefined,
          });

          assert.equal(env.VITE_DEV_SERVER_URL, "http://127.0.0.1:5813/custom-dev/");
          assert.equal(env.VITE_T3CODE_PUBLIC_BASE_PATH, "/custom-dev");
        } finally {
          NodeFS.rmSync(baseDir, { recursive: true, force: true });
        }
      }),
    );

    it.effect("prefers the launcher Tailscale path over stale persisted desktop settings", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-dev-runner-home-"));
        const repoRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-dev-runner-repo-"));
        const appRoot = NodePath.join(repoRoot, ".worktrees", "staging");
        createGitCheckout({ appRoot, branch: "staging" });
        try {
          NodeFS.mkdirSync(path.join(baseDir, "dev"), { recursive: true });
          NodeFS.writeFileSync(
            path.join(baseDir, "dev", "desktop-settings.json"),
            encodeDesktopSettingsJson({ tailscaleServePath: "/t3code-staging/" }),
          );

          const env = yield* createDevRunnerEnv({
            mode: "dev:desktop",
            cwd: appRoot,
            baseEnv: {
              T3CODE_TAILSCALE_SERVE_PATH: "/staging",
              T3CODE_WORKSPACE_SLUG: "staging",
            },
            serverOffset: 60,
            webOffset: 60,
            t3Home: baseDir,
            noBrowser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: 13833,
            devUrl: undefined,
          });

          assert.equal(env.VITE_DEV_SERVER_URL, "http://127.0.0.1:5793/staging/");
          assert.equal(env.VITE_T3CODE_PUBLIC_BASE_PATH, "/staging");
          assert.equal(env.VITE_T3CODE_PUBLIC_BASE_URL, "http://127.0.0.1:5793/staging/");
        } finally {
          NodeFS.rmSync(baseDir, { recursive: true, force: true });
          NodeFS.rmSync(repoRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("rejects /staging for a non-staging worktree", () =>
      Effect.gen(function* () {
        const repoRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-dev-runner-repo-"));
        const appRoot = NodePath.join(repoRoot, ".worktrees", "nightly-local");
        createGitCheckout({
          appRoot,
          branch: "dev/nightly-topic-stack-20260626",
        });

        try {
          const error = yield* createDevRunnerEnv({
            mode: "dev:desktop",
            cwd: appRoot,
            baseEnv: {
              T3CODE_TAILSCALE_SERVE_PATH: "/staging",
              T3CODE_WORKTREE_ROLE: "staging",
            },
            serverOffset: 60,
            webOffset: 60,
            t3Home: "/tmp/t3-dev-runner",
            noBrowser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: 13833,
            devUrl: undefined,
          }).pipe(Effect.flip);

          assert.equal(error._tag, "DevRunnerReservedServeRouteError");
          assert.equal(error.servePath, "/staging");
          assert.include(error.message, ".worktrees/nightly-local");
          assert.include(error.message, "dev/nightly-topic-stack-20260626");
          assert.equal(error.suggestedServePath, "/nightly-local");
        } finally {
          NodeFS.rmSync(repoRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("allows /staging for the staging branch/worktree", () =>
      Effect.gen(function* () {
        const repoRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-dev-runner-repo-"));
        const appRoot = NodePath.join(repoRoot, ".worktrees", "staging");
        createGitCheckout({
          appRoot,
          branch: "staging",
        });

        try {
          const env = yield* createDevRunnerEnv({
            mode: "dev:desktop",
            cwd: appRoot,
            baseEnv: {
              T3CODE_TAILSCALE_SERVE_PATH: "/staging",
              T3CODE_WORKTREE_ROLE: "nightly",
            },
            serverOffset: 60,
            webOffset: 60,
            t3Home: "/tmp/t3-dev-runner",
            noBrowser: undefined,
            autoBootstrapProjectFromCwd: undefined,
            logWebSocketEvents: undefined,
            host: undefined,
            port: 13833,
            devUrl: undefined,
          });

          assert.equal(env.VITE_T3CODE_PUBLIC_BASE_PATH, "/staging");
          assert.equal(env.VITE_DEV_SERVER_URL, "http://127.0.0.1:5793/staging/");
        } finally {
          NodeFS.rmSync(repoRoot, { recursive: true, force: true });
        }
      }),
    );

    it.effect("defaults dev server mode to the higher backend port range", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {},
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env.T3CODE_PORT, "13773");
        assert.equal(env.VITE_HTTP_URL, "http://localhost:13773");
        assert.equal(env.VITE_WS_URL, "ws://localhost:13773");
      }),
    );

    it.effect("defaults dev-runner environments to manual restart policy", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {},
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env[DEV_CHANGE_POLICY_ENV], "manual");
        assert.match(env[RESTART_CONTROL_TOKEN_ENV] ?? "", /^[a-f0-9]{64}$/);
      }),
    );

    it.effect("preserves explicit auto restart policy opt-outs", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {
            [DEV_CHANGE_POLICY_ENV]: "auto",
            [DESKTOP_DISABLE_RESTART_ON_CHANGE_ENV]: "1",
          },
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env[DEV_CHANGE_POLICY_ENV], "auto");
      }),
    );

    it.effect("keeps the legacy desktop no-restart flag as a manual policy alias", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev:desktop",
          baseEnv: {
            [DESKTOP_DISABLE_RESTART_ON_CHANGE_ENV]: "1",
          },
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env[DEV_CHANGE_POLICY_ENV], "manual");
      }),
    );

    it.effect("preserves an existing restart control token", () =>
      Effect.gen(function* () {
        const env = yield* createDevRunnerEnv({
          mode: "dev",
          baseEnv: {
            [RESTART_CONTROL_TOKEN_ENV]: "existing-token",
          },
          serverOffset: 0,
          webOffset: 0,
          t3Home: undefined,
          noBrowser: undefined,
          autoBootstrapProjectFromCwd: undefined,
          logWebSocketEvents: undefined,
          host: undefined,
          port: undefined,
          devUrl: undefined,
        });

        assert.equal(env[RESTART_CONTROL_TOKEN_ENV], "existing-token");
      }),
    );
  });

  describe("findFirstAvailableOffset", () => {
    it.effect("returns the starting offset when required ports are available", () =>
      Effect.gen(function* () {
        const offset = yield* findFirstAvailableOffset({
          startOffset: 0,
          requireServerPort: true,
          requireWebPort: true,
          checkPortAvailability: () => Effect.succeed(true),
        });

        assert.equal(offset, 0);
      }),
    );

    it.effect("advances until all required ports are available", () =>
      Effect.gen(function* () {
        const taken = new Set([13773, 5733, 13774, 5734]);
        const offset = yield* findFirstAvailableOffset({
          startOffset: 0,
          requireServerPort: true,
          requireWebPort: true,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.equal(offset, 2);
      }),
    );

    it.effect("allows offsets where the non-required server port exceeds max", () =>
      Effect.gen(function* () {
        const offset = yield* findFirstAvailableOffset({
          startOffset: 59_802,
          requireServerPort: false,
          requireWebPort: true,
          checkPortAvailability: () => Effect.succeed(true),
        });

        assert.equal(offset, 59_802);
      }),
    );

    it.effect("reports the exhausted range and required port set", () =>
      Effect.gen(function* () {
        const error = yield* findFirstAvailableOffset({
          startOffset: 51_763,
          requireServerPort: true,
          requireWebPort: false,
          checkPortAvailability: () => Effect.succeed(true),
        }).pipe(Effect.flip);

        if (error._tag !== "DevRunnerPortExhaustedError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.startOffset, 51_763);
        assert.equal(error.requireServerPort, true);
        assert.equal(error.requireWebPort, false);
        assert.equal(error.baseServerPort, 13_773);
        assert.equal(error.baseWebPort, 5_733);
        assert.equal(error.maximumPort, 65_535);
        assert.ok(!("cause" in error));
      }),
    );
  });

  describe("checkPortAvailabilityOnHosts", () => {
    it.effect("checks overlapping hosts sequentially to avoid self-interference", () =>
      Effect.gen(function* () {
        let inFlightCount = 0;
        const calls: Array<[number, string]> = [];

        const available = yield* checkPortAvailabilityOnHosts(
          13_773,
          ["127.0.0.1", "0.0.0.0", "::"],
          (port, host) =>
            Effect.promise(async () => {
              calls.push([port, host]);
              inFlightCount += 1;
              const overlapped = inFlightCount > 1;
              await Promise.resolve();
              inFlightCount -= 1;
              return !overlapped;
            }),
        );

        assert.equal(available, true);
        assert.deepStrictEqual(calls, [
          [13_773, "127.0.0.1"],
          [13_773, "0.0.0.0"],
          [13_773, "::"],
        ]);
      }),
    );
  });

  describe("resolveModePortOffsets", () => {
    it.effect("uses a shared fallback offset for dev mode", () =>
      Effect.gen(function* () {
        const taken = new Set([13773, 5733]);
        const offsets = yield* resolveModePortOffsets({
          mode: "dev",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 1, webOffset: 1 });
      }),
    );

    it.effect("keeps server offset stable for dev:web and only shifts web offset", () =>
      Effect.gen(function* () {
        const taken = new Set([5733]);
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:web",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 0, webOffset: 1 });
      }),
    );

    it.effect("shifts only server offset for dev:server", () =>
      Effect.gen(function* () {
        const taken = new Set([13773]);
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:server",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: false,
          checkPortAvailability: (port) => Effect.succeed(!taken.has(port)),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 1, webOffset: 1 });
      }),
    );

    it.effect("respects explicit dev-url override for dev:web", () =>
      Effect.gen(function* () {
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:web",
          startOffset: 0,
          hasExplicitServerPort: false,
          hasExplicitDevUrl: true,
          checkPortAvailability: () => Effect.succeed(false),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 0, webOffset: 0 });
      }),
    );

    it.effect("respects explicit server port override for dev:server", () =>
      Effect.gen(function* () {
        const offsets = yield* resolveModePortOffsets({
          mode: "dev:server",
          startOffset: 0,
          hasExplicitServerPort: true,
          hasExplicitDevUrl: false,
          checkPortAvailability: () => Effect.succeed(false),
        });

        assert.deepStrictEqual(offsets, { serverOffset: 0, webOffset: 0 });
      }),
    );
  });

  describe("runDevRunnerWithInput", () => {
    it.effect("preserves invalid configuration as the exact cause", () =>
      Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput({ ...devServerInput, dryRun: true }).pipe(
          Effect.provide(
            Layer.merge(
              netServiceLayer,
              ConfigProvider.layer(
                ConfigProvider.fromEnv({ env: { T3CODE_PORT_OFFSET: "not-an-integer" } }),
              ),
            ),
          ),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerConfigurationError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.deepStrictEqual(error.configKeys, ["T3CODE_PORT_OFFSET", "T3CODE_DEV_INSTANCE"]);
        assert.ok(error.cause !== undefined);
        assert.ok(!error.message.includes(String((error.cause as Error).message)));
      }),
    );

    it.effect("preserves process spawn context and the exact platform cause", () => {
      const cause = PlatformError.systemError({
        _tag: "NotFound",
        module: "ChildProcess",
        method: "spawn",
        description: "vp was not found",
      });
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.fail(cause)),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput(devServerInput).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.provideService(HostProcessEnvironment, {}),
          Effect.provideService(HostProcessPlatform, "linux"),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerProcessError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.operation, "spawn");
        assert.equal(error.mode, "dev:server");
        assert.equal(error.executable, "vp");
        assert.equal(error.argumentCount, 5);
        assert.equal(error.shell, false);
        assert.equal(error.cause, cause);
        assert.ok(!error.message.includes(cause.message));
        assert.notProperty(error, "args");
        assert.notInclude(error.message, "secret-token-value");
      });
    });

    it.effect("reports non-zero exits without manufacturing a cause", () => {
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.succeed(mockProcess(17))),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput(devServerInput).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.provideService(HostProcessEnvironment, {}),
          Effect.provideService(HostProcessPlatform, "linux"),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerProcessExitError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.mode, "dev:server");
        assert.equal(error.executable, "vp");
        assert.equal(error.argumentCount, 5);
        assert.equal(error.shell, false);
        assert.equal(error.exitCode, 17);
        assert.ok(!("cause" in error));
        assert.notProperty(error, "args");
        assert.notInclude(error.message, "secret-token-value");
      });
    });

    it.effect("preserves wait-for-exit failures as the exact cause", () => {
      const cause = PlatformError.systemError({
        _tag: "Unknown",
        module: "ChildProcess",
        method: "exitCode",
        description: "process status became unavailable",
      });
      const spawnerLayer = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make(() => Effect.succeed(mockProcess(cause))),
      );

      return Effect.gen(function* () {
        const error = yield* runDevRunnerWithInput(devServerInput).pipe(
          Effect.provide(Layer.mergeAll(emptyConfigLayer, netServiceLayer, spawnerLayer)),
          Effect.provideService(HostProcessEnvironment, {}),
          Effect.provideService(HostProcessPlatform, "linux"),
          Effect.flip,
        );

        if (error._tag !== "DevRunnerProcessError") {
          assert.fail(`Unexpected error: ${error._tag}`);
        }
        assert.equal(error.operation, "wait-for-exit");
        assert.equal(error.mode, "dev:server");
        assert.equal(error.executable, "vp");
        assert.equal(error.argumentCount, 5);
        assert.equal(error.shell, false);
        assert.equal(error.cause, cause);
        assert.ok(!error.message.includes(cause.message));
        assert.notProperty(error, "args");
        assert.notInclude(error.message, "secret-token-value");
      });
    });
  });
});
