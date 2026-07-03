# Local Observability Hub, Grafana Provisioning, And Digest Metrics

## Purpose

Run a local observability hub for logs, traces, metrics, Grafana dashboards, and agent-readable digests.

## Current Commits

- `943c71b562ae10b225ef2844557d516786d08457` `feat(observability): add local hub, Grafana provisioning, and digest metrics`

## Squash / Replay History

This topic folds local OTel/LGTM startup, Grafana provisioning, digest metrics, worktree labels, and desktop pipe hardening.

## Added Features

- [x] Local observability startup and status commands are exposed through scripts (`scripts/local-observability.ts`, `scripts/localTopics/observability/index.ts`).
- [x] Grafana datasource and dashboard provisioning lives with local observability infra (`infra/local-observability/grafana/provisioning/datasources/t3code.yaml`, `infra/local-observability/grafana/dashboards/t3code-local-observability.json`).
- [x] Agent-readable digest output is available for local troubleshooting (`scripts/observability-digest.ts`, `scripts/localTopics/observability/index.ts`).

## Added UI

- [x] Grafana dashboard panels are provisioned as the operator UI for this topic (`infra/local-observability/grafana/dashboards/t3code-local-observability.json`).

## Added Server And Runtime Behavior

- [x] Server, browser, desktop, and provider telemetry export logs, traces, and metrics with worktree identity labels (`apps/server/src/localTopics/observability/index.ts`, `apps/desktop/src/localTopics/observability/index.ts`).
- [x] Closed Electron output pipes are treated as best-effort console mirroring failures (`apps/desktop/src/app/DesktopBackendOutputLog.ts`).

## Added Tests

- [x] Local observability config, digest output, Grafana provisioning, and worktree metric labels are covered by focused tests (`scripts/local-observability.test.ts`, `scripts/observability-digest.test.ts`, `packages/shared/src/observabilityResource.test.ts`).

## Component Entrypoints

Componentization status: `complete`.

- `scripts/localTopics/observability/index.ts` (source, internal)
- `apps/server/src/localTopics/observability/index.ts` (source, internal)
- `apps/desktop/src/localTopics/observability/index.ts` (source, internal)

## Integration Points

- `scripts/local-observability.ts`
- `scripts/observability-digest.ts`
- `apps/server/src/mcp/toolkits/observability`
- `apps/desktop/src/app/DesktopBackendOutputLog.ts`

## Focused Implementation Snippets

`scripts/localTopics/observability/index.ts`

```ts
export * from "../../local-observability.ts";
export * from "../../observability-digest.ts";
```

`apps/server/src/localTopics/observability/index.ts`

```ts
export * from "../../mcp/toolkits/observability/handlers.ts";
export * from "../../mcp/toolkits/observability/tools.ts";
export * from "../../observability/Attributes.ts";
export * from "../../observability/Metrics.ts";
```

## Replay Notes

Replay after project-agent-files because this topic adds broad runtime instrumentation across server, web, and desktop.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- No pending component entrypoints remain for this topic. Keep owned paths, snippets, and verification commands synchronized when the topic changes.
