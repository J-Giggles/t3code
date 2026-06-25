// @effect-diagnostics nodeBuiltinImport:off globalDate:off - E2E recovery setup uses server internals against temp state.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  DEFAULT_MODEL,
  DEFAULT_RUNTIME_MODE,
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  ServerConfig,
  deriveServerPaths,
  ensureServerDirectories,
} from "../../../server/src/config.ts";
import { layerConfig as SqlitePersistenceLayerLive } from "../../../server/src/persistence/Layers/Sqlite.ts";
import { RepositoryIdentityResolverLive } from "../../../server/src/project/Layers/RepositoryIdentityResolver.ts";
import { OrchestrationLayerLive } from "../../../server/src/orchestration/runtimeLayer.ts";
import { OrchestrationEngineService } from "../../../server/src/orchestration/Services/OrchestrationEngine.ts";
import type { ElectronHarnessRuntime } from "./electronHarness.ts";

export const RECOVERY_PROJECT_TITLE = "E2E Recovery Fixture";
export const RECOVERY_THREAD_TITLE = "Recovered stale session";

function nowIso(): string {
  return new Date().toISOString();
}

function commandId(id: string) {
  return CommandId.make(`cmd-e2e-${id}`);
}

function makeServerConfigLayer(runtime: ElectronHarnessRuntime, workspaceRoot: string) {
  return Layer.effect(
    ServerConfig,
    Effect.gen(function* () {
      const devUrl = new URL(runtime.devServerUrl);
      const paths = yield* deriveServerPaths(runtime.t3Home, devUrl);
      yield* ensureServerDirectories(paths);
      return {
        logLevel: "Error",
        traceMinLevel: "Info",
        traceTimingEnabled: true,
        traceBatchWindowMs: 200,
        traceMaxBytes: 10 * 1024 * 1024,
        traceMaxFiles: 10,
        otlpTracesUrl: undefined,
        otlpMetricsUrl: undefined,
        otlpLogsUrl: undefined,
        observabilityGrafanaUrl: undefined,
        otlpExportIntervalMs: 10_000,
        otlpServiceName: "t3-server",
        mode: "desktop" as const,
        port: runtime.serverPort,
        cwd: workspaceRoot,
        baseDir: runtime.t3Home,
        ...paths,
        host: "127.0.0.1",
        staticDir: undefined,
        devUrl,
        noBrowser: true,
        startupPresentation: "headless" as const,
        desktopBootstrapToken: undefined,
        autoBootstrapProjectFromCwd: false,
        logWebSocketEvents: true,
        tailscaleServeEnabled: false,
        tailscaleServePort: 443,
        tailscaleServePath: undefined,
      };
    }),
  );
}

export async function seedRecoveryState(runtime: ElectronHarnessRuntime): Promise<void> {
  const workspaceRoot = NodePath.join(runtime.rootDir, "recovery-workspace");
  await NodeFSP.mkdir(workspaceRoot, { recursive: true });
  await NodeFSP.writeFile(NodePath.join(workspaceRoot, "README.md"), "# recovery\n");

  const projectId = ProjectId.make("project-e2e-recovery");
  const threadId = ThreadId.make("thread-e2e-recovery");
  const turnId = TurnId.make("turn-e2e-recovery");
  const modelSelection = {
    instanceId: ProviderInstanceId.make("codex"),
    model: DEFAULT_MODEL,
  };
  const createdAt = nowIso();

  const program = Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    yield* engine.dispatch({
      type: "project.create",
      commandId: commandId("project-create"),
      projectId,
      title: RECOVERY_PROJECT_TITLE,
      workspaceRoot,
      defaultModelSelection: modelSelection,
      createdAt,
    });
    yield* engine.dispatch({
      type: "thread.create",
      commandId: commandId("thread-create"),
      threadId,
      projectId,
      title: RECOVERY_THREAD_TITLE,
      modelSelection,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt,
    });
    yield* engine.dispatch({
      type: "thread.message.assistant.delta",
      commandId: commandId("assistant-delta"),
      threadId,
      messageId: MessageId.make("message-e2e-assistant"),
      turnId,
      delta: "Recovered startup state",
      createdAt,
    });
    yield* engine.dispatch({
      type: "thread.session.set",
      commandId: commandId("session-set"),
      threadId,
      session: {
        threadId,
        status: "running",
        providerName: "E2E Provider",
        providerInstanceId: ProviderInstanceId.make("codex"),
        runtimeMode: DEFAULT_RUNTIME_MODE,
        activeTurnId: turnId,
        lastError: null,
        providerConnection: {
          status: "stale",
          lastSeenAt: createdAt,
          lastRuntimeEvent: "e2e.seeded",
          lastRuntimeEventAt: createdAt,
          staleAfterMs: 1_000,
        },
        updatedAt: createdAt,
      },
      createdAt,
    });
  }).pipe(
    Effect.provide(
      OrchestrationLayerLive.pipe(
        Layer.provideMerge(RepositoryIdentityResolverLive),
        Layer.provideMerge(SqlitePersistenceLayerLive),
        Layer.provideMerge(makeServerConfigLayer(runtime, workspaceRoot)),
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  );

  await Effect.runPromise(program);
}
