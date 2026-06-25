import { httpHeaderRedactionLayer } from "@t3tools/shared/httpObservability";
import { makeLocalFileTracer, makeTraceSink } from "@t3tools/shared/observability";
import { makeT3ObservabilityResourceAttributesFromEnv } from "@t3tools/shared/observabilityResource";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as References from "effect/References";
import * as Tracer from "effect/Tracer";
import {
  OtlpLogger,
  OtlpMetrics,
  OtlpSerialization,
  OtlpTracer,
} from "effect/unstable/observability";

import packageJson from "../../../package.json" with { type: "json" };
import * as ServerConfig from "../../config.ts";
import { ServerLoggerLive } from "../../serverLogger.ts";
import * as BrowserTraceCollector from "../BrowserTraceCollector.ts";

const otlpSerializationLayer = OtlpSerialization.layerJson;

export const ObservabilityLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const otlpResource = {
      serviceName: config.otlpServiceName,
      serviceVersion: packageJson.version,
      attributes: {
        ...makeT3ObservabilityResourceAttributesFromEnv(process.env, {
          serviceVersion: packageJson.version,
          runtimeMode: config.mode,
        }),
        "service.mode": config.mode,
      },
    };

    const traceReferencesLayer = Layer.mergeAll(
      Layer.succeed(Tracer.MinimumTraceLevel, config.traceMinLevel),
      Layer.succeed(References.TracerTimingEnabled, config.traceTimingEnabled),
      httpHeaderRedactionLayer,
    );

    const tracerLayer = Layer.unwrap(
      Effect.gen(function* () {
        const sink = yield* makeTraceSink({
          filePath: config.serverTracePath,
          maxBytes: config.traceMaxBytes,
          maxFiles: config.traceMaxFiles,
          batchWindowMs: config.traceBatchWindowMs,
        });
        const delegate =
          config.otlpTracesUrl === undefined
            ? undefined
            : yield* OtlpTracer.make({
                url: config.otlpTracesUrl,
                exportInterval: `${config.otlpExportIntervalMs} millis`,
                resource: otlpResource,
              });

        const tracer = yield* makeLocalFileTracer({
          filePath: config.serverTracePath,
          maxBytes: config.traceMaxBytes,
          maxFiles: config.traceMaxFiles,
          batchWindowMs: config.traceBatchWindowMs,
          sink,
          ...(delegate ? { delegate } : {}),
        });

        return Layer.mergeAll(
          Layer.succeed(Tracer.Tracer, tracer),
          BrowserTraceCollector.layer(sink),
        );
      }),
    ).pipe(Layer.provideMerge(otlpSerializationLayer));

    const metricsLayer =
      config.otlpMetricsUrl === undefined
        ? Layer.empty
        : OtlpMetrics.layer({
            url: config.otlpMetricsUrl,
            exportInterval: `${config.otlpExportIntervalMs} millis`,
            resource: otlpResource,
          }).pipe(Layer.provideMerge(otlpSerializationLayer));

    const logsLayer =
      config.otlpLogsUrl === undefined
        ? Layer.empty
        : OtlpLogger.layer({
            url: config.otlpLogsUrl,
            exportInterval: `${config.otlpExportIntervalMs} millis`,
            resource: otlpResource,
            mergeWithExisting: true,
          }).pipe(Layer.provideMerge(otlpSerializationLayer));

    return Layer.mergeAll(
      ServerLoggerLive,
      traceReferencesLayer,
      tracerLayer,
      metricsLayer,
      logsLayer,
    );
  }),
);
