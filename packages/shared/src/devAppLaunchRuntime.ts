import {
  type DesktopDevLaunchCollision,
  type DesktopDevLaunchCollisionPromptInput,
  type DesktopDevLaunchCollisionPromptResult,
  type DesktopDevLaunchLaunchInput,
  type DesktopDevLaunchRecord,
  type DesktopDevLaunchState,
  type DesktopDevLaunchStopInput,
  type DesktopDevLaunchThreadRef,
  type PromptOverrides,
  DesktopDevLaunchError as DevAppLaunchError,
  DesktopDevLaunchRecord as DesktopDevLaunchRecordSchema,
} from "@t3tools/contracts";
import {
  DEV_LAUNCH_MANIFEST_RELATIVE_PATH,
  buildDevLaunchCollisionPrompt,
  buildDevLaunchPublicUrl,
  joinDevLaunchPublicPath,
  parseProjectDevLaunchManifest,
  renderDevLaunchHealthCheckPath,
  renderDevLaunchTemplate,
  resolveAppSegment,
  resolveProjectSlug,
  resolveWorktreeSlug,
  type ProjectDevLaunchResolvedValues,
} from "./devLaunch.ts";
import * as NodeNet from "node:net";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const REGISTRY_FILE_NAME = "dev-launches.json";
const STARTUP_TIMEOUT_MS = 180_000;
const HEALTHCHECK_INTERVAL_MS = 500;
const TAILSCALE_DEV_LAUNCH_SERVE_PORT = 443;

const DesktopDevLaunchRegistry = Schema.Struct({
  launches: Schema.Array(DesktopDevLaunchRecordSchema),
});
type DesktopDevLaunchRegistry = typeof DesktopDevLaunchRegistry.Type;
const DesktopDevLaunchRegistryJson = Schema.fromJsonString(DesktopDevLaunchRegistry);
const encodeRegistryJson = Schema.encodeEffect(DesktopDevLaunchRegistryJson);
const decodeRegistryJson = Schema.decodeEffect(DesktopDevLaunchRegistryJson);

export { DevAppLaunchError };

type DevAppLaunchManagerError = DevAppLaunchError;
const isDevAppLaunchError = Schema.is(DevAppLaunchError);

export interface DevAppLaunchRuntimeConfig {
  readonly inheritedEnv: NodeJS.ProcessEnv;
  readonly serverPublicBasePath: string;
  readonly stateDir: string;
}

export interface DevAppLaunchTailscaleRuntime {
  readonly readStatus: Effect.Effect<
    { readonly magicDnsName: string | null },
    Error,
    ChildProcessSpawner.ChildProcessSpawner
  >;
  readonly assertMagicDnsResolvable: (input: {
    readonly magicDnsName: string;
  }) => Effect.Effect<void, Error>;
  readonly assertServePathAvailable: (input: {
    readonly localHost: string;
    readonly localPort: number;
    readonly servePort: number;
    readonly servePath: string;
    readonly localPath: string;
  }) => Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner>;
  readonly ensureServe: (input: {
    readonly localHost: string;
    readonly localPort: number;
    readonly servePort: number;
    readonly servePath?: string;
    readonly localPath?: string;
  }) => Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner>;
  readonly disableServe: (input: {
    readonly servePort: number;
    readonly servePath?: string;
  }) => Effect.Effect<void, Error, ChildProcessSpawner.ChildProcessSpawner>;
}

export interface DevAppLaunchManagerShape {
  readonly getState: (
    threadRef: DesktopDevLaunchThreadRef,
  ) => Effect.Effect<DesktopDevLaunchState, DevAppLaunchError>;
  readonly launch: (
    input: DesktopDevLaunchLaunchInput,
  ) => Effect.Effect<DesktopDevLaunchState, DevAppLaunchManagerError>;
  readonly stop: (
    input: DesktopDevLaunchStopInput,
  ) => Effect.Effect<DesktopDevLaunchState, DevAppLaunchError>;
  readonly listActive: Effect.Effect<DesktopDevLaunchState, DevAppLaunchError>;
  readonly buildCollisionPrompt: (
    input: DesktopDevLaunchCollisionPromptInput,
  ) => Effect.Effect<DesktopDevLaunchCollisionPromptResult>;
}

function sameThreadRef(left: DesktopDevLaunchThreadRef, right: DesktopDevLaunchThreadRef): boolean {
  return left.environmentId === right.environmentId && left.threadId === right.threadId;
}

export function selectCurrentDevLaunchForThread(input: {
  readonly active: ReadonlyArray<DesktopDevLaunchRecord>;
  readonly threadRef: DesktopDevLaunchThreadRef;
}): DesktopDevLaunchRecord | null {
  return (
    input.active.findLast((launch) => sameThreadRef(launch.threadRef, input.threadRef)) ?? null
  );
}

export function selectDevLaunchesForThread(input: {
  readonly active: ReadonlyArray<DesktopDevLaunchRecord>;
  readonly threadRef: DesktopDevLaunchThreadRef;
}): DesktopDevLaunchRecord[] {
  return input.active.filter((launch) => sameThreadRef(launch.threadRef, input.threadRef));
}

export function replaceDevLaunchProfileRecord(input: {
  readonly active: ReadonlyArray<DesktopDevLaunchRecord>;
  readonly nextLaunch: DesktopDevLaunchRecord;
}): DesktopDevLaunchRecord[] {
  return [
    ...input.active.filter(
      (launch) =>
        !sameThreadRef(launch.threadRef, input.nextLaunch.threadRef) ||
        launch.profileId !== input.nextLaunch.profileId,
    ),
    input.nextLaunch,
  ];
}

export function findActiveDevLaunchForWorktreeProfile(input: {
  readonly active: ReadonlyArray<DesktopDevLaunchRecord>;
  readonly canonicalWorktreePath: string;
  readonly profileId: string;
}): DesktopDevLaunchRecord | null {
  return (
    input.active.find(
      (launch) =>
        launch.canonicalWorktreePath === input.canonicalWorktreePath &&
        launch.profileId === input.profileId,
    ) ?? null
  );
}

function quoteEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:@-]*$/u.test(value)
    ? value
    : `"${value
        .replaceAll("\\", "\\\\")
        .replaceAll('"', '\\"')
        .replaceAll("\n", "\\n")
        .replaceAll("\r", "\\r")}"`;
}

export function updateDotenvContent(
  current: string,
  replacements: Readonly<Record<string, string>>,
): string {
  const normalizedCurrent = current.replace(/\n+$/u, "");
  const lines = normalizedCurrent.length === 0 ? [] : normalizedCurrent.split("\n");
  const remaining = new Set(Object.keys(replacements));
  const nextLines = lines.map((line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line.trim());
    if (!match) {
      return line;
    }
    const key = match[1]!;
    if (!remaining.has(key)) {
      return line;
    }
    remaining.delete(key);
    return `${key}=${quoteEnvValue(replacements[key]!)}`;
  });
  for (const key of remaining) {
    nextLines.push(`${key}=${quoteEnvValue(replacements[key]!)}`);
  }
  return `${nextLines.join("\n").replace(/\n*$/u, "")}\n`;
}

export function buildDevLaunchChildEnv(input: {
  readonly inheritedEnv: NodeJS.ProcessEnv;
  readonly envBindings: ReadonlyArray<{
    readonly key: string;
    readonly value: string;
  }>;
  readonly values: ProjectDevLaunchResolvedValues;
}): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.inheritedEnv)) {
    if (typeof value === "string") {
      next[key] = value;
    }
  }
  for (const binding of input.envBindings) {
    next[binding.key] = renderDevLaunchTemplate(binding.value, input.values);
  }
  return next;
}

export function resolveDevLaunchWorkspacePath(input: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly fieldName: string;
}): string {
  const trimmedRelativePath = input.relativePath.trim();
  if (trimmedRelativePath.length === 0) {
    throw new DevAppLaunchError({
      message: `${input.fieldName} must not be empty.`,
    });
  }
  if (trimmedRelativePath.startsWith("/") || /^[A-Za-z]:[/\\]/u.test(trimmedRelativePath)) {
    throw new DevAppLaunchError({
      message: `${input.fieldName} must be relative to the project workspace.`,
    });
  }

  const normalize = (value: string): string => {
    const withSlashes = value.replaceAll("\\", "/");
    const driveMatch = /^[A-Za-z]:/u.exec(withSlashes);
    const prefix = driveMatch?.[0] ?? (withSlashes.startsWith("/") ? "/" : "");
    const body = prefix.length > 0 ? withSlashes.slice(prefix.length) : withSlashes;
    const segments: string[] = [];
    for (const segment of body.split("/")) {
      if (segment.length === 0 || segment === ".") {
        continue;
      }
      if (segment === "..") {
        segments.pop();
        continue;
      }
      segments.push(segment);
    }
    if (prefix === "/") {
      return `/${segments.join("/")}`.replace(/\/+$/u, "") || "/";
    }
    if (prefix.length > 0) {
      return `${prefix}/${segments.join("/")}`.replace(/\/+$/u, "");
    }
    return segments.join("/");
  };

  const workspaceRoot = normalize(input.workspaceRoot);
  const absolutePath = normalize(`${workspaceRoot}/${trimmedRelativePath}`);
  if (absolutePath !== workspaceRoot && !absolutePath.startsWith(`${workspaceRoot}/`)) {
    throw new DevAppLaunchError({
      message: `${input.fieldName} must stay inside the project workspace.`,
    });
  }

  return absolutePath;
}

export function checkDevLaunchLocalPortAvailable(input: {
  readonly host: string;
  readonly port: number;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const server = NodeNet.createServer();
    let settled = false;

    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      server.removeAllListeners();
      if (server.listening) {
        server.close(() => resolve(available));
        return;
      }
      resolve(available);
    };

    server.once("error", () => finish(false));
    server.once("listening", () => finish(true));
    server.listen({ host: input.host, port: input.port, exclusive: true });
  });
}

function toCollisionMessage(collision: DesktopDevLaunchCollision): string {
  if (collision.type === "port-conflict") {
    return `Port ${collision.requestedPort} is already in use by '${collision.blocking.profileName}'.`;
  }
  if (collision.type === "route-conflict") {
    return `Route ${collision.servePath} is already taken by ${collision.existingProxyUrl}.`;
  }
  return `Worktree ${collision.blocking.canonicalWorktreePath} already has '${collision.blocking.profileName}' running.`;
}

function readTailscaleServePathConflict(cause: unknown): {
  readonly servePath: string;
  readonly servePort: number;
  readonly existingProxyUrl: string;
  readonly expectedProxyUrl: string;
} | null {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "_tag" in cause &&
    cause._tag === "TailscaleServePathConflictError" &&
    "servePath" in cause &&
    typeof cause.servePath === "string" &&
    "servePort" in cause &&
    typeof cause.servePort === "number" &&
    "existingProxyUrl" in cause &&
    typeof cause.existingProxyUrl === "string" &&
    "expectedProxyUrl" in cause &&
    typeof cause.expectedProxyUrl === "string"
  ) {
    return {
      servePath: cause.servePath,
      servePort: cause.servePort,
      existingProxyUrl: cause.existingProxyUrl,
      expectedProxyUrl: cause.expectedProxyUrl,
    };
  }
  return null;
}

function toDevLaunchError(message: string) {
  return (cause: unknown): DevAppLaunchError =>
    new DevAppLaunchError({
      message: cause instanceof Error ? `${message}: ${cause.message}` : message,
    });
}

export const makeDevAppLaunchManager = (runtimeInput: {
  readonly config: DevAppLaunchRuntimeConfig;
  readonly tailscale: DevAppLaunchTailscaleRuntime;
  readonly resolvePromptOverrides?: Effect.Effect<PromptOverrides, never> | undefined;
}): Effect.Effect<
  DevAppLaunchManagerShape,
  never,
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner
  | HttpClient.HttpClient
  | Scope.Scope
> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const httpClient = yield* HttpClient.HttpClient;
    const managerScope = yield* Scope.Scope;
    const launchScopes = new Map<number, Scope.Closeable>();
    const registryPath = path.join(runtimeInput.config.stateDir, REGISTRY_FILE_NAME);

    yield* Scope.addFinalizer(
      managerScope,
      Effect.suspend(() =>
        Effect.forEach([...launchScopes.values()], (launchScope) =>
          Scope.close(launchScope, Exit.void),
        ).pipe(Effect.asVoid, Effect.ignore),
      ),
    );

    const resolveWorkspacePath = (input: {
      readonly workspaceRoot: string;
      readonly relativePath: string;
      readonly fieldName: string;
    }) =>
      Effect.try({
        try: () => resolveDevLaunchWorkspacePath(input),
        catch: (cause) =>
          isDevAppLaunchError(cause)
            ? cause
            : new DevAppLaunchError({ message: `${input.fieldName} is invalid.` }),
      });

    const writeRegistry = (registry: DesktopDevLaunchRegistry) =>
      Effect.gen(function* () {
        const encoded = yield* encodeRegistryJson(registry).pipe(
          Effect.mapError(toDevLaunchError("Failed to encode dev launch registry")),
        );
        yield* fileSystem.makeDirectory(path.dirname(registryPath), { recursive: true });
        const tempPath = `${registryPath}.${process.pid}.tmp`;
        yield* fileSystem.writeFileString(tempPath, `${encoded}\n`);
        yield* fileSystem.rename(tempPath, registryPath);
      }).pipe(Effect.mapError(toDevLaunchError("Failed to write dev launch registry")));

    const loadRegistry = Effect.fn("desktop.devLaunch.loadRegistry")(function* () {
      const exists = yield* fileSystem.exists(registryPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return { launches: [] } satisfies DesktopDevLaunchRegistry;
      }

      const raw = yield* fileSystem
        .readFileString(registryPath)
        .pipe(Effect.orElseSucceed(() => ""));
      return yield* decodeRegistryJson(raw || '{"launches":[]}').pipe(
        Effect.orElseSucceed(() => ({ launches: [] })),
      );
    });

    const saveLaunches = (launches: readonly DesktopDevLaunchRecord[]) =>
      writeRegistry({ launches: [...launches] });

    const signalLaunch = (pid: number, signal: NodeJS.Signals) =>
      Effect.sync(() => {
        try {
          process.kill(-pid, signal);
        } catch {
          try {
            process.kill(pid, signal);
          } catch {
            // The process already exited.
          }
        }
      });

    const isProcessAlive = (pid: number) =>
      Effect.try({
        try: () => {
          process.kill(pid, 0);
          return true;
        },
        catch: () => false,
      }).pipe(Effect.orElseSucceed(() => false));

    const waitForProcessExit = (pid: number, timeoutMs: number) =>
      Effect.gen(function* () {
        const startedAt = yield* Clock.currentTimeMillis;
        while ((yield* Clock.currentTimeMillis) - startedAt < timeoutMs) {
          if (!(yield* isProcessAlive(pid))) {
            return true;
          }
          yield* Effect.sleep(Duration.millis(100));
        }
        return !(yield* isProcessAlive(pid));
      });

    const killLaunch = (launch: DesktopDevLaunchRecord) =>
      Effect.gen(function* () {
        const launchScope = launchScopes.get(launch.pid);
        if (launchScope !== undefined) {
          launchScopes.delete(launch.pid);
          yield* Scope.close(launchScope, Exit.void).pipe(Effect.ignore);
        }

        yield* signalLaunch(launch.pid, "SIGTERM");
        const exited = yield* waitForProcessExit(launch.pid, 3_000);
        if (!exited) {
          yield* signalLaunch(launch.pid, "SIGKILL");
          yield* waitForProcessExit(launch.pid, 1_000).pipe(Effect.ignore);
        }
      });

    const probeLocalUrl = Effect.fn("desktop.devLaunch.probeLocalUrl")(function* (input: {
      readonly localUrl: string;
      readonly healthCheckPath: string;
    }) {
      const url = new URL(input.localUrl);
      url.pathname = input.healthCheckPath;
      const client = httpClient.pipe(
        HttpClient.filterStatusOk,
        HttpClient.transformResponse(Effect.timeout(Duration.seconds(2))),
      );
      const startedAt = yield* Clock.currentTimeMillis;
      while ((yield* Clock.currentTimeMillis) - startedAt < STARTUP_TIMEOUT_MS) {
        const ready = yield* client.get(url).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
        if (ready) {
          return;
        }
        yield* Effect.sleep(Duration.millis(HEALTHCHECK_INTERVAL_MS));
      }
      return yield* new DevAppLaunchError({
        message: `Timed out waiting for ${url.toString()} to become ready.`,
      });
    });

    const readManifestProfile = Effect.fn("desktop.devLaunch.readManifestProfile")(
      function* (input: { readonly workspaceRoot: string; readonly profileId: string }) {
        const manifestPath = path.join(input.workspaceRoot, DEV_LAUNCH_MANIFEST_RELATIVE_PATH);
        const raw = yield* fileSystem.readFileString(manifestPath).pipe(
          Effect.mapError(
            () =>
              new DevAppLaunchError({
                message: `Missing ${DEV_LAUNCH_MANIFEST_RELATIVE_PATH}.`,
              }),
          ),
        );
        const manifest = yield* parseProjectDevLaunchManifest(raw).pipe(
          Effect.mapError(
            (cause) =>
              new DevAppLaunchError({
                message: cause instanceof Error ? cause.message : "Invalid dev launch manifest.",
              }),
          ),
        );
        const profile = manifest.profiles.find((candidate) => candidate.id === input.profileId);
        if (!profile) {
          return yield* new DevAppLaunchError({
            message: `Unknown dev launch profile '${input.profileId}'.`,
          });
        }
        return {
          profile,
          profileCount: manifest.profiles.length,
        } as const;
      },
    );

    const writeEnvBindings = Effect.fn("desktop.devLaunch.writeEnvBindings")(function* (input: {
      readonly workspaceRoot: string;
      readonly envBindings: ReadonlyArray<{
        readonly file: string;
        readonly key: string;
        readonly value: string;
      }>;
      readonly values: ProjectDevLaunchResolvedValues;
    }) {
      const grouped = new Map<string, Record<string, string>>();
      for (const binding of input.envBindings) {
        const absolutePath = yield* resolveWorkspacePath({
          workspaceRoot: input.workspaceRoot,
          relativePath: binding.file,
          fieldName: `env binding file '${binding.file}'`,
        });
        const current = grouped.get(absolutePath) ?? {};
        current[binding.key] = renderDevLaunchTemplate(binding.value, input.values);
        grouped.set(absolutePath, current);
      }

      for (const [filePath, replacements] of grouped) {
        const current = yield* fileSystem
          .readFileString(filePath)
          .pipe(Effect.orElseSucceed(() => ""));
        yield* fileSystem
          .makeDirectory(path.dirname(filePath), { recursive: true })
          .pipe(Effect.mapError(toDevLaunchError("Failed to create dev launch env directory")));
        yield* fileSystem
          .writeFileString(filePath, updateDotenvContent(current, replacements))
          .pipe(Effect.mapError(toDevLaunchError("Failed to write dev launch env file")));
      }
    });

    const reconcileActiveLaunches = (launches: readonly DesktopDevLaunchRecord[]) =>
      Effect.gen(function* () {
        const reconciled: DesktopDevLaunchRecord[] = [];
        for (const launch of launches) {
          const alive = yield* isProcessAlive(launch.pid);
          if (!alive) {
            continue;
          }

          yield* runtimeInput.tailscale
            .ensureServe({
              localHost: launch.localHost,
              localPort: launch.localPort,
              servePort: TAILSCALE_DEV_LAUNCH_SERVE_PORT,
              servePath: launch.publicPath,
              localPath: launch.publicPath,
            })
            .pipe(
              Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
              Effect.orElseSucceed(() => undefined),
            );
          reconciled.push(launch);
        }
        if (reconciled.length !== launches.length) {
          yield* saveLaunches(reconciled);
        }
        return reconciled;
      });

    const listActiveLaunchRecords = Effect.fn("desktop.devLaunch.listActiveLaunchRecords")(
      function* () {
        const registry = yield* loadRegistry();
        return yield* reconcileActiveLaunches(registry.launches);
      },
    );

    const getState = (threadRef: DesktopDevLaunchThreadRef) =>
      listActiveLaunchRecords().pipe(
        Effect.map((active) => ({
          current: selectCurrentDevLaunchForThread({ active, threadRef }),
          active,
        })),
      );

    const listActive = listActiveLaunchRecords().pipe(
      Effect.map((active) => ({
        current: null,
        active,
      })),
    );

    const launch = (input: DesktopDevLaunchLaunchInput) =>
      Effect.gen(function* () {
        const active = yield* listActiveLaunchRecords();
        const workspaceRoot = input.worktreePath ?? input.projectRoot;
        const canonicalWorktreePath = yield* fileSystem
          .realPath(workspaceRoot)
          .pipe(Effect.orElseSucceed(() => workspaceRoot));
        const { profile, profileCount } = yield* readManifestProfile({
          workspaceRoot,
          profileId: input.profileId,
        });

        const existingProfileLaunch = findActiveDevLaunchForWorktreeProfile({
          active,
          canonicalWorktreePath,
          profileId: input.profileId,
        });
        if (existingProfileLaunch) {
          if (sameThreadRef(existingProfileLaunch.threadRef, input.threadRef)) {
            return {
              current: existingProfileLaunch,
              active,
            } satisfies DesktopDevLaunchState;
          }
          const collision = {
            type: "worktree-conflict",
            requestedProfileId: input.profileId,
            blocking: existingProfileLaunch,
          } satisfies DesktopDevLaunchCollision;
          return yield* new DevAppLaunchError({
            collision,
            message: toCollisionMessage(collision),
          });
        }

        const portCollision = active.find((launch) => launch.localPort === profile.port);
        if (portCollision) {
          const collision = {
            type: "port-conflict",
            requestedProfileId: input.profileId,
            requestedPort: profile.port,
            blocking: portCollision,
          } satisfies DesktopDevLaunchCollision;
          return yield* new DevAppLaunchError({
            collision,
            message: toCollisionMessage(collision),
          });
        }

        const localPortAvailable = yield* Effect.promise(() =>
          checkDevLaunchLocalPortAvailable({
            host: profile.host,
            port: profile.port,
          }),
        );
        if (!localPortAvailable) {
          return yield* new DevAppLaunchError({
            message: `Local port ${profile.host}:${profile.port} is already in use by another process. Stop that process or choose another port in ${DEV_LAUNCH_MANIFEST_RELATIVE_PATH}.`,
          });
        }

        const tailscaleStatus = yield* runtimeInput.tailscale.readStatus.pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.mapError(
            (cause) =>
              new DevAppLaunchError({
                message:
                  cause instanceof Error ? cause.message : "Tailscale MagicDNS is unavailable.",
              }),
          ),
        );
        if (!tailscaleStatus.magicDnsName) {
          return yield* new DevAppLaunchError({
            message: "Tailscale MagicDNS is unavailable for this device.",
          });
        }
        yield* runtimeInput.tailscale
          .assertMagicDnsResolvable({
            magicDnsName: tailscaleStatus.magicDnsName,
          })
          .pipe(
            Effect.mapError(
              (cause) =>
                new DevAppLaunchError({
                  message:
                    cause instanceof Error ? cause.message : "Tailscale MagicDNS is unavailable.",
                }),
            ),
          );

        const projectSlug = resolveProjectSlug(input.projectName);
        const worktreeSlug = resolveWorktreeSlug({
          canonicalWorktreePath,
          branch: input.branch,
        });
        const appSegment = resolveAppSegment({ profile, profileCount });
        const publicPath = joinDevLaunchPublicPath({
          projectSlug,
          worktreeSlug,
          appSegment,
        });
        const publicUrl = buildDevLaunchPublicUrl({
          magicDnsName: tailscaleStatus.magicDnsName,
          publicPath,
        });
        const localUrl = `http://${profile.host}:${profile.port}`;
        const serverPublicBasePath = `${runtimeInput.config.serverPublicBasePath.replace(
          /\/+$/u,
          "",
        )}/`;
        const serverPublicBaseUrl = new URL(
          serverPublicBasePath,
          `https://${tailscaleStatus.magicDnsName}`,
        )
          .toString()
          .replace(/\/+$/u, "");

        yield* runtimeInput.tailscale
          .assertServePathAvailable({
            localHost: profile.host,
            localPort: profile.port,
            servePath: publicPath,
            localPath: publicPath,
            servePort: TAILSCALE_DEV_LAUNCH_SERVE_PORT,
          })
          .pipe(
            Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
            Effect.mapError((cause) => {
              const routeConflict = readTailscaleServePathConflict(cause);
              if (routeConflict !== null) {
                const collision = {
                  type: "route-conflict",
                  requestedProfileId: input.profileId,
                  servePath: routeConflict.servePath,
                  servePort: routeConflict.servePort,
                  existingProxyUrl: routeConflict.existingProxyUrl,
                  expectedProxyUrl: routeConflict.expectedProxyUrl,
                } satisfies DesktopDevLaunchCollision;
                return new DevAppLaunchError({
                  collision,
                  message: toCollisionMessage(collision),
                });
              }
              return new DevAppLaunchError({
                message:
                  cause instanceof Error ? cause.message : "Tailscale serve path is unavailable.",
              });
            }),
          );

        const values: ProjectDevLaunchResolvedValues = {
          host: profile.host,
          port: profile.port,
          branch: input.branch,
          localHttpUrl: localUrl,
          publicOrigin: `https://${tailscaleStatus.magicDnsName}`,
          publicBasePath: publicPath,
          publicBaseUrl: publicUrl.replace(/\/+$/u, ""),
          serverPublicBasePath,
          serverPublicBaseUrl,
          projectSlug,
          worktreeSlug,
          appSegment,
        };
        const healthCheckPath = renderDevLaunchHealthCheckPath(profile.healthCheckPath, values);

        yield* writeEnvBindings({
          workspaceRoot,
          envBindings: profile.envBindings,
          values,
        });
        const childEnv = buildDevLaunchChildEnv({
          inheritedEnv: runtimeInput.config.inheritedEnv,
          envBindings: profile.envBindings,
          values,
        });

        const cwd = yield* resolveWorkspacePath({
          workspaceRoot,
          relativePath: profile.cwd,
          fieldName: `profile '${profile.id}' cwd`,
        });
        const launchScope = yield* Scope.make();
        const child = yield* spawner
          .spawn(
            ChildProcess.make(profile.command, [], {
              cwd,
              detached: true,
              stdin: "ignore",
              stdout: "ignore",
              stderr: "ignore",
              shell: true,
              env: childEnv,
              extendEnv: false,
            }),
          )
          .pipe(
            Effect.provideService(Scope.Scope, launchScope),
            Effect.mapError(toDevLaunchError("Failed to spawn dev app")),
          );

        const rerefDevApp = yield* child.unref.pipe(
          Effect.mapError(toDevLaunchError("Failed to unref dev app")),
        );
        void rerefDevApp;
        launchScopes.set(child.pid, launchScope);

        if (child.pid <= 0) {
          yield* Scope.close(launchScope, Exit.void).pipe(Effect.ignore);
          return yield* new DevAppLaunchError({
            message: "Dev app process did not expose a valid process id.",
          });
        }

        const cleanupFailedChild = Effect.gen(function* () {
          launchScopes.delete(child.pid);
          yield* Scope.close(launchScope, Exit.void).pipe(Effect.ignore);
          yield* signalLaunch(child.pid, "SIGTERM");
          const exited = yield* waitForProcessExit(child.pid, 3_000);
          if (!exited) {
            yield* signalLaunch(child.pid, "SIGKILL");
            yield* waitForProcessExit(child.pid, 1_000).pipe(Effect.ignore);
          }
        });

        yield* Effect.gen(function* () {
          yield* probeLocalUrl({
            localUrl,
            healthCheckPath,
          });

          yield* runtimeInput.tailscale
            .ensureServe({
              localHost: profile.host,
              localPort: profile.port,
              servePort: TAILSCALE_DEV_LAUNCH_SERVE_PORT,
              servePath: publicPath,
              localPath: publicPath,
            })
            .pipe(
              Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
              Effect.mapError(
                (cause) =>
                  new DevAppLaunchError({
                    message:
                      cause instanceof Error
                        ? cause.message
                        : "Failed to configure Tailscale Serve.",
                  }),
              ),
            );
        }).pipe(Effect.tapError(() => cleanupFailedChild));

        const startedAt = DateTime.formatIso(yield* DateTime.now);
        const nextLaunch: DesktopDevLaunchRecord = {
          threadRef: input.threadRef,
          projectId: input.projectId,
          projectRoot: input.projectRoot,
          projectSlug,
          canonicalWorktreePath,
          worktreeSlug,
          profileId: profile.id,
          profileName: profile.name,
          profileCwd: profile.cwd,
          appSegment,
          localPort: profile.port,
          localHost: profile.host,
          localUrl,
          publicPath,
          publicUrl,
          pid: child.pid,
          startedAt,
          status: "running",
        };

        const nextActive = replaceDevLaunchProfileRecord({ active, nextLaunch });
        yield* saveLaunches(nextActive);
        return {
          current: nextLaunch,
          active: nextActive,
        } satisfies DesktopDevLaunchState;
      });

    const stop = (input: DesktopDevLaunchStopInput) =>
      Effect.gen(function* () {
        const active = yield* listActiveLaunchRecords();
        const targets = selectDevLaunchesForThread({
          active,
          threadRef: input.threadRef,
        });
        if (targets.length === 0) {
          return {
            current: null,
            active,
          } satisfies DesktopDevLaunchState;
        }
        for (const target of targets) {
          yield* killLaunch(target);
          yield* runtimeInput.tailscale
            .disableServe({
              servePort: TAILSCALE_DEV_LAUNCH_SERVE_PORT,
              servePath: target.publicPath,
            })
            .pipe(
              Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
              Effect.orElseSucceed(() => undefined),
            );
        }
        const nextActive = active.filter(
          (launch) => !sameThreadRef(launch.threadRef, input.threadRef),
        );
        yield* saveLaunches(nextActive);
        return {
          current: null,
          active: nextActive,
        } satisfies DesktopDevLaunchState;
      });

    const buildCollisionPromptForInput = (input: DesktopDevLaunchCollisionPromptInput) =>
      (runtimeInput.resolvePromptOverrides ?? Effect.succeed({})).pipe(
        Effect.map(
          (promptOverrides) =>
            ({
              prompt: buildDevLaunchCollisionPrompt({
                collision: input.collision,
                projectName:
                  input.collision.type === "route-conflict"
                    ? input.collision.servePath
                    : input.collision.blocking.projectSlug,
                promptOverrides,
              }),
            }) satisfies DesktopDevLaunchCollisionPromptResult,
        ),
      );

    yield* listActiveLaunchRecords().pipe(Effect.ignore);

    return {
      getState,
      launch,
      stop,
      listActive,
      buildCollisionPrompt: buildCollisionPromptForInput,
    } satisfies DevAppLaunchManagerShape;
  });
