#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - This is a small read-only local observability CLI.
import * as NodeHttp from "node:http";
import * as NodeHttps from "node:https";

import * as DateTime from "effect/DateTime";

import { LOCAL_OBSERVABILITY_URLS } from "./local-observability.ts";

type Labels = Readonly<Record<string, string>>;

interface LokiVectorResult {
  readonly metric: Labels;
  readonly value: readonly [number, string];
}

interface LokiStreamResult {
  readonly stream: Labels;
  readonly values: ReadonlyArray<readonly [string, string]>;
}

interface PrometheusSeriesResult {
  readonly metric?: Labels;
  readonly value?: readonly [number, string];
  readonly [key: string]: unknown;
}

interface TempoTrace {
  readonly traceID?: string;
  readonly rootServiceName?: string;
  readonly rootTraceName?: string;
  readonly durationMs?: number;
  readonly startTimeUnixNano?: string;
}

interface ObservabilityDigest {
  readonly generatedAt: string;
  readonly urls: typeof LOCAL_OBSERVABILITY_URLS;
  readonly warnings: ReadonlyArray<string>;
  readonly logServices: ReadonlyArray<string>;
  readonly logCounts: ReadonlyArray<LokiVectorResult>;
  readonly issueCounts: ReadonlyArray<LokiVectorResult>;
  readonly recentIssues: ReadonlyArray<LokiStreamResult>;
  readonly metricSeries: {
    readonly total: number;
    readonly withWorktreeRole: number;
    readonly withoutWorktreeRole: number;
  };
  readonly rpcTotals: ReadonlyArray<PrometheusSeriesResult>;
  readonly gitTotals: ReadonlyArray<PrometheusSeriesResult>;
  readonly recentTraces: ReadonlyArray<TempoTrace>;
  readonly identityMismatches: ReadonlyArray<string>;
}

const ISSUE_PATTERN = "(?i)(error|warn|failed|failure|exception|rejected|crash|EPIPE)";
const LOCAL_QUERY_TIMEOUT_MS = 1_500;
const OBSERVABILITY_MATCHERS = [
  "t3_rpc_requests_total",
  "t3_git_commands_total",
  "t3_rpc_request_duration_milliseconds_count",
];

function urlWithParams(
  base: string,
  params: Readonly<Record<string, string | ReadonlyArray<string>>>,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      url.searchParams.set(key, value);
      continue;
    }
    for (const item of value) {
      url.searchParams.append(key, item);
    }
  }
  return url.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? NodeHttps : NodeHttp;
    const request = client.request(
      parsed,
      {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      },
      (response) => {
        const chunks: Array<Buffer> = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const statusCode = response.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`HTTP ${statusCode}`));
            return;
          }
          resolve(body);
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(LOCAL_QUERY_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timed out after ${LOCAL_QUERY_TIMEOUT_MS}ms`));
    });
    request.end();
  });
}

function prometheusData<T>(payload: unknown): T {
  const candidate = payload as { readonly status?: string; readonly data?: T };
  if (candidate.status !== "success" || candidate.data === undefined) {
    throw new Error("Prometheus query failed");
  }
  return candidate.data;
}

function lokiData<T>(payload: unknown): T {
  const candidate = payload as { readonly status?: string; readonly data?: T };
  if (candidate.status !== "success" || candidate.data === undefined) {
    throw new Error("Loki query failed");
  }
  return candidate.data;
}

async function fetchLokiLabelValues(label: string): Promise<ReadonlyArray<string>> {
  const payload = await fetchJson<unknown>(
    `${LOCAL_OBSERVABILITY_URLS.lokiUrl}/loki/api/v1/label/${label}/values`,
  );
  return lokiData<ReadonlyArray<string>>(payload);
}

async function fetchLokiInstantVector(query: string): Promise<ReadonlyArray<LokiVectorResult>> {
  const payload = await fetchJson<unknown>(
    urlWithParams(`${LOCAL_OBSERVABILITY_URLS.lokiUrl}/loki/api/v1/query`, { query }),
  );
  return lokiData<{ readonly result?: ReadonlyArray<LokiVectorResult> }>(payload).result ?? [];
}

async function fetchLokiRange(
  query: string,
  limit: number,
): Promise<ReadonlyArray<LokiStreamResult>> {
  const payload = await fetchJson<unknown>(
    urlWithParams(`${LOCAL_OBSERVABILITY_URLS.lokiUrl}/loki/api/v1/query_range`, {
      query,
      limit: String(limit),
      direction: "BACKWARD",
    }),
  );
  return lokiData<{ readonly result?: ReadonlyArray<LokiStreamResult> }>(payload).result ?? [];
}

async function fetchPrometheusVector(
  query: string,
): Promise<ReadonlyArray<PrometheusSeriesResult>> {
  const payload = await fetchJson<unknown>(
    urlWithParams(`${LOCAL_OBSERVABILITY_URLS.prometheusUrl}/api/v1/query`, { query }),
  );
  return (
    prometheusData<{ readonly result?: ReadonlyArray<PrometheusSeriesResult> }>(payload).result ??
    []
  );
}

async function fetchPrometheusSeries(
  matchers: ReadonlyArray<string>,
): Promise<ReadonlyArray<PrometheusSeriesResult>> {
  const payload = await fetchJson<unknown>(
    urlWithParams(`${LOCAL_OBSERVABILITY_URLS.prometheusUrl}/api/v1/series`, {
      "match[]": matchers,
    }),
  );
  return prometheusData<ReadonlyArray<PrometheusSeriesResult>>(payload);
}

async function fetchTempoTraces(): Promise<ReadonlyArray<TempoTrace>> {
  const payload = await fetchJson<{ readonly traces?: ReadonlyArray<TempoTrace> }>(
    urlWithParams(`${LOCAL_OBSERVABILITY_URLS.tempoUrl}/api/search`, {
      tags: "service.name=t3-server",
      limit: "10",
    }),
  );
  return payload.traces ?? [];
}

export function findWorktreeIdentityMismatches(
  logCounts: ReadonlyArray<LokiVectorResult>,
): ReadonlyArray<string> {
  const mismatches = new Set<string>();
  for (const result of logCounts) {
    const role = result.metric.t3_worktree_role;
    const branch = result.metric.t3_git_branch;
    const instance = result.metric.t3_dev_instance;
    if (role === "main" && (branch === "staging" || instance === "staging")) {
      mismatches.add(
        `Telemetry is labelled role=main but branch/instance is staging (${result.metric.service_name ?? "unknown service"}). Relaunch with corrected dev-runner identity env.`,
      );
    }
    if (role === "staging" && branch === "main") {
      mismatches.add(
        `Telemetry is labelled role=staging but branch=main (${result.metric.service_name ?? "unknown service"}). Check launcher env inheritance.`,
      );
    }
  }
  return [...mismatches];
}

export function summarizeMetricSeries(
  series: ReadonlyArray<PrometheusSeriesResult>,
): ObservabilityDigest["metricSeries"] {
  const withWorktreeRole = series.filter(
    (entry) => typeof entry.t3_worktree_role === "string",
  ).length;
  return {
    total: series.length,
    withWorktreeRole,
    withoutWorktreeRole: series.length - withWorktreeRole,
  };
}

function formatMetricLabels(labels: Labels | undefined): string {
  if (!labels) return "(no labels)";
  return Object.entries(labels)
    .filter(([key]) => key !== "__name__" && key !== "job" && key !== "service_version")
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function formatValue(result: PrometheusSeriesResult | LokiVectorResult): string {
  const value = Array.isArray(result.value) ? result.value[1] : undefined;
  if (value === undefined) return "";
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? String(Math.round(numberValue * 100) / 100) : value;
}

function formatLogLine(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join(" ");
    }
  } catch {
    return raw;
  }
  return raw;
}

export async function collectObservabilityDigest(): Promise<ObservabilityDigest> {
  const warnings: Array<string> = [];
  const safe = async <T>(label: string, effect: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await effect;
    } catch (error) {
      warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return fallback;
    }
  };

  const [
    logServices,
    logCounts,
    issueCounts,
    recentIssues,
    metricSeriesEntries,
    rpcTotals,
    gitTotals,
    recentTraces,
  ] = await Promise.all([
    safe("loki service labels", fetchLokiLabelValues("service_name"), []),
    safe(
      "loki log counts",
      fetchLokiInstantVector(
        'sum by (t3_worktree_role, t3_git_branch, t3_dev_instance, service_name, severity_text) (count_over_time({service_name=~".+"}[2h]))',
      ),
      [],
    ),
    safe(
      "loki issue counts",
      fetchLokiInstantVector(
        `sum by (t3_worktree_role, t3_git_branch, service_name, severity_text) (count_over_time({service_name=~".+"} |~ \`${ISSUE_PATTERN}\` [2h]))`,
      ),
      [],
    ),
    safe(
      "loki recent issues",
      fetchLokiRange(`{service_name=~".+"} |~ \`${ISSUE_PATTERN}\``, 10),
      [],
    ),
    safe("prometheus series", fetchPrometheusSeries(OBSERVABILITY_MATCHERS), []),
    safe(
      "prometheus rpc totals",
      fetchPrometheusVector(
        "topk(10, sum by (t3_worktree_role, t3_git_branch, t3_dev_instance, service_name, method, outcome) (t3_rpc_requests_total))",
      ),
      [],
    ),
    safe(
      "prometheus git totals",
      fetchPrometheusVector(
        "topk(10, sum by (t3_worktree_role, t3_git_branch, t3_dev_instance, service_name, operation, outcome) (t3_git_commands_total))",
      ),
      [],
    ),
    safe("tempo traces", fetchTempoTraces(), []),
  ]);

  const metricSeries = summarizeMetricSeries(metricSeriesEntries);
  const identityMismatches = findWorktreeIdentityMismatches(logCounts);
  if (metricSeries.total > 0 && metricSeries.withoutWorktreeRole > 0) {
    warnings.push(
      `Prometheus metric series missing t3_worktree_role: ${metricSeries.withoutWorktreeRole}/${metricSeries.total}.`,
    );
  }

  return {
    generatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    urls: LOCAL_OBSERVABILITY_URLS,
    warnings,
    logServices,
    logCounts,
    issueCounts,
    recentIssues,
    metricSeries,
    rpcTotals,
    gitTotals,
    recentTraces,
    identityMismatches,
  };
}

function printDigest(digest: ObservabilityDigest) {
  console.log("T3 Code Observability Digest");
  console.log(`Generated: ${digest.generatedAt}`);
  console.log(`Grafana: ${digest.urls.grafanaUrl}`);
  console.log("");

  console.log("Signals");
  console.log(
    `- Log services: ${digest.logServices.length > 0 ? digest.logServices.join(", ") : "none"}`,
  );
  console.log(
    `- Metric worktree coverage: ${digest.metricSeries.withWorktreeRole}/${digest.metricSeries.total} series include t3_worktree_role`,
  );
  console.log(`- Recent traces sampled: ${digest.recentTraces.length}`);
  console.log("");

  if (digest.identityMismatches.length > 0) {
    console.log("Identity Issues");
    for (const issue of digest.identityMismatches) {
      console.log(`- ${issue}`);
    }
    console.log("");
  }

  if (digest.warnings.length > 0) {
    console.log("Digest Warnings");
    for (const warning of digest.warnings) {
      console.log(`- ${warning}`);
    }
    console.log("");
  }

  console.log("Issue Counts");
  if (digest.issueCounts.length === 0) {
    console.log("- No error/warn/failure-like logs found in the query window.");
  } else {
    for (const result of digest.issueCounts) {
      console.log(`- ${formatMetricLabels(result.metric)} => ${formatValue(result)}`);
    }
  }
  console.log("");

  console.log("Recent Issue Samples");
  const samples = digest.recentIssues.flatMap((stream) =>
    stream.values.map(([timestamp, line]) => ({ stream: stream.stream, timestamp, line })),
  );
  if (samples.length === 0) {
    console.log("- No recent issue samples.");
  } else {
    for (const sample of samples.slice(0, 8)) {
      console.log(
        `- ${sample.stream.service_name ?? "unknown"} ${sample.stream.severity_text ?? ""} trace=${sample.stream.trace_id ?? "none"} ${formatLogLine(sample.line)}`,
      );
    }
  }
  console.log("");

  console.log("Top RPC Totals");
  if (digest.rpcTotals.length === 0) {
    console.log("- No RPC counters found.");
  } else {
    for (const result of digest.rpcTotals) {
      console.log(`- ${formatMetricLabels(result.metric)} => ${formatValue(result)}`);
    }
  }
  console.log("");

  console.log("Top Git Totals");
  if (digest.gitTotals.length === 0) {
    console.log("- No git counters found.");
  } else {
    for (const result of digest.gitTotals) {
      console.log(`- ${formatMetricLabels(result.metric)} => ${formatValue(result)}`);
    }
  }
  console.log("");

  console.log("Recent Traces");
  if (digest.recentTraces.length === 0) {
    console.log("- No recent traces found.");
  } else {
    for (const trace of digest.recentTraces.slice(0, 8)) {
      console.log(
        `- ${trace.rootServiceName ?? "unknown"} ${trace.rootTraceName ?? "(no root span)"} trace=${trace.traceID ?? "unknown"} durationMs=${trace.durationMs ?? "open"}`,
      );
    }
  }
}

async function runCli() {
  const digest = await collectObservabilityDigest();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(digest, null, 2));
    return;
  }
  printDigest(digest);
}

if (process.argv[1]?.endsWith("observability-digest.ts")) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
