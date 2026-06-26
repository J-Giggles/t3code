// @effect-diagnostics nodeBuiltinImport:off - Vite config reads optional package-local env files before an Effect runtime exists.
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
import { defineProject, type TestProjectInlineConfiguration } from "vite-plus/test/config";
import "vite-plus/test/config";
import { defineConfig, type Plugin } from "vite-plus";
import { normalizePublicPathPrefix } from "@t3tools/shared/publicPath";
import pkg from "./package.json" with { type: "json" };

import {
  readNonEmptyEnvValue,
  RESTART_CONTROL_TOKEN_ENV,
  resolveDevChangePolicy,
} from "../../scripts/lib/dev-change-policy.ts";
import { loadRepoEnv } from "../../scripts/lib/public-config";
import {
  createDevSourceChangePayload,
  DEFAULT_DEV_SOURCE_CHANGE_REASON,
  DEV_SOURCE_CHANGED_EVENT,
  postRestartRequired,
  resolveRestartNotificationEndpoint,
  shouldNotifyForViteWatchEvent,
} from "./src/lib/devRestartNotification";
import { resolveDevProxyRoutes } from "./src/devProxyPaths";

const repoEnv = loadRepoEnv();
const webPackageRoot = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const webLocalEnv = readOptionalEnvFile(NodePath.join(webPackageRoot, ".env.local"));
const effectiveEnv = {
  ...repoEnv,
  ...webLocalEnv,
  ...process.env,
} satisfies Record<string, string | undefined>;
Object.assign(process.env, effectiveEnv);

const port = Number(effectiveEnv.PORT ?? 5733);
const host = effectiveEnv.HOST?.trim() || "localhost";
const configuredWsUrl = effectiveEnv.VITE_WS_URL?.trim();
const configuredHttpUrl = effectiveEnv.VITE_HTTP_URL?.trim();
const configuredRelayUrl = effectiveEnv.VITE_T3CODE_RELAY_URL?.trim() || "";
const configuredClerkPublishableKey = effectiveEnv.VITE_CLERK_PUBLISHABLE_KEY?.trim() || "";
const configuredClerkJwtTemplate = effectiveEnv.VITE_CLERK_JWT_TEMPLATE?.trim() || "";
const configuredRelayTracingUrl = effectiveEnv.VITE_RELAY_OTLP_TRACES_URL?.trim() || "";
const configuredRelayTracingDataset = effectiveEnv.VITE_RELAY_OTLP_TRACES_DATASET?.trim() || "";
const configuredRelayTracingToken = effectiveEnv.VITE_RELAY_OTLP_TRACES_TOKEN?.trim() || "";
const configuredHostedAppChannel = effectiveEnv.VITE_HOSTED_APP_CHANNEL?.trim() || "";
const configuredAppVersion = effectiveEnv.APP_VERSION?.trim() || pkg.version;
const configuredT3WorktreeRole = effectiveEnv.T3CODE_WORKTREE_ROLE?.trim() || "";
const configuredT3WorktreePath = effectiveEnv.T3CODE_WORKTREE_PATH?.trim() || "";
const configuredT3GitBranch = effectiveEnv.T3CODE_GIT_BRANCH?.trim() || "";
const configuredT3GitCommit = effectiveEnv.T3CODE_GIT_COMMIT?.trim() || "";
const configuredT3DevInstance = effectiveEnv.T3CODE_DEV_INSTANCE?.trim() || "";
const configuredT3Home = effectiveEnv.T3CODE_HOME?.trim() || "";
const configuredDevWorktreeName =
  effectiveEnv.VITE_DEV_WORKTREE_NAME?.trim() || resolveGitWorktreeName();
const configuredDevBranchName = effectiveEnv.VITE_DEV_BRANCH_NAME?.trim() || resolveGitBranchName();
const configuredPublicOrigin =
  effectiveEnv.VITE_T3CODE_PUBLIC_ORIGIN?.trim() || effectiveEnv.APP_ORIGIN?.trim() || "";
const configuredPublicBasePath = normalizePublicPathPrefix(
  effectiveEnv.VITE_T3CODE_PUBLIC_BASE_PATH ?? effectiveEnv.APP_BASE_PATH,
);
const configuredPublicBaseUrl =
  effectiveEnv.VITE_T3CODE_PUBLIC_BASE_URL?.trim() || effectiveEnv.APP_BASE_URL?.trim() || "";
const viteBase = configuredPublicBasePath ? `${configuredPublicBasePath}/` : "/";
const configuredHostedAppUrl = (() => {
  const explicitHostedAppUrl = effectiveEnv.VITE_HOSTED_APP_URL?.trim();
  if (explicitHostedAppUrl) {
    return explicitHostedAppUrl;
  }
  if (effectiveEnv.VERCEL_ENV === "production" && effectiveEnv.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${effectiveEnv.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (effectiveEnv.VERCEL_URL) {
    return `https://${effectiveEnv.VERCEL_URL}`;
  }
  return undefined;
})();
const sourcemapEnv = effectiveEnv.T3CODE_WEB_SOURCEMAP?.trim().toLowerCase();
const manualDevChangePolicy =
  resolveDevChangePolicy(effectiveEnv, { defaultPolicy: "manual" }) === "manual";
const restartControlToken = readNonEmptyEnvValue(effectiveEnv[RESTART_CONTROL_TOKEN_ENV]);

// Vite 8.1's experimental bundled dev mode: serves rolldown-bundled chunks in
// dev for much faster startup/reload on large module graphs, with HMR served
// as hot patches. Opt-in while experimental: T3CODE_BUNDLED_DEV=1 pnpm dev:web
const bundledDevEnv = process.env.T3CODE_BUNDLED_DEV?.trim().toLowerCase();
const bundledDev = bundledDevEnv === "1" || bundledDevEnv === "true";

const buildSourcemap: boolean | "hidden" =
  sourcemapEnv === "0" || sourcemapEnv === "false"
    ? false
    : sourcemapEnv === "hidden"
      ? "hidden"
      : true;

const diffsWorkerAssetBasePath = "/__t3-vendor/diffs-worker";
const diffsWorkerPortablePath = NodeURL.fileURLToPath(
  import.meta.resolve("@pierre/diffs/worker/worker-portable.js"),
);
const diffsWorkerDirectory = NodePath.dirname(diffsWorkerPortablePath);
const diffsWorkerAssets = [
  {
    fileName: "worker-portable.js",
    sourcePath: diffsWorkerPortablePath,
    contentType: "application/javascript; charset=utf-8",
  },
  {
    fileName: "wasm-qE0LgnY3.js",
    sourcePath: NodePath.join(diffsWorkerDirectory, "wasm-qE0LgnY3.js"),
    contentType: "application/javascript; charset=utf-8",
  },
] as const;

const unitTestProject = {
  extends: true,
  test: {
    name: "unit",
    include: ["src/**/*.test.{ts,tsx}"],
    // The web runtime suite exercises auth bootstrap, saved environments,
    // and websocket subscription lifecycles. Under the full monorepo test
    // run, those async tests can exceed Vitest's default 5s budget.
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
} satisfies TestProjectInlineConfiguration;

function resolveDevProxyTarget(wsUrl: string | undefined): string | undefined {
  if (!wsUrl) {
    return undefined;
  }

  try {
    const url = new URL(wsUrl);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

const devProxyTarget = resolveDevProxyTarget(configuredWsUrl);

function resolveGitBranchName(): string {
  try {
    return NodeChildProcess.execFileSync("git", ["branch", "--show-current"], {
      cwd: webPackageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function resolveGitWorktreeName(): string {
  try {
    const worktreePath = NodeChildProcess.execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: webPackageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return NodePath.basename(worktreePath);
  } catch {
    return "";
  }
}

function readOptionalEnvFile(path: string): Record<string, string | undefined> {
  return NodeFS.existsSync(path) ? NodeUtil.parseEnv(NodeFS.readFileSync(path, "utf8")) : {};
}

function manualRestartNotificationPlugin({
  enabled,
  httpBaseUrl,
  token,
}: {
  readonly enabled: boolean;
  readonly httpBaseUrl: string | undefined;
  readonly token: string | undefined;
}): Plugin {
  let notificationTimer: ReturnType<typeof setTimeout> | undefined;
  let notificationSequence = Date.now();
  const endpoint = resolveRestartNotificationEndpoint(httpBaseUrl);

  return {
    name: "t3code-manual-restart-notification",
    apply: "serve",
    configureServer(server) {
      if (!enabled) {
        return;
      }

      const notify = async () => {
        const posted = await postRestartRequired({
          endpoint,
          token,
          reason: DEFAULT_DEV_SOURCE_CHANGE_REASON,
        });

        if (posted) {
          return;
        }

        server.ws.send({
          type: "custom",
          event: DEV_SOURCE_CHANGED_EVENT,
          data: createDevSourceChangePayload({
            reason: DEFAULT_DEV_SOURCE_CHANGE_REASON,
            sequence: ++notificationSequence,
          }),
        });
      };

      const scheduleNotification = () => {
        if (notificationTimer) {
          clearTimeout(notificationTimer);
        }

        notificationTimer = setTimeout(() => {
          notificationTimer = undefined;
          void notify();
        }, 120);
      };

      const handleWatchEvent = (event: string, path: string) => {
        if (shouldNotifyForViteWatchEvent(event, path)) {
          scheduleNotification();
        }
      };

      server.watcher.on("all", handleWatchEvent);
      server.httpServer?.once("close", () => {
        if (notificationTimer) {
          clearTimeout(notificationTimer);
          notificationTimer = undefined;
        }
        server.watcher.off("all", handleWatchEvent);
      });
    },
  };
}

function diffsWorkerAssetsPlugin(): Plugin {
  const normalizedViteBase = viteBase === "/" ? "" : viteBase.replace(/\/$/u, "");
  const assetByRequestPath = new Map(
    diffsWorkerAssets.map((asset) => [`${diffsWorkerAssetBasePath}/${asset.fileName}`, asset]),
  );

  return {
    name: "t3code-diffs-worker-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const rawUrl = request.url;
        if (!rawUrl) {
          next();
          return;
        }

        let requestPath: string;
        try {
          requestPath = decodeURIComponent(new URL(rawUrl, "http://t3code.local").pathname);
        } catch {
          next();
          return;
        }

        if (normalizedViteBase && requestPath.startsWith(`${normalizedViteBase}/`)) {
          requestPath = requestPath.slice(normalizedViteBase.length);
        }

        const asset = assetByRequestPath.get(requestPath);
        if (!asset) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Content-Type", asset.contentType);
        response.setHeader("Cache-Control", "no-cache");
        NodeFS.createReadStream(asset.sourcePath).once("error", next).pipe(response);
      });
    },
    generateBundle() {
      for (const asset of diffsWorkerAssets) {
        this.emitFile({
          type: "asset",
          fileName: `${diffsWorkerAssetBasePath.slice(1)}/${asset.fileName}`,
          source: NodeFS.readFileSync(asset.sourcePath),
        });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: viteBase,
    plugins: [
      tanstackRouter(),
      react(),
      babel({
        // We need to be explicit about the parser options after moving to @vitejs/plugin-react v6.0.0
        // This is because the babel plugin only automatically parses typescript and jsx based on relative paths (e.g. "**/*.ts")
        // whereas the previous version of the plugin parsed all files with a .ts extension.
        // This is causing our packages/ directory to fail to parse, as they are not relative to the CWD.
        parserOpts: { plugins: ["typescript", "jsx"] },
        presets: [reactCompilerPreset()],
      }),
      tailwindcss(),
      diffsWorkerAssetsPlugin(),
      manualRestartNotificationPlugin({
        enabled: manualDevChangePolicy,
        httpBaseUrl: configuredHttpUrl,
        token: restartControlToken,
      }),
    ],
    optimizeDeps: {
      include: [
        "@clerk/clerk-js",
        "@clerk/react/internal",
        "@pierre/diffs",
        "@pierre/diffs/editor",
        "@pierre/diffs/react",
        "effect/Array",
        "effect/Order",
        "react-dom/client",
      ],
    },
    define: {
      // In dev mode, tell the web app where the WebSocket server lives
      "import.meta.env.VITE_WS_URL": JSON.stringify(configuredWsUrl ?? ""),
      "import.meta.env.VITE_T3CODE_RELAY_URL": JSON.stringify(configuredRelayUrl),
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(configuredClerkPublishableKey),
      "import.meta.env.VITE_CLERK_JWT_TEMPLATE": JSON.stringify(configuredClerkJwtTemplate),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_URL": JSON.stringify(configuredRelayTracingUrl),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_DATASET": JSON.stringify(
        configuredRelayTracingDataset,
      ),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_TOKEN": JSON.stringify(configuredRelayTracingToken),
      "import.meta.env.VITE_T3_WORKTREE_ROLE": JSON.stringify(configuredT3WorktreeRole),
      "import.meta.env.VITE_T3_WORKTREE_PATH": JSON.stringify(configuredT3WorktreePath),
      "import.meta.env.VITE_T3_GIT_BRANCH": JSON.stringify(configuredT3GitBranch),
      "import.meta.env.VITE_T3_GIT_COMMIT": JSON.stringify(configuredT3GitCommit),
      "import.meta.env.VITE_T3_DEV_INSTANCE": JSON.stringify(configuredT3DevInstance),
      "import.meta.env.VITE_T3_HOME": JSON.stringify(configuredT3Home),
      "import.meta.env.VITE_HOSTED_APP_URL": JSON.stringify(configuredHostedAppUrl ?? ""),
      "import.meta.env.VITE_HOSTED_APP_CHANNEL": JSON.stringify(configuredHostedAppChannel),
      "import.meta.env.VITE_DEV_WORKTREE_NAME": JSON.stringify(configuredDevWorktreeName),
      "import.meta.env.VITE_DEV_BRANCH_NAME": JSON.stringify(configuredDevBranchName),
      "import.meta.env.VITE_T3CODE_PUBLIC_ORIGIN": JSON.stringify(configuredPublicOrigin),
      "import.meta.env.VITE_T3CODE_PUBLIC_BASE_PATH": JSON.stringify(
        configuredPublicBasePath ?? "",
      ),
      "import.meta.env.VITE_T3CODE_PUBLIC_BASE_URL": JSON.stringify(configuredPublicBaseUrl),
      "import.meta.env.APP_VERSION": JSON.stringify(configuredAppVersion),
    },
    resolve: {
      tsconfigPaths: true,
      dedupe: ["react", "react-dom"],
    },
    experimental: {
      bundledDev,
    },
    server: {
      host,
      port,
      strictPort: true,
      ...(devProxyTarget
        ? {
            proxy: Object.fromEntries(
              resolveDevProxyRoutes(configuredPublicBasePath).map((route) => [
                route.path,
                {
                  target: devProxyTarget,
                  changeOrigin: true,
                  ...(route.websocket ? { ws: true } : {}),
                },
              ]),
            ),
          }
        : {}),
      hmr: {
        // Explicit config so Vite's HMR WebSocket connects reliably
        // inside Electron's BrowserWindow. Vite 8 uses console.debug for
        // connection logs — enable "Verbose" in DevTools to see them.
        protocol: "ws",
        host,
        clientPort: port,
      },
      ...(manualDevChangePolicy
        ? {
            hotUpdateEnvironments: async () => {},
          }
        : {}),
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: buildSourcemap,
    },
    test: {
      projects: [defineProject(unitTestProject)],
    },
  };
});
