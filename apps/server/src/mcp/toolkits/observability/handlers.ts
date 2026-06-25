// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeHttps from "node:https";
import * as NodePath from "node:path";

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import * as ServerConfig from "../../../config.ts";
import { ObservabilityToolkit } from "./tools.ts";

const DEFAULT_LIMIT = 50;
const FALLBACK_READ_BYTES = 256 * 1024;
const LOCAL_QUERY_TIMEOUT_MS = 1_500;
const ERROR_PATTERN = /(?:error|warn|failed|failure|exception|rejected|crash)/iu;

type QueryRecord = Readonly<Record<string, unknown>>;
const decodeUnknownJson = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);

class ObservabilityQueryError extends Data.TaggedError("ObservabilityQueryError")<{
  readonly message: string;
  readonly detail?: string | undefined;
}> {}

function limit(input: number | undefined): number {
  return Math.max(1, Math.min(500, input ?? DEFAULT_LIMIT));
}

function getEnvUrl(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function localEndpointStatus(config: ServerConfig.ServerConfig["Service"]) {
  return {
    grafanaUrl: config.observabilityGrafanaUrl ?? getEnvUrl("T3CODE_OBSERVABILITY_GRAFANA_URL"),
    lokiUrl: getEnvUrl("T3CODE_OBSERVABILITY_LOKI_URL") ?? "http://127.0.0.1:3100",
    tempoUrl: getEnvUrl("T3CODE_OBSERVABILITY_TEMPO_URL") ?? "http://127.0.0.1:3200",
    prometheusUrl: getEnvUrl("T3CODE_OBSERVABILITY_PROMETHEUS_URL") ?? "http://127.0.0.1:9090",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readTail(path: string, maxBytes = FALLBACK_READ_BYTES): string {
  const stat = NodeFS.statSync(path);
  const fd = NodeFS.openSync(path, "r");
  try {
    const size = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(size);
    NodeFS.readSync(fd, buffer, 0, size, stat.size - size);
    return buffer.toString("utf8");
  } finally {
    NodeFS.closeSync(fd);
  }
}

function listLogFiles(logsDir: string): Array<string> {
  const result: Array<string> = [];
  const visit = (dir: string, depth: number) => {
    if (depth > 3) return;
    for (const entry of NodeFS.readdirSync(dir, { withFileTypes: true })) {
      const path = NodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path, depth + 1);
      } else if (/\.(?:log|ndjson)$/iu.test(entry.name)) {
        result.push(path);
      }
    }
  };
  if (NodeFS.existsSync(logsDir)) {
    visit(logsDir, 0);
  }
  return result;
}

function fallbackSearchLogs(input: {
  readonly logsDir: string;
  readonly pattern: RegExp;
  readonly limit: number;
}): Array<QueryRecord> {
  const records: Array<QueryRecord> = [];
  for (const filePath of listLogFiles(input.logsDir)) {
    const text = readTail(filePath);
    const lines = text.split(/\r?\n/u).filter((line) => line.length > 0);
    for (const line of lines.toReversed()) {
      if (!input.pattern.test(line)) continue;
      records.push({
        source: "local-file",
        filePath,
        line,
      });
      if (records.length >= input.limit) {
        return records;
      }
    }
  }
  return records;
}

function fallbackSearchTraces(input: {
  readonly tracePath: string;
  readonly query?: string | undefined;
  readonly traceId?: string | undefined;
  readonly threadId?: string | undefined;
  readonly limit: number;
}): Array<QueryRecord> {
  if (!NodeFS.existsSync(input.tracePath)) {
    return [];
  }
  const query = input.query?.toLowerCase();
  return readTail(input.tracePath, 512 * 1024)
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .toReversed()
    .filter((line) => {
      const lowered = line.toLowerCase();
      return (
        (query === undefined || lowered.includes(query)) &&
        (input.traceId === undefined || line.includes(input.traceId)) &&
        (input.threadId === undefined || line.includes(input.threadId))
      );
    })
    .slice(0, input.limit)
    .map((line) => ({ source: "local-trace-file", filePath: input.tracePath, line }));
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
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

const fetchJson = Effect.fn("observability.fetchJson")(function* (url: string) {
  const text = yield* Effect.tryPromise({
    try: () => fetchText(url),
    catch: (cause) =>
      new ObservabilityQueryError({
        message: "Local observability query failed.",
        detail: causeMessage(cause),
      }),
  });
  return yield* decodeUnknownJson(text).pipe(
    Effect.mapError(
      (cause) =>
        new ObservabilityQueryError({
          message: "Local observability response was not valid JSON.",
          detail: causeMessage(cause),
        }),
    ),
  );
});

function makeLokiQuery(input: {
  readonly text: string;
  readonly worktreeRole?: string | undefined;
  readonly serviceName?: string | undefined;
}): string {
  const selectors = [
    input.serviceName ? `service_name="${input.serviceName}"` : undefined,
    input.worktreeRole ? `t3_worktree_role="${input.worktreeRole}"` : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  const selector = selectors.length > 0 ? `{${selectors.join(",")}}` : `{service_name=~".+"}`;
  return `${selector} |~ ${JSON.stringify(input.text)}`;
}

const queryLoki = Effect.fn("observability.queryLoki")(function* (input: {
  readonly lokiUrl: string;
  readonly query: string;
  readonly limit: number;
}) {
  const url = new URL("/loki/api/v1/query_range", input.lokiUrl);
  url.searchParams.set("query", input.query);
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("direction", "backward");
  return yield* fetchJson(url.toString());
});

const queryPrometheus = Effect.fn("observability.queryPrometheus")(function* (input: {
  readonly prometheusUrl: string;
  readonly query: string;
}) {
  const url = new URL("/api/v1/query", input.prometheusUrl);
  url.searchParams.set("query", input.query);
  return yield* fetchJson(url.toString());
});

function resultWarning(result: Result.Result<unknown, unknown>): string | undefined {
  return Result.isFailure(result) ? String(result.failure) : undefined;
}

const handlers = {
  observability_status: () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const endpoints = localEndpointStatus(config);
      return {
        localOnly: true,
        logsDirectoryPath: config.logsDir,
        traceFilePath: config.serverTracePath,
        otlp: {
          tracesUrl: config.otlpTracesUrl,
          tracesEnabled: config.otlpTracesUrl !== undefined,
          metricsUrl: config.otlpMetricsUrl,
          metricsEnabled: config.otlpMetricsUrl !== undefined,
          logsUrl: config.otlpLogsUrl,
          logsEnabled: config.otlpLogsUrl !== undefined,
        },
        endpoints,
        fallbacks: {
          logsDirectoryExists: NodeFS.existsSync(config.logsDir),
          traceFileExists: NodeFS.existsSync(config.serverTracePath),
        },
      };
    }),
  observability_recent_errors: (input) =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const endpoints = localEndpointStatus(config);
      const boundedLimit = limit(input.limit);
      const query = makeLokiQuery({
        text: "(?i)(error|warn|failed|failure|exception|rejected|crash)",
        worktreeRole: input.worktreeRole,
        serviceName: input.serviceName,
      });
      const loki = yield* Effect.result(
        queryLoki({
          lokiUrl: endpoints.lokiUrl,
          query,
          limit: boundedLimit,
        }),
      );
      const fallback = fallbackSearchLogs({
        logsDir: config.logsDir,
        pattern: ERROR_PATTERN,
        limit: boundedLimit,
      });
      return {
        source: Result.isSuccess(loki) ? "loki" : "local-file-fallback",
        query,
        loki: Result.isSuccess(loki) ? loki.success : undefined,
        warning: resultWarning(loki),
        records: fallback,
      };
    }),
  observability_query_logs: (input) =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const endpoints = localEndpointStatus(config);
      const boundedLimit = limit(input.limit);
      const query = makeLokiQuery({
        text: input.query,
        worktreeRole: input.worktreeRole,
      });
      const loki = yield* Effect.result(
        queryLoki({
          lokiUrl: endpoints.lokiUrl,
          query,
          limit: boundedLimit,
        }),
      );
      const fallback = fallbackSearchLogs({
        logsDir: config.logsDir,
        pattern: new RegExp(escapeRegExp(input.query), "iu"),
        limit: boundedLimit,
      });
      return {
        source: Result.isSuccess(loki) ? "loki" : "local-file-fallback",
        query,
        loki: Result.isSuccess(loki) ? loki.success : undefined,
        warning: resultWarning(loki),
        records: fallback,
      };
    }),
  observability_query_traces: (input) =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      return {
        source: "local-trace-file",
        traceFilePath: config.serverTracePath,
        records: fallbackSearchTraces({
          tracePath: config.serverTracePath,
          query: input.query,
          traceId: input.traceId,
          threadId: input.threadId,
          limit: limit(input.limit),
        }),
      };
    }),
  observability_query_metrics: (input) =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const endpoints = localEndpointStatus(config);
      const prometheus = yield* Effect.result(
        queryPrometheus({
          prometheusUrl: endpoints.prometheusUrl,
          query: input.query,
        }),
      );
      return {
        source: Result.isSuccess(prometheus) ? "prometheus" : "unavailable",
        query: input.query,
        result: Result.isSuccess(prometheus) ? prometheus.success : undefined,
        warning: resultWarning(prometheus),
      };
    }),
  observability_compare_worktrees: (input) =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const records = fallbackSearchLogs({
        logsDir: config.logsDir,
        pattern: ERROR_PATTERN,
        limit: limit(input.limit),
      });
      return {
        source: "local-file-fallback",
        leftRole: input.leftRole,
        rightRole: input.rightRole,
        note: "Loki role comparison is available when local LGTM has indexed t3.worktree.role labels. Local fallback only covers this server's current logs directory.",
        left: records.filter((record) => String(record.line).includes(input.leftRole)),
        right: records.filter((record) => String(record.line).includes(input.rightRole)),
      };
    }),
  observability_thread_context: (input) =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const boundedLimit = limit(input.limit);
      return {
        threadId: input.threadId,
        logs: fallbackSearchLogs({
          logsDir: config.logsDir,
          pattern: new RegExp(escapeRegExp(input.threadId), "iu"),
          limit: boundedLimit,
        }),
        traces: fallbackSearchTraces({
          tracePath: config.serverTracePath,
          threadId: input.threadId,
          limit: boundedLimit,
        }),
      };
    }),
} satisfies Parameters<typeof ObservabilityToolkit.toLayer>[0];

export const ObservabilityToolkitHandlersLive = ObservabilityToolkit.toLayer(handlers);
