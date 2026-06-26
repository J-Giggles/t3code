# Local Observability Hub, Grafana Provisioning, And Digest Metrics

## Purpose

Run a local observability hub for logs, traces, metrics, Grafana dashboards, and agent-readable digests.

## Current Commits

- `943c71b562ae10b225ef2844557d516786d08457` `feat(observability): add local hub, Grafana provisioning, and digest metrics`

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

Componentization status: `complete`.

- `scripts/localTopics/observability/index.ts` (source, internal)
- `apps/server/src/localTopics/observability/index.ts` (source, internal)
- `apps/desktop/src/localTopics/observability/index.ts` (source, internal)

## Integration Points

- `scripts/local-observability.ts`
- `scripts/observability-digest.ts`
- `apps/server/src/mcp/toolkits/observability`
- `apps/desktop/src/backend/DesktopBackendOutputLog.ts`

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
