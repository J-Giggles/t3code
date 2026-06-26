# Local Observability Hub, Grafana Provisioning, And Digest Metrics

## Purpose

Run a local observability hub for logs, traces, metrics, Grafana dashboards, and agent-readable digests.

## Current Commits

- `83b570b88ac033adaa2d642fae79c14c0bca76be` `feat(observability): add local hub, Grafana provisioning, and digest metrics`

## Squash / Replay History

This topic folds local OTel/LGTM startup, Grafana provisioning, digest metrics, worktree labels, and desktop pipe hardening.

## Added Features

- Local observability startup and status commands.
- Grafana datasource and dashboard provisioning.
- Agent-readable observability digest command.

## Added UI

- Grafana dashboards are provisioned outside the T3 Code web UI.

## Added Server And Runtime Behavior

- Server, browser, desktop, and provider events export logs, traces, and metrics with worktree identity labels.
- Closed Electron output pipes are treated as best-effort console mirroring failures.

## Added Tests

- Local observability config, digest, Grafana provisioning, and worktree metric label tests.

## Component Entrypoints

Pending legacy extraction:

- `apps/server/src/localTopics/observability/index.ts`
- `apps/desktop/src/localTopics/observability/index.ts`
- `scripts/localTopics/observability/index.ts`

## Integration Points

- `scripts/local-observability.ts`
- `scripts/observability-digest.ts`
- `apps/server/src/mcp/toolkits/observability`
- `apps/desktop/src/backend/DesktopBackendOutputLog.ts`

## Focused Implementation Snippets

`scripts/observability-digest.ts`

```ts
fetchRecentLogs(query);
fetchTraceSummary(traceId);
formatDigest({ logs, traces, metrics });
```

`scripts/local-observability.ts`

```ts
startLocalObservability();
renderLocalObservabilityStatus();
```

## Replay Notes

Replay after project-agent-files because this topic adds broad runtime instrumentation across server, web, and desktop.

## Verification

- `vp check`
- `vp run typecheck`

## Known Follow-Up Work

- Extract observability CLI helpers and MCP handlers into topic-owned modules.
