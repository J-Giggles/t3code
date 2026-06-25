#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - This script is a small Docker CLI wrapper.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

export const LOCAL_OBSERVABILITY_NETWORK = "t3code-observability";
export const LOCAL_OBSERVABILITY_LGTM_CONTAINER = "t3code-otel-lgtm";
export const LOCAL_OBSERVABILITY_COLLECTOR_CONTAINER = "t3code-otel-collector";
export const LOCAL_OBSERVABILITY_GRAFANA_URL = "http://127.0.0.1:3030";
export const LOCAL_OBSERVABILITY_OTLP_HTTP_URL = "http://127.0.0.1:4318";
export const LOCAL_OBSERVABILITY_OTLP_GRPC_URL = "http://127.0.0.1:4317";
export const LOCAL_OBSERVABILITY_LOKI_URL = "http://127.0.0.1:3100";
export const LOCAL_OBSERVABILITY_TEMPO_URL = "http://127.0.0.1:3200";
export const LOCAL_OBSERVABILITY_PROMETHEUS_URL = "http://127.0.0.1:9090";
export const DEFAULT_LOCAL_OBSERVABILITY_DOCKER_TIMEOUT_MS = 30_000;

export interface LocalObservabilityUrls {
  readonly grafanaUrl: string;
  readonly otlpHttpUrl: string;
  readonly otlpGrpcUrl: string;
  readonly tracesUrl: string;
  readonly metricsUrl: string;
  readonly logsUrl: string;
  readonly lokiUrl: string;
  readonly tempoUrl: string;
  readonly prometheusUrl: string;
}

export const LOCAL_OBSERVABILITY_URLS: LocalObservabilityUrls = {
  grafanaUrl: LOCAL_OBSERVABILITY_GRAFANA_URL,
  otlpHttpUrl: LOCAL_OBSERVABILITY_OTLP_HTTP_URL,
  otlpGrpcUrl: LOCAL_OBSERVABILITY_OTLP_GRPC_URL,
  tracesUrl: `${LOCAL_OBSERVABILITY_OTLP_HTTP_URL}/v1/traces`,
  metricsUrl: `${LOCAL_OBSERVABILITY_OTLP_HTTP_URL}/v1/metrics`,
  logsUrl: `${LOCAL_OBSERVABILITY_OTLP_HTTP_URL}/v1/logs`,
  lokiUrl: LOCAL_OBSERVABILITY_LOKI_URL,
  tempoUrl: LOCAL_OBSERVABILITY_TEMPO_URL,
  prometheusUrl: LOCAL_OBSERVABILITY_PROMETHEUS_URL,
};

export interface LocalObservabilityCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: unknown;
}

export type LocalObservabilityDockerRunner = (
  args: ReadonlyArray<string>,
) => LocalObservabilityCommandResult;

export interface LocalObservabilityStartResult {
  readonly ok: boolean;
  readonly disabled: boolean;
  readonly dockerAvailable: boolean;
  readonly warnings: ReadonlyArray<string>;
  readonly urls: LocalObservabilityUrls;
}

export interface LocalObservabilityStatus {
  readonly disabled: boolean;
  readonly dockerAvailable: boolean;
  readonly lgtmRunning: boolean;
  readonly collectorRunning: boolean;
  readonly urls: LocalObservabilityUrls;
  readonly warnings: ReadonlyArray<string>;
}

export const defaultLocalObservabilityConfigPath = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../infra/local-observability/otel-collector.yaml",
);
export const defaultLocalObservabilityGrafanaProvisioningPath = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../infra/local-observability/grafana/provisioning",
);
export const defaultLocalObservabilityGrafanaDashboardsPath = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../infra/local-observability/grafana/dashboards",
);

function trimOutput(value: string): string {
  return value.trim();
}

function docker(args: ReadonlyArray<string>): LocalObservabilityCommandResult {
  const configuredTimeout = Number.parseInt(
    process.env.T3CODE_LOCAL_OBSERVABILITY_DOCKER_TIMEOUT_MS ?? "",
    10,
  );
  const timeout =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : DEFAULT_LOCAL_OBSERVABILITY_DOCKER_TIMEOUT_MS;
  const result = NodeChildProcess.spawnSync("docker", [...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error === undefined ? {} : { error: result.error }),
  };
}

function successful(result: LocalObservabilityCommandResult): boolean {
  return result.status === 0;
}

function commandDetail(result: LocalObservabilityCommandResult): string {
  const detail = trimOutput(result.stderr) || trimOutput(result.stdout);
  if (detail) return detail;
  if (result.error instanceof Error) return result.error.message;
  return "command failed";
}

export function isLocalObservabilityDisabled(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  const value = env.T3CODE_LOCAL_OBSERVABILITY?.trim().toLowerCase();
  return value === "0" || value === "false" || value === "no" || value === "off";
}

export function createLocalObservabilityEnvPatch(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  if (isLocalObservabilityDisabled(env)) {
    return {};
  }

  return {
    T3CODE_OTLP_TRACES_URL: env.T3CODE_OTLP_TRACES_URL ?? LOCAL_OBSERVABILITY_URLS.tracesUrl,
    T3CODE_OTLP_METRICS_URL: env.T3CODE_OTLP_METRICS_URL ?? LOCAL_OBSERVABILITY_URLS.metricsUrl,
    T3CODE_OTLP_LOGS_URL: env.T3CODE_OTLP_LOGS_URL ?? LOCAL_OBSERVABILITY_URLS.logsUrl,
    T3CODE_OBSERVABILITY_GRAFANA_URL:
      env.T3CODE_OBSERVABILITY_GRAFANA_URL ?? LOCAL_OBSERVABILITY_URLS.grafanaUrl,
    T3CODE_OBSERVABILITY_LOKI_URL:
      env.T3CODE_OBSERVABILITY_LOKI_URL ?? LOCAL_OBSERVABILITY_URLS.lokiUrl,
    T3CODE_OBSERVABILITY_TEMPO_URL:
      env.T3CODE_OBSERVABILITY_TEMPO_URL ?? LOCAL_OBSERVABILITY_URLS.tempoUrl,
    T3CODE_OBSERVABILITY_PROMETHEUS_URL:
      env.T3CODE_OBSERVABILITY_PROMETHEUS_URL ?? LOCAL_OBSERVABILITY_URLS.prometheusUrl,
    T3CODE_RELAY_CLIENT_OTLP_TRACES_URL:
      env.T3CODE_RELAY_CLIENT_OTLP_TRACES_URL ?? LOCAL_OBSERVABILITY_URLS.tracesUrl,
    VITE_RELAY_OTLP_TRACES_URL:
      env.VITE_RELAY_OTLP_TRACES_URL ??
      env.T3CODE_RELAY_CLIENT_OTLP_TRACES_URL ??
      LOCAL_OBSERVABILITY_URLS.tracesUrl,
    EXPO_PUBLIC_OTLP_TRACES_URL:
      env.EXPO_PUBLIC_OTLP_TRACES_URL ??
      env.T3CODE_RELAY_CLIENT_OTLP_TRACES_URL ??
      LOCAL_OBSERVABILITY_URLS.tracesUrl,
  };
}

function inspectContainerRunning(
  containerName: string,
  runner: LocalObservabilityDockerRunner,
): boolean {
  const result = runner(["inspect", "-f", "{{.State.Running}}", containerName]);
  return successful(result) && trimOutput(result.stdout) === "true";
}

function inspectContainerExists(
  containerName: string,
  runner: LocalObservabilityDockerRunner,
): boolean {
  return successful(runner(["inspect", containerName]));
}

function ensureContainerStarted(
  containerName: string,
  runner: LocalObservabilityDockerRunner,
  warnings: Array<string>,
) {
  if (inspectContainerRunning(containerName, runner)) {
    return;
  }
  if (!inspectContainerExists(containerName, runner)) {
    return;
  }
  const result = runner(["start", containerName]);
  if (!successful(result)) {
    warnings.push(`Failed to start ${containerName}: ${commandDetail(result)}`);
  }
}

function ensureNetwork(runner: LocalObservabilityDockerRunner, warnings: Array<string>) {
  if (successful(runner(["network", "inspect", LOCAL_OBSERVABILITY_NETWORK]))) {
    return;
  }
  const result = runner(["network", "create", LOCAL_OBSERVABILITY_NETWORK]);
  if (!successful(result)) {
    warnings.push(
      `Failed to create Docker network ${LOCAL_OBSERVABILITY_NETWORK}: ${commandDetail(result)}`,
    );
  }
}

function ensureLgtmContainer(
  runner: LocalObservabilityDockerRunner,
  warnings: Array<string>,
  env: Readonly<Record<string, string | undefined>>,
) {
  ensureContainerStarted(LOCAL_OBSERVABILITY_LGTM_CONTAINER, runner, warnings);
  if (inspectContainerRunning(LOCAL_OBSERVABILITY_LGTM_CONTAINER, runner)) {
    return;
  }

  const image = env.T3CODE_OBSERVABILITY_LGTM_IMAGE?.trim() || "grafana/otel-lgtm:latest";
  const result = runner([
    "run",
    "-d",
    "--name",
    LOCAL_OBSERVABILITY_LGTM_CONTAINER,
    "--network",
    LOCAL_OBSERVABILITY_NETWORK,
    "-p",
    "127.0.0.1:3030:3000",
    "-p",
    "127.0.0.1:3100:3100",
    "-p",
    "127.0.0.1:3200:3200",
    "-p",
    "127.0.0.1:9090:9090",
    "-e",
    "GF_AUTH_ANONYMOUS_ENABLED=true",
    "-e",
    "GF_AUTH_ANONYMOUS_ORG_ROLE=Admin",
    "-e",
    "GF_PATHS_PROVISIONING=/etc/grafana/provisioning",
    "-v",
    `${defaultLocalObservabilityGrafanaProvisioningPath}:/etc/grafana/provisioning:ro`,
    "-v",
    `${defaultLocalObservabilityGrafanaDashboardsPath}:/var/lib/grafana/dashboards/t3code:ro`,
    "--pull",
    "missing",
    image,
  ]);
  if (!successful(result)) {
    warnings.push(
      `Failed to start ${LOCAL_OBSERVABILITY_LGTM_CONTAINER}: ${commandDetail(result)}`,
    );
  }
}

function ensureCollectorContainer(
  runner: LocalObservabilityDockerRunner,
  warnings: Array<string>,
  env: Readonly<Record<string, string | undefined>>,
  configPath: string,
) {
  ensureContainerStarted(LOCAL_OBSERVABILITY_COLLECTOR_CONTAINER, runner, warnings);
  if (inspectContainerRunning(LOCAL_OBSERVABILITY_COLLECTOR_CONTAINER, runner)) {
    return;
  }

  const image =
    env.T3CODE_OBSERVABILITY_COLLECTOR_IMAGE?.trim() ||
    "otel/opentelemetry-collector-contrib:latest";
  const result = runner([
    "run",
    "-d",
    "--name",
    LOCAL_OBSERVABILITY_COLLECTOR_CONTAINER,
    "--network",
    LOCAL_OBSERVABILITY_NETWORK,
    "-p",
    "127.0.0.1:4317:4317",
    "-p",
    "127.0.0.1:4318:4318",
    "-v",
    `${configPath}:/etc/otelcol-contrib/config.yaml:ro`,
    "--pull",
    "missing",
    image,
    "--config=/etc/otelcol-contrib/config.yaml",
  ]);
  if (!successful(result)) {
    warnings.push(
      `Failed to start ${LOCAL_OBSERVABILITY_COLLECTOR_CONTAINER}: ${commandDetail(result)}`,
    );
  }
}

export function startLocalObservability(
  options: {
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly runner?: LocalObservabilityDockerRunner;
    readonly configPath?: string;
  } = {},
): LocalObservabilityStartResult {
  const env = options.env ?? process.env;
  const runner = options.runner ?? docker;
  const configPath = options.configPath ?? defaultLocalObservabilityConfigPath;
  const warnings: Array<string> = [];

  if (isLocalObservabilityDisabled(env)) {
    return {
      ok: true,
      disabled: true,
      dockerAvailable: false,
      warnings,
      urls: LOCAL_OBSERVABILITY_URLS,
    };
  }

  const dockerVersion = runner(["version", "--format", "{{.Server.Version}}"]);
  if (!successful(dockerVersion)) {
    warnings.push(
      `Docker is unavailable; local observability was not started: ${commandDetail(dockerVersion)}`,
    );
    return {
      ok: false,
      disabled: false,
      dockerAvailable: false,
      warnings,
      urls: LOCAL_OBSERVABILITY_URLS,
    };
  }

  ensureNetwork(runner, warnings);
  ensureLgtmContainer(runner, warnings, env);
  ensureCollectorContainer(runner, warnings, env, configPath);

  return {
    ok: warnings.length === 0,
    disabled: false,
    dockerAvailable: true,
    warnings,
    urls: LOCAL_OBSERVABILITY_URLS,
  };
}

export function getLocalObservabilityStatus(
  options: {
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly runner?: LocalObservabilityDockerRunner;
  } = {},
): LocalObservabilityStatus {
  const env = options.env ?? process.env;
  const runner = options.runner ?? docker;
  const warnings: Array<string> = [];
  const disabled = isLocalObservabilityDisabled(env);
  const dockerVersion = runner(["version", "--format", "{{.Server.Version}}"]);
  const dockerAvailable = successful(dockerVersion);
  if (!disabled && !dockerAvailable) {
    warnings.push(`Docker is unavailable: ${commandDetail(dockerVersion)}`);
  }

  return {
    disabled,
    dockerAvailable,
    lgtmRunning: dockerAvailable
      ? inspectContainerRunning(LOCAL_OBSERVABILITY_LGTM_CONTAINER, runner)
      : false,
    collectorRunning: dockerAvailable
      ? inspectContainerRunning(LOCAL_OBSERVABILITY_COLLECTOR_CONTAINER, runner)
      : false,
    urls: LOCAL_OBSERVABILITY_URLS,
    warnings,
  };
}

function printUrls(urls: LocalObservabilityUrls) {
  console.log(`Grafana: ${urls.grafanaUrl}`);
  console.log(`OTLP HTTP: ${urls.otlpHttpUrl}`);
  console.log(`OTLP traces: ${urls.tracesUrl}`);
  console.log(`OTLP metrics: ${urls.metricsUrl}`);
  console.log(`OTLP logs: ${urls.logsUrl}`);
}

function runCli() {
  const command = process.argv[2] ?? "start";
  if (command === "status") {
    console.log(JSON.stringify(getLocalObservabilityStatus(), null, 2));
    return;
  }
  if (command === "urls") {
    printUrls(LOCAL_OBSERVABILITY_URLS);
    return;
  }
  if (command !== "start") {
    console.error(`Unknown local observability command: ${command}`);
    process.exitCode = 2;
    return;
  }

  const result = startLocalObservability();
  for (const warning of result.warnings) {
    console.warn(`[local-observability] ${warning}`);
  }
  if (!result.disabled) {
    printUrls(result.urls);
  }
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  runCli();
}
