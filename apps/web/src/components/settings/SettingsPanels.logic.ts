import type {
  ProviderDriverKind,
  ProviderInstanceConfig,
  ProviderInstanceId,
  ServerSettings,
  UnifiedSettings,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";

function collapseOtelSignalsUrl(input: {
  readonly tracesUrl: string;
  readonly metricsUrl: string;
  readonly logsUrl: string;
}): string | null {
  const tracesSuffix = "/traces";
  const metricsSuffix = "/metrics";
  const logsSuffix = "/logs";
  if (
    !input.tracesUrl.endsWith(tracesSuffix) ||
    !input.metricsUrl.endsWith(metricsSuffix) ||
    !input.logsUrl.endsWith(logsSuffix)
  ) {
    return null;
  }

  const tracesBase = input.tracesUrl.slice(0, -tracesSuffix.length);
  const metricsBase = input.metricsUrl.slice(0, -metricsSuffix.length);
  const logsBase = input.logsUrl.slice(0, -logsSuffix.length);
  if (tracesBase !== metricsBase || tracesBase !== logsBase) {
    return null;
  }

  return `${tracesBase}/{traces,metrics,logs}`;
}

export function formatDiagnosticsDescription(input: {
  readonly localTracingEnabled: boolean;
  readonly otlpTracesEnabled: boolean;
  readonly otlpTracesUrl?: string | undefined;
  readonly otlpMetricsEnabled: boolean;
  readonly otlpMetricsUrl?: string | undefined;
  readonly otlpLogsEnabled: boolean;
  readonly otlpLogsUrl?: string | undefined;
}): string {
  const mode = input.localTracingEnabled ? "Local trace file" : "Terminal logs only";
  const tracesUrl = input.otlpTracesEnabled ? input.otlpTracesUrl : undefined;
  const metricsUrl = input.otlpMetricsEnabled ? input.otlpMetricsUrl : undefined;
  const logsUrl = input.otlpLogsEnabled ? input.otlpLogsUrl : undefined;

  if (tracesUrl && metricsUrl && logsUrl) {
    const collapsedUrl = collapseOtelSignalsUrl({ tracesUrl, metricsUrl, logsUrl });
    return collapsedUrl
      ? `${mode}. Exporting OTEL to ${collapsedUrl}.`
      : `${mode}. Exporting OTEL traces to ${tracesUrl}, metrics to ${metricsUrl}, and logs to ${logsUrl}.`;
  }

  const signals = [
    tracesUrl ? `traces to ${tracesUrl}` : undefined,
    metricsUrl ? `metrics to ${metricsUrl}` : undefined,
    logsUrl ? `logs to ${logsUrl}` : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  if (signals.length > 0) {
    return `${mode}. Exporting OTEL ${signals.join(", ")}.`;
  }

  return `${mode}.`;
}

export function buildProviderInstanceUpdatePatch(input: {
  readonly settings: Pick<ServerSettings, "providers" | "providerInstances">;
  readonly instanceId: ProviderInstanceId;
  readonly instance: ProviderInstanceConfig;
  readonly driver: ProviderDriverKind;
  readonly isDefault: boolean;
  readonly textGenerationModelSelection?:
    | ServerSettings["textGenerationModelSelection"]
    | undefined;
}): Partial<UnifiedSettings> {
  type LegacyProviderSettings = ServerSettings["providers"][keyof ServerSettings["providers"]];
  const legacyProviderDefaults = DEFAULT_UNIFIED_SETTINGS.providers as Record<
    string,
    LegacyProviderSettings | undefined
  >;
  const legacyProviderDefault = input.isDefault ? legacyProviderDefaults[input.driver] : undefined;
  return {
    ...(legacyProviderDefault !== undefined
      ? {
          providers: {
            ...input.settings.providers,
            [input.driver]: legacyProviderDefault,
          } as ServerSettings["providers"],
        }
      : {}),
    providerInstances: {
      ...input.settings.providerInstances,
      [input.instanceId]: input.instance,
    },
    ...(input.textGenerationModelSelection !== undefined
      ? { textGenerationModelSelection: input.textGenerationModelSelection }
      : {}),
  };
}
