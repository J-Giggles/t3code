import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as ServerConfig from "../../../config.ts";

const dependencies = [ServerConfig.ServerConfig];

const OptionalLimit = Schema.optionalKey(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))
    .check(Schema.isLessThanOrEqualTo(500))
    .annotate({
      description: "Maximum number of records to return. Defaults to 50 and is capped at 500.",
    }),
);

const WorktreeRole = Schema.optionalKey(
  Schema.String.annotate({
    description: "Optional t3.worktree.role filter such as main, staging, original, or dev.",
  }),
);

const QueryText = Schema.String.annotate({
  description: "Log, trace, metric, or label query text to search for.",
});

export const ObservabilityRecentErrorsInput = Schema.Struct({
  worktreeRole: WorktreeRole,
  serviceName: Schema.optionalKey(
    Schema.String.annotate({ description: "Optional service.name filter." }),
  ),
  limit: OptionalLimit,
});

export const ObservabilityQueryLogsInput = Schema.Struct({
  query: QueryText,
  worktreeRole: WorktreeRole,
  limit: OptionalLimit,
});

export const ObservabilityQueryTracesInput = Schema.Struct({
  query: Schema.optionalKey(QueryText),
  traceId: Schema.optionalKey(
    Schema.String.annotate({ description: "Optional trace_id / traceId to match exactly." }),
  ),
  threadId: Schema.optionalKey(
    Schema.String.annotate({ description: "Optional t3.thread.id / thread id to match." }),
  ),
  limit: OptionalLimit,
});

export const ObservabilityQueryMetricsInput = Schema.Struct({
  query: QueryText,
});

export const ObservabilityCompareWorktreesInput = Schema.Struct({
  leftRole: Schema.String.annotate({ description: "Left t3.worktree.role to compare." }),
  rightRole: Schema.String.annotate({ description: "Right t3.worktree.role to compare." }),
  limit: OptionalLimit,
});

export const ObservabilityThreadContextInput = Schema.Struct({
  threadId: Schema.String.annotate({ description: "Thread id to search in logs and traces." }),
  limit: OptionalLimit,
});

const readonlyObservabilityTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.OpenWorld, false)
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;

export const ObservabilityStatusTool = readonlyObservabilityTool(
  Tool.make("observability_status", {
    description:
      "Report local observability configuration and whether the current server has OTLP logs, traces, metrics, Grafana, and local fallback files configured.",
    success: Schema.Unknown,
    dependencies,
  }).annotate(Tool.Title, "Get local observability status"),
);

export const ObservabilityRecentErrorsTool = readonlyObservabilityTool(
  Tool.make("observability_recent_errors", {
    description:
      "Return recent warning/error records from the local observability backend, falling back to local server log files when LGTM is unavailable.",
    parameters: ObservabilityRecentErrorsInput,
    success: Schema.Unknown,
    dependencies,
  }).annotate(Tool.Title, "Get recent observability errors"),
);

export const ObservabilityQueryLogsTool = readonlyObservabilityTool(
  Tool.make("observability_query_logs", {
    description:
      "Search local Loki logs when available, with a bounded fallback search over local server log files.",
    parameters: ObservabilityQueryLogsInput,
    success: Schema.Unknown,
    dependencies,
  }).annotate(Tool.Title, "Query local observability logs"),
);

export const ObservabilityQueryTracesTool = readonlyObservabilityTool(
  Tool.make("observability_query_traces", {
    description:
      "Search local traces by text, trace id, or thread id using local trace files as a fallback.",
    parameters: ObservabilityQueryTracesInput,
    success: Schema.Unknown,
    dependencies,
  }).annotate(Tool.Title, "Query local observability traces"),
);

export const ObservabilityQueryMetricsTool = readonlyObservabilityTool(
  Tool.make("observability_query_metrics", {
    description: "Run a read-only Prometheus query against the local metrics endpoint.",
    parameters: ObservabilityQueryMetricsInput,
    success: Schema.Unknown,
    dependencies,
  }).annotate(Tool.Title, "Query local observability metrics"),
);

export const ObservabilityCompareWorktreesTool = readonlyObservabilityTool(
  Tool.make("observability_compare_worktrees", {
    description:
      "Compare recent warning/error logs between two t3.worktree.role values, such as main and staging.",
    parameters: ObservabilityCompareWorktreesInput,
    success: Schema.Unknown,
    dependencies,
  }).annotate(Tool.Title, "Compare worktree observability"),
);

export const ObservabilityThreadContextTool = readonlyObservabilityTool(
  Tool.make("observability_thread_context", {
    description:
      "Return bounded local log and trace context for one thread id, including fallback file records when LGTM is unavailable.",
    parameters: ObservabilityThreadContextInput,
    success: Schema.Unknown,
    dependencies,
  }).annotate(Tool.Title, "Get observability thread context"),
);

export const ObservabilityToolkit = Toolkit.make(
  ObservabilityStatusTool,
  ObservabilityRecentErrorsTool,
  ObservabilityQueryLogsTool,
  ObservabilityQueryTracesTool,
  ObservabilityQueryMetricsTool,
  ObservabilityCompareWorktreesTool,
  ObservabilityThreadContextTool,
);
