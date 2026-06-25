import type {
  AppAutomationClickInput,
  AppAutomationEvaluateInput,
  AppAutomationOwner as AppAutomationOwnerPayload,
  AppAutomationPressInput,
  AppAutomationRequest,
  AppAutomationResponse,
  AppAutomationScrollInput,
  AppAutomationTypeInput,
  AppAutomationWaitForInput,
  EnvironmentApi,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { readEnvironmentApi } from "../../environmentApi";
import { readPrimaryEnvironmentTarget } from "../../environments/primary/target";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { resolveThreadRouteTarget } from "../../threadRoutes";

let nextClientId = 0;

function makeClientId(): string {
  nextClientId += 1;
  return `app-automation-owner-${nextClientId.toString(36)}`;
}

function useActiveThreadRefFromRoute(): ScopedThreadRef | null {
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const activeDraftSession = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );

  return useMemo(() => {
    if (routeTarget?.kind === "server") {
      return routeTarget.threadRef;
    }
    if (routeTarget?.kind === "draft" && activeDraftSession) {
      return {
        environmentId: activeDraftSession.environmentId,
        threadId: activeDraftSession.threadId,
      };
    }
    return null;
  }, [activeDraftSession, routeTarget]);
}

function serializeError(error: unknown): AppAutomationResponse["error"] {
  const record =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
  const tag =
    typeof record?._tag === "string"
      ? record._tag
      : typeof record?.name === "string" && record.name.startsWith("BrowserAutomation")
        ? record.name
        : "BrowserAutomationExecutionError";
  const message =
    typeof record?.message === "string" ? record.message : "T3 Code shell automation failed.";
  const detail = record && "detail" in record ? record.detail : undefined;
  return {
    _tag: tag,
    message,
    ...(detail === undefined ? {} : { detail }),
  };
}

function staleOwnerError(requestThreadId: string, activeThreadId: string): AppAutomationResponse {
  return {
    requestId: "",
    ok: false,
    error: {
      _tag: "BrowserAutomationUnavailableError",
      message: `T3 Code shell owner is stale: request targeted ${requestThreadId}, active thread is ${activeThreadId}.`,
    },
  };
}

async function executeRequest(
  bridge: NonNullable<typeof window.desktopBridge>["appAutomation"],
  request: AppAutomationRequest,
): Promise<unknown> {
  if (!bridge) {
    throw new Error("T3 Code shell automation bridge is unavailable.");
  }

  switch (request.operation) {
    case "status":
      return await bridge.status();
    case "show":
      return await bridge.show();
    case "snapshot":
      return await bridge.snapshot();
    case "click":
      await bridge.click(request.input as AppAutomationClickInput);
      return null;
    case "type":
      await bridge.type(request.input as AppAutomationTypeInput);
      return null;
    case "press":
      await bridge.press(request.input as AppAutomationPressInput);
      return null;
    case "scroll":
      await bridge.scroll(request.input as AppAutomationScrollInput);
      return null;
    case "evaluate":
      return await bridge.evaluate(request.input as AppAutomationEvaluateInput);
    case "waitFor":
      await bridge.waitFor(request.input as AppAutomationWaitForInput);
      return null;
  }
}

function reportOwner(input: {
  readonly api: EnvironmentApi;
  readonly clientId: string;
  readonly threadRef: ScopedThreadRef;
  readonly visible: boolean;
}) {
  const owner: AppAutomationOwnerPayload = {
    clientId: input.clientId,
    environmentId: input.threadRef.environmentId,
    threadId: input.threadRef.threadId,
    visible: input.visible,
    supportsAutomation: true,
    focusedAt: new Date().toISOString(),
  };
  void input.api.appAutomation.reportOwner(owner).catch(() => undefined);
}

export function AppAutomationOwner() {
  const clientIdRef = useRef<string>(makeClientId());
  const activeThreadRef = useActiveThreadRefFromRoute();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const primaryTarget = readPrimaryEnvironmentTarget();
  const bridge = window.desktopBridge?.appAutomation;
  const eligible =
    bridge !== undefined &&
    activeThreadRef !== null &&
    primaryTarget?.source === "desktop-managed" &&
    primaryEnvironmentId !== null &&
    activeThreadRef.environmentId === primaryEnvironmentId;
  const environmentId = eligible ? activeThreadRef.environmentId : null;
  const threadId = eligible ? activeThreadRef.threadId : null;

  useEffect(() => {
    if (!eligible || !activeThreadRef || !bridge) {
      return;
    }

    const api = readEnvironmentApi(activeThreadRef.environmentId);
    if (!api) {
      return;
    }

    const clientId = clientIdRef.current;
    let disposed = false;
    const visible = document.visibilityState !== "hidden";

    const sendOwner = () => {
      if (disposed) return;
      reportOwner({ api, clientId, threadRef: activeThreadRef, visible });
    };

    const unsubscribe = api.appAutomation.connect(
      { clientId },
      (request: AppAutomationRequest) => {
        void (async () => {
          if (disposed) return;
          if (request.threadId !== activeThreadRef.threadId) {
            const response = staleOwnerError(request.threadId, activeThreadRef.threadId);
            await api.appAutomation.respond({ ...response, requestId: request.requestId });
            return;
          }
          try {
            const result = await executeRequest(bridge, request);
            await api.appAutomation.respond({
              requestId: request.requestId,
              ok: true,
              ...(result === undefined ? {} : { result }),
            });
          } catch (error) {
            await api.appAutomation.respond({
              requestId: request.requestId,
              ok: false,
              error: serializeError(error),
            });
          }
        })();
      },
      { onResubscribe: sendOwner },
    );

    sendOwner();

    return () => {
      disposed = true;
      unsubscribe();
      void api.appAutomation.clearOwner({ clientId }).catch(() => undefined);
    };
  }, [activeThreadRef, bridge, eligible, environmentId, threadId]);

  return null;
}
