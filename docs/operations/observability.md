# Observability

T3 Code local development uses one local-only observability hub for every
checkout and worktree.

Apps emit standard OTLP logs, traces, and metrics to the local OpenTelemetry
Collector at `http://127.0.0.1:4318`. The Collector routes everything into a
local Grafana LGTM stack:

- Loki stores logs.
- Tempo stores traces.
- Prometheus stores metrics.
- Grafana provides dashboards and Explore.

Apps do not target Loki, Tempo, Prometheus, or Grafana directly. The local
Collector endpoint is the contract.

## Start And View The Hub

The dev runner starts the hub automatically before `dev`, `dev:server`,
`dev:web`, and `dev:desktop` unless `T3CODE_LOCAL_OBSERVABILITY=0` is set.
Startup is best-effort: if Docker is unavailable, the app still starts and OTLP
exporters drop or retry.
Docker commands are bounded by `T3CODE_LOCAL_OBSERVABILITY_DOCKER_TIMEOUT_MS`
and default to 30 seconds so first-time image pulls cannot hang app startup
indefinitely.

Start it manually when needed:

```bash
vp run observability:local
```

Check status:

```bash
vp run observability:status
```

Generate an agent-readable local digest:

```bash
vp run observability:digest
```

Open Grafana:

```text
http://127.0.0.1:3030
```

Open the provisioned T3 Code dashboard directly:

```text
http://127.0.0.1:3030/d/t3code-local-observability/t3-code-local-observability?orgId=1
```

Anonymous admin access is enabled for the local container. If Grafana prompts
for credentials, use `admin` / `admin`.

## Local Ports And Containers

The hub is loopback-only and uses stable names:

- Docker network: `t3code-observability`
- LGTM container: `t3code-otel-lgtm`
- Collector container: `t3code-otel-collector`
- Grafana: `http://127.0.0.1:3030`
- OTLP HTTP ingest: `http://127.0.0.1:4318`
- OTLP gRPC ingest: `http://127.0.0.1:4317`
- Loki: `http://127.0.0.1:3100`
- Tempo: `http://127.0.0.1:3200`
- Prometheus: `http://127.0.0.1:9090`

To recreate the local stack, remove those two containers and start it again:

```bash
docker rm -f t3code-otel-collector t3code-otel-lgtm
vp run observability:local
```

Grafana provisioning is loaded when the LGTM container starts. If only the
checked-in Grafana provisioning files changed, restart the LGTM container:

```bash
docker restart t3code-otel-lgtm
```

## Environment Contract

The dev runner injects these by default:

```bash
T3CODE_OTLP_TRACES_URL=http://127.0.0.1:4318/v1/traces
T3CODE_OTLP_METRICS_URL=http://127.0.0.1:4318/v1/metrics
T3CODE_OTLP_LOGS_URL=http://127.0.0.1:4318/v1/logs
T3CODE_OBSERVABILITY_GRAFANA_URL=http://127.0.0.1:3030
```

It also injects identity attributes used for cross-worktree comparison:

- `T3CODE_WORKTREE_ROLE`
- `T3CODE_WORKTREE_PATH`
- `T3CODE_GIT_BRANCH`
- `T3CODE_GIT_COMMIT`
- `T3CODE_DEV_INSTANCE`
- `T3CODE_HOME`

Known local worktree paths take precedence over inherited `T3CODE_WORKTREE_ROLE`
values. This prevents a process launched from `staging` or `dev-*` from being
mislabelled because the launcher inherited `main` from another running app.

Disable local observability startup and env injection:

```bash
T3CODE_LOCAL_OBSERVABILITY=0 vp run dev:desktop
```

Allow more time for a first-time image pull:

```bash
T3CODE_LOCAL_OBSERVABILITY_DOCKER_TIMEOUT_MS=120000 vp run observability:local
```

## Resource Attributes

Logs, spans, and metrics should carry these attributes when available:

- `service.name`
- `service.version`
- `t3.runtime.mode`
- `t3.worktree.role`
- `t3.worktree.path`
- `t3.git.branch`
- `t3.git.commit`
- `t3.dev.instance`
- `t3.home`
- `t3.thread.id`
- `t3.turn.id`
- `t3.provider`
- `t3.provider.instance_id`

These fields let Grafana and agents answer whether an issue is happening on
main, staging, or a specific dev worktree.

## What Is Exported

Server:

- local NDJSON traces are still written to `serverTracePath`
- OTLP traces and metrics are exported when URLs are configured
- Effect logs are exported through OTLP logs
- provider event NDJSON records are mirrored into OTLP logs

Desktop:

- desktop Effect logs are exported through OTLP logs
- backend child stdout and stderr are mirrored as structured logs
- backend bootstrap passes OTLP log settings into the server process

Web:

- browser traces continue through `/api/observability/v1/traces`
- browser logs go through `/api/observability/v1/logs`
- `console.warn`, `console.error`, `window.onerror`, and unhandled promise
  rejections are bridged to OTLP logs in authenticated sessions

Mobile and relay clients:

- dev/runtime logs and traces should use the same local OTLP contract when
  running in local development

## Grafana Workflows

The local Grafana container is provisioned with stable datasources:

- `Loki` (`t3code-loki`) for logs.
- `Tempo` (`t3code-tempo`) for traces.
- `Prometheus` (`t3code-prometheus`) for metrics and the default Explore
  datasource.

The datasources are correlated for normal operator workflows:

- Loki derived fields link `trace_id` values directly to Tempo.
- Tempo trace views can jump to related Loki logs by trace ID.
- Tempo trace views can jump to Prometheus metric queries for nearby RPC and
  provider-turn activity.
- Prometheus exemplars with `trace_id` or `traceID` link back to Tempo.

Use the provisioned dashboard first. It includes variables for worktree,
service, and provider, plus panels for:

- live logs by worktree
- main, staging, and dev errors
- provider turn failures
- RPC and reconnect latency
- process memory and CPU by worktree
- recent errors by worktree role
- error rate by worktree
- provider turn rate by provider
- terminal restarts by worktree

Use Explore for deeper queries:

- Logs: choose `Loki`
- Traces: choose `Tempo`
- Metrics: choose `Prometheus`

Useful Loki filters:

```logql
{t3_worktree_role="main"} |~ `(?i)(error|warn|failed|failure|exception|rejected|crash)`
```

```logql
{t3_worktree_role="staging", service_name=~"t3-.*"}
```

```logql
{component="provider-event-log"} |~ `(?i)(error|failed|failure|exception|rejected)`
```

Useful Prometheus queries:

```promql
sum by (t3_worktree_role, t3_git_branch, service_name, method, outcome) (rate(t3_rpc_requests_total[5m]))
```

```promql
histogram_quantile(0.95, sum(rate(t3_rpc_request_duration_bucket[5m])) by (le, t3_worktree_role, method))
```

```promql
histogram_quantile(0.95, sum(rate(t3_orchestration_command_ack_duration_bucket[5m])) by (le, t3_worktree_role, commandType))
```

## Agent Diagnostics

The server exposes read-only MCP tools for local diagnostics:

- `observability_status`
- `observability_recent_errors`
- `observability_query_logs`
- `observability_query_traces`
- `observability_query_metrics`
- `observability_compare_worktrees`
- `observability_thread_context`

The tools query local Loki, Tempo, and Prometheus APIs when available. They fall
back to local server trace/provider log files when LGTM is unavailable.

The `observability:digest` script provides the same local-first workflow without
needing an MCP client. It queries local Loki, Tempo, and Prometheus, summarizes
recent issue-like logs, top RPC/git activity, recent traces, metric worktree
label coverage, and identity mismatches such as `branch=staging` with
`t3.worktree.role=main`. New server metrics include Prometheus-safe worktree
labels such as `t3_worktree_role`, `t3_git_branch`, and `t3_dev_instance` so
metric streams can be separated by checkout origin.

Typical workflow:

1. Query recent errors for `t3.worktree.role=main`.
2. Follow log/trace context by `trace_id`, `t3.thread.id`, `t3.turn.id`, or
   provider instance.
3. Check whether the same error is present on `staging`.
4. Fix and verify in a `dev-*` worktree.
5. Promote the verified topic into staging.

## Local Fallback Files

The local hub is the cross-app view, but server trace files remain useful when
Docker or LGTM is unavailable.

Tail the server trace file:

```bash
tail -f "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

In monorepo dev:

```bash
tail -f ./dev/logs/server.trace.ndjson
```

Show failed spans:

```bash
jq -c 'select(.exit._tag != "Success") | {
  name,
  durationMs,
  exit,
  attributes
}' "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

Follow one trace:

```bash
jq -r 'select(.traceId == "TRACE_ID_HERE") | [
  .name,
  .spanId,
  (.parentSpanId // "-"),
  .durationMs
] | @tsv' "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

## Adding Instrumentation

Prefer spans at meaningful boundaries:

- RPC methods
- orchestration command handling
- provider adapter calls
- external process calls
- persistence writes
- queue handoffs

Use `Effect.fn("name")` where possible, annotate spans with IDs and paths, and
keep metric labels low-cardinality. High-cardinality values such as thread IDs,
file paths, and full prompts belong on spans and logs, not metric labels.

Logs inside spans become part of the trace story through the installed Effect
logger. Use normal `Effect.logInfo`, `Effect.logWarning`, and `Effect.logError`
calls and attach annotations for machine-readable context.
