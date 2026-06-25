// @effect-diagnostics nodeBuiltinImport:off - This test verifies checked-in CLI provisioning files.
import { describe, expect, it } from "vite-plus/test";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import {
  createLocalObservabilityEnvPatch,
  defaultLocalObservabilityGrafanaDashboardsPath,
  defaultLocalObservabilityGrafanaProvisioningPath,
  isLocalObservabilityDisabled,
  LOCAL_OBSERVABILITY_COLLECTOR_CONTAINER,
  LOCAL_OBSERVABILITY_LGTM_CONTAINER,
  LOCAL_OBSERVABILITY_URLS,
  startLocalObservability,
  type LocalObservabilityDockerRunner,
} from "./local-observability.ts";

describe("local-observability", () => {
  it("injects local OTLP endpoints without overwriting explicit signal URLs", () => {
    expect(
      createLocalObservabilityEnvPatch({
        T3CODE_OTLP_LOGS_URL: "http://127.0.0.1:9999/v1/logs",
      }),
    ).toMatchObject({
      T3CODE_OTLP_TRACES_URL: LOCAL_OBSERVABILITY_URLS.tracesUrl,
      T3CODE_OTLP_METRICS_URL: LOCAL_OBSERVABILITY_URLS.metricsUrl,
      T3CODE_OTLP_LOGS_URL: "http://127.0.0.1:9999/v1/logs",
      T3CODE_OBSERVABILITY_GRAFANA_URL: LOCAL_OBSERVABILITY_URLS.grafanaUrl,
      T3CODE_RELAY_CLIENT_OTLP_TRACES_URL: LOCAL_OBSERVABILITY_URLS.tracesUrl,
      VITE_RELAY_OTLP_TRACES_URL: LOCAL_OBSERVABILITY_URLS.tracesUrl,
      EXPO_PUBLIC_OTLP_TRACES_URL: LOCAL_OBSERVABILITY_URLS.tracesUrl,
    });
  });

  it("honors local observability opt-out values", () => {
    expect(isLocalObservabilityDisabled({ T3CODE_LOCAL_OBSERVABILITY: "0" })).toBe(true);
    expect(createLocalObservabilityEnvPatch({ T3CODE_LOCAL_OBSERVABILITY: "false" })).toEqual({});
  });

  it("warns instead of failing when Docker is unavailable", () => {
    const runner: LocalObservabilityDockerRunner = () => ({
      status: 1,
      stdout: "",
      stderr: "docker socket unavailable",
    });

    const result = startLocalObservability({ runner, env: {} });

    expect(result.ok).toBe(false);
    expect(result.dockerAvailable).toBe(false);
    expect(result.warnings.join("\n")).toContain("docker socket unavailable");
  });

  it("starts stable LGTM and collector containers when Docker is available", () => {
    const commands: Array<ReadonlyArray<string>> = [];
    const runner: LocalObservabilityDockerRunner = (args) => {
      commands.push(args);
      if (args[0] === "version") return { status: 0, stdout: "1\n", stderr: "" };
      if (args[0] === "network" && args[1] === "inspect") {
        return { status: 1, stdout: "", stderr: "missing" };
      }
      if (args[0] === "inspect") return { status: 1, stdout: "", stderr: "missing" };
      return { status: 0, stdout: "", stderr: "" };
    };

    const result = startLocalObservability({ runner, env: {}, configPath: "/tmp/collector.yaml" });

    expect(result.dockerAvailable).toBe(true);
    expect(
      commands.some((args) => args.join(" ").includes(LOCAL_OBSERVABILITY_LGTM_CONTAINER)),
    ).toBe(true);
    expect(
      commands.some((args) => args.join(" ").includes(LOCAL_OBSERVABILITY_COLLECTOR_CONTAINER)),
    ).toBe(true);
    expect(commands.some((args) => args.includes("127.0.0.1:4318:4318"))).toBe(true);
    expect(
      commands.some((args) =>
        args.includes(
          `${defaultLocalObservabilityGrafanaProvisioningPath}:/etc/grafana/provisioning:ro`,
        ),
      ),
    ).toBe(true);
    expect(
      commands.some((args) =>
        args.includes(
          `${defaultLocalObservabilityGrafanaDashboardsPath}:/var/lib/grafana/dashboards/t3code:ro`,
        ),
      ),
    ).toBe(true);
  });

  it("ships professional Grafana datasource provisioning for local LGTM", () => {
    const datasourceConfig = NodeFS.readFileSync(
      NodePath.join(defaultLocalObservabilityGrafanaProvisioningPath, "datasources/t3code.yaml"),
      "utf8",
    );

    expect(datasourceConfig).toContain("uid: t3code-loki");
    expect(datasourceConfig).toContain("uid: t3code-tempo");
    expect(datasourceConfig).toContain("uid: t3code-prometheus");
    expect(datasourceConfig).toContain("tracesToLogsV2:");
    expect(datasourceConfig).toContain("tracesToMetrics:");
    expect(datasourceConfig).toContain("exemplarTraceIdDestinations:");
  });
});
