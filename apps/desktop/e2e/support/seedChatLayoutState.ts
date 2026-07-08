// @effect-diagnostics nodeBuiltinImport:off globalDate:off - E2E layout setup uses server internals against temp state.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  DEFAULT_MODEL,
  DEFAULT_RUNTIME_MODE,
  EventId,
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
import { OrchestrationLayerLive } from "../../../server/src/orchestration/runtimeLayer.ts";
import { OrchestrationEngineService } from "../../../server/src/orchestration/Services/OrchestrationEngine.ts";
import { RepositoryIdentityResolverLive } from "../../../server/src/project/Layers/RepositoryIdentityResolver.ts";
import { layerConfig as SqlitePersistenceLayerLive } from "../../../server/src/persistence/Layers/Sqlite.ts";
import type { ElectronHarnessRuntime } from "./electronHarness.ts";

export const CHAT_LAYOUT_PROJECT_TITLE = "E2E Chat Layout Fixture";
export const CHAT_LAYOUT_THREAD_TITLES = [
  "Layout history thread 1",
  "Layout history thread 2",
  "Layout history thread 3",
  "Layout history thread 4",
  "Layout history thread 5",
  "Layout history thread 6",
] as const;

function commandId(id: string) {
  return CommandId.make(`cmd-e2e-chat-layout-${id}`);
}

function isoMinute(base: Date, offsetMinutes: number): string {
  return new Date(base.getTime() + offsetMinutes * 60_000).toISOString();
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

export async function seedChatLayoutState(runtime: ElectronHarnessRuntime): Promise<void> {
  const workspaceRoot = NodePath.join(runtime.rootDir, "chat-layout-workspace");
  await NodeFSP.mkdir(workspaceRoot, { recursive: true });
  await NodeFSP.writeFile(NodePath.join(workspaceRoot, "README.md"), "# chat layout\n");

  const projectId = ProjectId.make("project-e2e-chat-layout");
  const modelSelection = {
    instanceId: ProviderInstanceId.make("codex"),
    model: DEFAULT_MODEL,
  };
  const baseCreatedAt = new Date("2026-07-08T10:00:00.000Z");

  const program = Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    yield* engine.dispatch({
      type: "project.create",
      commandId: commandId("project-create"),
      projectId,
      title: CHAT_LAYOUT_PROJECT_TITLE,
      workspaceRoot,
      defaultModelSelection: modelSelection,
      createdAt: isoMinute(baseCreatedAt, 0),
    });

    for (let index = 0; index < CHAT_LAYOUT_THREAD_TITLES.length; index += 1) {
      const threadNumber = index + 1;
      const threadId = ThreadId.make(`thread-e2e-chat-layout-${threadNumber}`);
      const turnId = TurnId.make(`turn-e2e-chat-layout-${threadNumber}`);
      const createdAt = isoMinute(baseCreatedAt, threadNumber);
      yield* engine.dispatch({
        type: "thread.create",
        commandId: commandId(`thread-${threadNumber}-create`),
        threadId,
        projectId,
        title: CHAT_LAYOUT_THREAD_TITLES[index]!,
        modelSelection,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      });
      yield* engine.dispatch({
        type: "thread.message.assistant.delta",
        commandId: commandId(`thread-${threadNumber}-assistant`),
        threadId,
        messageId: MessageId.make(`message-e2e-chat-layout-${threadNumber}`),
        turnId,
        delta: `Seeded assistant response for layout thread ${threadNumber}.`,
        createdAt,
      });
    }

    const activeThreadId = ThreadId.make("thread-e2e-chat-layout-1");
    yield* engine.dispatch({
      type: "thread.activity.append",
      commandId: commandId("context-window"),
      threadId: activeThreadId,
      activity: {
        id: EventId.make("activity-e2e-chat-layout-context-window"),
        tone: "info",
        kind: "context-window.updated",
        summary: "Context window updated",
        payload: {
          usedTokens: 100_000,
          totalProcessedTokens: 125_000,
          maxTokens: 200_000,
          inputTokens: 96_000,
          cachedInputTokens: 2_000,
          outputTokens: 2_000,
          reasoningOutputTokens: 0,
          compactsAutomatically: true,
        },
        turnId: TurnId.make("turn-e2e-chat-layout-1"),
        createdAt: isoMinute(baseCreatedAt, 10),
      },
      createdAt: isoMinute(baseCreatedAt, 10),
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
