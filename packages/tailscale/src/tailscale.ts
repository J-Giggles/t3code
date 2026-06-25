import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { DEFAULT_PUBLIC_PATH_PREFIX, normalizePublicPathPrefix } from "@t3tools/shared/publicPath";
import * as NodeDnsPromises from "node:dns/promises";
import * as NodeTimersPromises from "node:timers/promises";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export const DEFAULT_TAILSCALE_SERVE_PORT = 443;
export const DEFAULT_TAILSCALE_SERVE_PATH = DEFAULT_PUBLIC_PATH_PREFIX;
export const TAILSCALE_STATUS_TIMEOUT_MS = 1_500;
export const TAILSCALE_SERVE_TIMEOUT_MS = 10_000;
export const TAILSCALE_PROBE_TIMEOUT_MS = 2_500;
export const TAILSCALE_MAGIC_DNS_LOOKUP_TIMEOUT_MS = 2_500;
export const TAILSCALE_STATUS_TIMEOUT = Duration.millis(TAILSCALE_STATUS_TIMEOUT_MS);
export const TAILSCALE_SERVE_TIMEOUT = Duration.millis(TAILSCALE_SERVE_TIMEOUT_MS);
export const TAILSCALE_PROBE_TIMEOUT = Duration.millis(TAILSCALE_PROBE_TIMEOUT_MS);

// tailscale is a real executable everywhere (`tailscale.exe` on Windows), so
// it is always spawned directly rather than through cmd.exe shell mode.
const tailscaleCommandForPlatform = (platform: NodeJS.Platform): "tailscale" | "tailscale.exe" =>
  platform === "win32" ? "tailscale.exe" : "tailscale";

const TailscaleCommandContext = {
  executable: Schema.Literals(["tailscale", "tailscale.exe"]),
  subcommand: Schema.Literals(["status", "serve"]),
  argumentCount: Schema.Number,
};

export class TailscaleCommandSpawnError extends Schema.TaggedErrorClass<TailscaleCommandSpawnError>()(
  "TailscaleCommandSpawnError",
  {
    ...TailscaleCommandContext,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to spawn tailscale ${this.subcommand}.`;
  }
}

export class TailscaleCommandOutputError extends Schema.TaggedErrorClass<TailscaleCommandOutputError>()(
  "TailscaleCommandOutputError",
  {
    ...TailscaleCommandContext,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to read output from tailscale ${this.subcommand}.`;
  }
}

export class TailscaleCommandExitError extends Schema.TaggedErrorClass<TailscaleCommandExitError>()(
  "TailscaleCommandExitError",
  {
    ...TailscaleCommandContext,
    exitCode: Schema.Number,
    stdoutLength: Schema.optional(Schema.Number),
    stderrLength: Schema.Number,
  },
) {
  override get message(): string {
    return `tailscale ${this.subcommand} exited with code ${this.exitCode}.`;
  }
}

export class TailscaleCommandTimeoutError extends Schema.TaggedErrorClass<TailscaleCommandTimeoutError>()(
  "TailscaleCommandTimeoutError",
  {
    ...TailscaleCommandContext,
    timeoutMs: Schema.Number,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `tailscale ${this.subcommand} timed out after ${this.timeoutMs}ms.`;
  }
}

export const TailscaleCommandError = Schema.Union([
  TailscaleCommandSpawnError,
  TailscaleCommandOutputError,
  TailscaleCommandExitError,
  TailscaleCommandTimeoutError,
]);
export type TailscaleCommandError = typeof TailscaleCommandError.Type;

export class TailscaleStatusParseError extends Schema.TaggedErrorClass<TailscaleStatusParseError>()(
  "TailscaleStatusParseError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Failed to decode tailscale status JSON.";
  }
}

export class TailscaleServeStatusParseError extends Data.TaggedError(
  "TailscaleServeStatusParseError",
)<{
  readonly cause: unknown;
}> {}

export class TailscaleUnavailableError extends Data.TaggedError("TailscaleUnavailableError")<{
  readonly reason: string;
}> {}

export class TailscaleMagicDnsResolutionError extends Data.TaggedError(
  "TailscaleMagicDnsResolutionError",
)<{
  readonly magicDnsName: string;
  readonly message: string;
  readonly cause: unknown;
}> {}

export class TailscaleServePathConflictError extends Data.TaggedError(
  "TailscaleServePathConflictError",
)<{
  readonly servePath: string;
  readonly servePort: number;
  readonly existingProxyUrl: string;
  readonly expectedProxyUrl: string;
}> {
  override get message() {
    return `Tailscale HTTPS path ${this.servePath} is already in use by ${this.existingProxyUrl} (this environment expects ${this.expectedProxyUrl}).`;
  }
}

const TailscaleStatusSelf = Schema.Struct({
  DNSName: Schema.optional(Schema.Unknown),
  TailscaleIPs: Schema.optional(Schema.Unknown),
});

const TailscaleStatusJson = Schema.Struct({
  Self: Schema.optional(TailscaleStatusSelf),
});

export type TailscaleStatusSelf = typeof TailscaleStatusSelf.Type;
export type TailscaleStatusJson = typeof TailscaleStatusJson.Type;

export interface TailscaleStatus {
  readonly magicDnsName: string | null;
  readonly tailnetIpv4Addresses: readonly string[];
}

export interface TailscaleServeRouteStatus {
  readonly configured: boolean;
  readonly proxyUrl: string | null;
}

export type TailscaleServeRouteAvailabilityStatus = "available" | "owned" | "conflict";

export interface TailscaleServeRouteAvailability {
  readonly status: TailscaleServeRouteAvailabilityStatus;
  readonly available: boolean;
  readonly owned: boolean;
  readonly conflict: boolean;
  readonly servePath: string;
  readonly servePort: number;
  readonly expectedProxyUrl: string;
  readonly existingProxyUrl: string | null;
}

export interface TailscaleServeOwnedRouteDisableResult {
  readonly disabled: boolean;
  readonly existingProxyUrl: string | null;
}

const collectStdout = <E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (acc, chunk) => acc + chunk,
    ),
  );

const collectStderr = collectStdout;

const decodeTailscaleStatusJson = Schema.decodeEffect(Schema.fromJsonString(TailscaleStatusJson));
const decodeUnknownJson = Schema.decodeUnknownSync(Schema.UnknownFromJsonString);

function normalizeMagicDnsName(status: TailscaleStatusJson): string | null {
  const dnsName = status.Self?.DNSName;
  if (typeof dnsName !== "string") {
    return null;
  }

  const normalized = dnsName.trim().replace(/\.$/u, "");
  return normalized.length > 0 ? normalized : null;
}

export const parseTailscaleMagicDnsName = (
  rawStatusJson: string,
): Effect.Effect<string | null, TailscaleStatusParseError> =>
  decodeTailscaleStatusJson(rawStatusJson).pipe(
    Effect.mapError((cause) => new TailscaleStatusParseError({ cause })),
    Effect.map(normalizeMagicDnsName),
  );

export function isTailscaleIpv4Address(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const [first, second, third, fourth] = parts.map((part) => Number.parseInt(part, 10));
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    [first, second, third, fourth].some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  return first === 100 && second >= 64 && second <= 127;
}

export const parseTailscaleStatus = (
  rawStatusJson: string,
): Effect.Effect<TailscaleStatus, TailscaleStatusParseError> =>
  decodeTailscaleStatusJson(rawStatusJson).pipe(
    Effect.mapError((cause) => new TailscaleStatusParseError({ cause })),
    Effect.map((parsed) => {
      const rawIps = parsed.Self?.TailscaleIPs;
      const tailnetIpv4Addresses: Array<string> = [];
      if (Array.isArray(rawIps)) {
        for (const address of rawIps) {
          if (typeof address === "string" && isTailscaleIpv4Address(address)) {
            tailnetIpv4Addresses.push(address);
          }
        }
      }

      return {
        magicDnsName: normalizeMagicDnsName(parsed),
        tailnetIpv4Addresses,
      };
    }),
  );

export const readTailscaleStatus = Effect.gen(function* () {
  const args = ["status", "--json"];
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const hostPlatform = yield* HostProcessPlatform;
  const executable = tailscaleCommandForPlatform(hostPlatform);
  const commandContext = {
    executable,
    subcommand: "status" as const,
    argumentCount: args.length,
  };
  return yield* Effect.gen(function* () {
    const child = yield* spawner
      .spawn(ChildProcess.make(executable, args))
      .pipe(
        Effect.mapError((cause) => new TailscaleCommandSpawnError({ ...commandContext, cause })),
      );
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        collectStdout(child.stdout),
        collectStderr(child.stderr),
        child.exitCode.pipe(Effect.map(Number)),
      ],
      { concurrency: "unbounded" },
    ).pipe(
      Effect.mapError((cause) => new TailscaleCommandOutputError({ ...commandContext, cause })),
    );
    if (exitCode !== 0) {
      return yield* new TailscaleCommandExitError({
        ...commandContext,
        exitCode,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
      });
    }
    return yield* parseTailscaleStatus(stdout);
  }).pipe(
    Effect.scoped,
    Effect.timeout(TAILSCALE_STATUS_TIMEOUT),
    Effect.catchTags({
      TimeoutError: (cause) =>
        Effect.fail(
          new TailscaleCommandTimeoutError({
            ...commandContext,
            timeoutMs: Duration.toMillis(TAILSCALE_STATUS_TIMEOUT),
            cause,
          }),
        ),
    }),
  );
});

export function buildTailscaleHttpsBaseUrl(input: {
  readonly magicDnsName: string;
  readonly servePort?: number;
  readonly servePath?: string;
}): string {
  const url = new URL(`https://${input.magicDnsName}`);
  const servePort = input.servePort ?? DEFAULT_TAILSCALE_SERVE_PORT;
  if (servePort !== DEFAULT_TAILSCALE_SERVE_PORT) {
    url.port = String(servePort);
  }
  url.pathname = normalizeServePath(input.servePath);
  return url.toString();
}

function tailnetDnsSuffix(magicDnsName: string): string | null {
  const suffix = magicDnsName.split(".").slice(1).join(".");
  return suffix.length > 0 ? suffix : null;
}

export function buildTailscaleMagicDnsResolutionErrorMessage(input: {
  readonly magicDnsName: string;
}): string {
  const suffix = tailnetDnsSuffix(input.magicDnsName);
  const routeHint =
    suffix === null
      ? "route Tailscale MagicDNS to the Tailscale resolver"
      : `route ~${suffix} to the Tailscale resolver`;
  return `Tailscale MagicDNS name ${input.magicDnsName} does not resolve through this machine's system DNS. Tailscale is running, but the OS resolver is not sending MagicDNS queries to Tailscale. If another VPN or DNS tool is active, such as NordVPN, allow Tailscale split DNS or ${routeHint}, then relaunch.`;
}

export type TailscaleMagicDnsLookup = (hostname: string) => Promise<unknown>;

const defaultTailscaleMagicDnsLookup: TailscaleMagicDnsLookup = (hostname) =>
  NodeDnsPromises.lookup(hostname);

function tailscaleMagicDnsResolutionError(input: {
  readonly magicDnsName: string;
  readonly cause: unknown;
}): TailscaleMagicDnsResolutionError {
  return new TailscaleMagicDnsResolutionError({
    magicDnsName: input.magicDnsName,
    message: buildTailscaleMagicDnsResolutionErrorMessage({
      magicDnsName: input.magicDnsName,
    }),
    cause: input.cause,
  });
}

export async function probeTailscaleMagicDnsResolution(input: {
  readonly magicDnsName: string;
  readonly timeoutMs?: number;
  readonly lookup?: TailscaleMagicDnsLookup;
}): Promise<void> {
  const lookup = input.lookup ?? defaultTailscaleMagicDnsLookup;
  try {
    await Promise.race([
      lookup(input.magicDnsName),
      NodeTimersPromises.setTimeout(
        input.timeoutMs ?? TAILSCALE_MAGIC_DNS_LOOKUP_TIMEOUT_MS,
        undefined,
        {
          ref: false,
        },
      ).then(() => {
        throw tailscaleMagicDnsResolutionError({
          magicDnsName: input.magicDnsName,
          cause: new Error("Tailscale MagicDNS lookup timed out."),
        });
      }),
    ]);
  } catch (cause) {
    if (cause instanceof TailscaleMagicDnsResolutionError) {
      throw cause;
    }
    throw tailscaleMagicDnsResolutionError({
      magicDnsName: input.magicDnsName,
      cause,
    });
  }
}

export const assertTailscaleMagicDnsResolvable = (input: {
  readonly magicDnsName: string;
  readonly timeoutMs?: number;
  readonly lookup?: TailscaleMagicDnsLookup;
}): Effect.Effect<void, TailscaleMagicDnsResolutionError> =>
  Effect.tryPromise({
    try: () => probeTailscaleMagicDnsResolution(input),
    catch: (cause) =>
      cause instanceof TailscaleMagicDnsResolutionError
        ? cause
        : tailscaleMagicDnsResolutionError({
            magicDnsName: input.magicDnsName,
            cause,
          }),
  });

function normalizeServePath(value: string | undefined): string {
  return `${normalizeServePathFlag(value)}/`;
}

function normalizeServePathFlag(value: string | undefined): string {
  return normalizePublicPathPrefix(value) ?? DEFAULT_TAILSCALE_SERVE_PATH;
}

function normalizeServePathKey(value: string | undefined): string {
  return normalizeServePathFlag(value);
}

function joinHttpBasePath(baseUrl: string, pathname: string): string {
  const url = new URL(baseUrl);
  const basePath =
    url.pathname === "/"
      ? ""
      : url.pathname.endsWith("/")
        ? url.pathname.slice(0, -1)
        : url.pathname;
  const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
  url.pathname = basePath.length === 0 ? suffix : `${basePath}${suffix}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

const runTailscaleCommand = (
  args: readonly string[],
  timeoutInput: Duration.Input,
): Effect.Effect<void, TailscaleCommandError, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const hostPlatform = yield* HostProcessPlatform;
    const executable = tailscaleCommandForPlatform(hostPlatform);
    const commandContext = {
      executable,
      subcommand: "serve" as const,
      argumentCount: args.length,
    };
    const timeout = Duration.fromInputUnsafe(timeoutInput);
    return yield* Effect.gen(function* () {
      const child = yield* spawner
        .spawn(ChildProcess.make(executable, args))
        .pipe(
          Effect.mapError((cause) => new TailscaleCommandSpawnError({ ...commandContext, cause })),
        );
      const [stderr, exitCode] = yield* Effect.all(
        [collectStderr(child.stderr), child.exitCode.pipe(Effect.map(Number))],
        { concurrency: "unbounded" },
      ).pipe(
        Effect.mapError((cause) => new TailscaleCommandOutputError({ ...commandContext, cause })),
      );
      if (exitCode !== 0) {
        return yield* new TailscaleCommandExitError({
          ...commandContext,
          exitCode,
          stderrLength: stderr.length,
        });
      }
    }).pipe(
      Effect.scoped,
      Effect.timeout(timeout),
      Effect.catchTags({
        TimeoutError: (cause) =>
          Effect.fail(
            new TailscaleCommandTimeoutError({
              ...commandContext,
              timeoutMs: Duration.toMillis(timeout),
              cause,
            }),
          ),
      }),
    );
  });

export const ensureTailscaleServe = (input: {
  readonly localPort: number;
  readonly servePort?: number;
  readonly localHost?: string;
  readonly servePath?: string;
  readonly localPath?: string;
}): Effect.Effect<void, TailscaleCommandError, ChildProcessSpawner.ChildProcessSpawner> => {
  const servePort = input.servePort ?? DEFAULT_TAILSCALE_SERVE_PORT;
  const localHost = input.localHost ?? "127.0.0.1";
  const servePath = normalizeServePathFlag(input.servePath);
  const localPath = input.localPath ? normalizeServePathFlag(input.localPath) : "";
  const args = [
    "serve",
    "--bg",
    `--https=${servePort}`,
    `--set-path=${servePath}`,
    `http://${localHost}:${input.localPort}${localPath}`,
  ];
  return runTailscaleCommand(args, TAILSCALE_SERVE_TIMEOUT);
};

export const disableTailscaleServe = (
  input: {
    readonly servePort?: number;
    readonly servePath?: string;
  } = {},
): Effect.Effect<void, TailscaleCommandError, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function* () {
    const servePort = input.servePort ?? DEFAULT_TAILSCALE_SERVE_PORT;
    const servePath = normalizeServePathFlag(input.servePath);
    return yield* runTailscaleCommand(
      ["serve", `--https=${servePort}`, `--set-path=${servePath}`, "off"],
      TAILSCALE_SERVE_TIMEOUT,
    );
  });

export const disableTailscaleServeIfOwned = (input: {
  readonly servePort?: number;
  readonly servePath?: string;
  readonly localPort: number;
  readonly localHost?: string;
  readonly localPath?: string;
}): Effect.Effect<
  TailscaleServeOwnedRouteDisableResult,
  TailscaleCommandError | TailscaleServeStatusParseError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const routeStatus = yield* readTailscaleServeRouteStatus(input);
    if (!routeStatus.configured) {
      return {
        disabled: false,
        existingProxyUrl: routeStatus.proxyUrl,
      };
    }

    yield* disableTailscaleServe({
      ...(input.servePort === undefined ? {} : { servePort: input.servePort }),
      ...(input.servePath === undefined ? {} : { servePath: input.servePath }),
    });

    return {
      disabled: true,
      existingProxyUrl: routeStatus.proxyUrl,
    };
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseTailscaleStatusJson(rawStatusJson: string): unknown {
  return decodeUnknownJson(rawStatusJson);
}

function findTailscaleServePathProxyUrlFromUnknown(
  parsed: unknown,
  input: {
    readonly servePort?: number;
    readonly servePath?: string;
  },
): string | null {
  if (!isRecord(parsed) || !isRecord(parsed.Web)) {
    return null;
  }

  const servePort = input.servePort ?? DEFAULT_TAILSCALE_SERVE_PORT;
  const servePath = normalizeServePathKey(input.servePath);

  for (const [hostPort, webEntry] of Object.entries(parsed.Web)) {
    if (!hostPort.endsWith(`:${servePort}`) || !isRecord(webEntry)) {
      continue;
    }

    const handlers = webEntry.Handlers;
    if (!isRecord(handlers)) {
      continue;
    }

    const handler = handlers[servePath];
    if (!isRecord(handler) || typeof handler.Proxy !== "string") {
      continue;
    }

    return handler.Proxy;
  }

  return null;
}

function parseTailscaleServeRouteStatusFromUnknown(
  parsed: unknown,
  input: {
    readonly servePort?: number;
    readonly servePath?: string;
    readonly localPort?: number;
    readonly localHost?: string;
    readonly localPath?: string;
  } = {},
): TailscaleServeRouteStatus {
  const localPath = input.localPath ? normalizeServePathFlag(input.localPath) : "";
  const expectedProxyUrl =
    input.localPort === undefined
      ? null
      : `http://${input.localHost ?? "127.0.0.1"}:${input.localPort}${localPath}`;
  const proxyUrl = findTailscaleServePathProxyUrlFromUnknown(parsed, input);

  if (proxyUrl === null) {
    return { configured: false, proxyUrl: null };
  }

  return {
    configured: expectedProxyUrl === null || proxyUrl === expectedProxyUrl,
    proxyUrl,
  };
}

export function parseTailscaleServeRouteStatus(
  rawStatusJson: string,
  input: {
    readonly servePort?: number;
    readonly servePath?: string;
    readonly localPort?: number;
    readonly localHost?: string;
    readonly localPath?: string;
  } = {},
): Effect.Effect<TailscaleServeRouteStatus, TailscaleServeStatusParseError> {
  return Effect.try({
    try: () =>
      parseTailscaleServeRouteStatusFromUnknown(parseTailscaleStatusJson(rawStatusJson), input),
    catch: (cause) => new TailscaleServeStatusParseError({ cause }),
  });
}

export function parseTailscaleServePathProxyUrl(
  rawStatusJson: string,
  input: {
    readonly servePort?: number;
    readonly servePath?: string;
  },
): Effect.Effect<string | null, TailscaleServeStatusParseError> {
  return Effect.try({
    try: () =>
      findTailscaleServePathProxyUrlFromUnknown(parseTailscaleStatusJson(rawStatusJson), input),
    catch: (cause) => new TailscaleServeStatusParseError({ cause }),
  });
}

export const readTailscaleServeRouteStatus = (input: {
  readonly servePort?: number;
  readonly servePath?: string;
  readonly localPort?: number;
  readonly localHost?: string;
  readonly localPath?: string;
}): Effect.Effect<
  TailscaleServeRouteStatus,
  TailscaleCommandError | TailscaleServeStatusParseError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const args = ["serve", "status", "--json"];
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const hostPlatform = yield* HostProcessPlatform;
    const executable = tailscaleCommandForPlatform(hostPlatform);
    const commandContext = {
      executable,
      subcommand: "serve" as const,
      argumentCount: args.length,
    };
    const child = yield* spawner.spawn(ChildProcess.make(executable, args)).pipe(
      Effect.mapError(
        (cause) =>
          new TailscaleCommandSpawnError({
            ...commandContext,
            cause,
          }),
      ),
    );
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        collectStdout(child.stdout),
        collectStderr(child.stderr),
        child.exitCode.pipe(Effect.map(Number)),
      ],
      { concurrency: "unbounded" },
    ).pipe(
      Effect.mapError(
        (cause) =>
          new TailscaleCommandOutputError({
            ...commandContext,
            cause,
          }),
      ),
    );
    if (exitCode !== 0) {
      return yield* new TailscaleCommandExitError({
        ...commandContext,
        exitCode,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
      });
    }
    return yield* parseTailscaleServeRouteStatus(stdout, input);
  }).pipe(
    Effect.scoped,
    Effect.timeout(TAILSCALE_STATUS_TIMEOUT),
    Effect.catchTags({
      TimeoutError: (cause) =>
        Effect.gen(function* () {
          const hostPlatform = yield* HostProcessPlatform;
          return yield* new TailscaleCommandTimeoutError({
            executable: tailscaleCommandForPlatform(hostPlatform),
            subcommand: "serve",
            argumentCount: 3,
            timeoutMs: Duration.toMillis(TAILSCALE_STATUS_TIMEOUT),
            cause,
          });
        }),
    }),
  );

function buildExpectedProxyUrl(input: {
  readonly localPort: number;
  readonly localHost?: string;
  readonly localPath?: string;
}): string {
  const localPath = input.localPath ? normalizeServePathFlag(input.localPath) : "";
  return `http://${input.localHost ?? "127.0.0.1"}:${input.localPort}${localPath}`;
}

function routeAvailabilityFromStatus(input: {
  readonly servePort: number;
  readonly servePath: string;
  readonly expectedProxyUrl: string;
  readonly routeStatus: TailscaleServeRouteStatus;
}): TailscaleServeRouteAvailability {
  const existingProxyUrl = input.routeStatus.proxyUrl;
  if (existingProxyUrl === null) {
    return {
      status: "available",
      available: true,
      owned: false,
      conflict: false,
      servePath: input.servePath,
      servePort: input.servePort,
      expectedProxyUrl: input.expectedProxyUrl,
      existingProxyUrl,
    };
  }

  if (existingProxyUrl === input.expectedProxyUrl) {
    return {
      status: "owned",
      available: false,
      owned: true,
      conflict: false,
      servePath: input.servePath,
      servePort: input.servePort,
      expectedProxyUrl: input.expectedProxyUrl,
      existingProxyUrl,
    };
  }

  return {
    status: "conflict",
    available: false,
    owned: false,
    conflict: true,
    servePath: input.servePath,
    servePort: input.servePort,
    expectedProxyUrl: input.expectedProxyUrl,
    existingProxyUrl,
  };
}

export const readTailscaleServeRouteAvailability = (input: {
  readonly servePort?: number;
  readonly servePath?: string;
  readonly localPort: number;
  readonly localHost?: string;
  readonly localPath?: string;
}): Effect.Effect<
  TailscaleServeRouteAvailability,
  TailscaleCommandError | TailscaleServeStatusParseError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const servePort = input.servePort ?? DEFAULT_TAILSCALE_SERVE_PORT;
    const servePath = normalizeServePathKey(input.servePath);
    const expectedProxyUrl = buildExpectedProxyUrl(input);
    const routeStatus = yield* readTailscaleServeRouteStatus({
      servePort,
      servePath,
      localPort: input.localPort,
      ...(input.localHost ? { localHost: input.localHost } : {}),
      ...(input.localPath ? { localPath: input.localPath } : {}),
    });

    return routeAvailabilityFromStatus({
      servePort,
      servePath,
      expectedProxyUrl,
      routeStatus,
    });
  });

export const assertTailscaleServePathAvailable = (input: {
  readonly servePort?: number;
  readonly servePath?: string;
  readonly localPort: number;
  readonly localHost?: string;
  readonly localPath?: string;
}): Effect.Effect<
  void,
  TailscaleCommandError | TailscaleServeStatusParseError | TailscaleServePathConflictError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.gen(function* () {
    const availability = yield* readTailscaleServeRouteAvailability(input);

    if (availability.conflict && availability.existingProxyUrl !== null) {
      return yield* new TailscaleServePathConflictError({
        servePath: availability.servePath,
        servePort: availability.servePort,
        existingProxyUrl: availability.existingProxyUrl,
        expectedProxyUrl: availability.expectedProxyUrl,
      });
    }
  });

export const probeTailscaleHttpsEndpoint = (input: {
  readonly baseUrl: string;
  readonly timeout?: Duration.Input;
}): Effect.Effect<boolean, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const response = yield* Effect.gen(function* () {
      const request = HttpClientRequest.get(
        joinHttpBasePath(input.baseUrl, "/.well-known/t3/environment"),
      );
      return yield* client.execute(request);
    }).pipe(Effect.timeoutOption(input.timeout ?? TAILSCALE_PROBE_TIMEOUT));

    return Option.match(response, {
      onNone: () => false,
      onSome: (httpResponse) => httpResponse.status >= 200 && httpResponse.status < 300,
    });
  }).pipe(Effect.orElseSucceed(() => false));

export const resolveTailscaleHttpsBaseUrl = (
  input: {
    readonly servePort?: number;
    readonly servePath?: string;
  } = {},
): Effect.Effect<
  string | null,
  TailscaleCommandError | TailscaleStatusParseError,
  ChildProcessSpawner.ChildProcessSpawner
> =>
  readTailscaleStatus.pipe(
    Effect.map((status) =>
      status.magicDnsName
        ? buildTailscaleHttpsBaseUrl({
            magicDnsName: status.magicDnsName,
            ...(input.servePort === undefined ? {} : { servePort: input.servePort }),
            ...(input.servePath === undefined ? {} : { servePath: input.servePath }),
          })
        : null,
    ),
  );
