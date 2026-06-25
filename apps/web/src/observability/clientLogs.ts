import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, FetchHttpClient } from "effect/unstable/http";

import { httpHeaderRedactionLayer } from "@t3tools/shared/httpObservability";
import { resolvePrimaryEnvironmentHttpUrl } from "../environments/primary";
import { isElectron } from "../env";
import { APP_VERSION } from "~/branding";

type BrowserLogLevel = "WARN" | "ERROR";

interface BrowserLogInput {
  readonly level: BrowserLogLevel;
  readonly message: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

const runtime = ManagedRuntime.make(Layer.merge(FetchHttpClient.layer, httpHeaderRedactionLayer));
const CLIENT_LOG_RESOURCE_ATTRIBUTES = {
  "service.name": "t3-web",
  "service.version": APP_VERSION,
  "service.runtime": "t3-web",
  "service.mode": isElectron ? "electron" : "browser",
  "t3.runtime.mode": "web",
  ...(import.meta.env.VITE_T3_WORKTREE_ROLE
    ? { "t3.worktree.role": import.meta.env.VITE_T3_WORKTREE_ROLE }
    : {}),
  ...(import.meta.env.VITE_T3_WORKTREE_PATH
    ? { "t3.worktree.path": import.meta.env.VITE_T3_WORKTREE_PATH }
    : {}),
  ...(import.meta.env.VITE_T3_GIT_BRANCH
    ? { "t3.git.branch": import.meta.env.VITE_T3_GIT_BRANCH }
    : {}),
  ...(import.meta.env.VITE_T3_GIT_COMMIT
    ? { "t3.git.commit": import.meta.env.VITE_T3_GIT_COMMIT }
    : {}),
  ...(import.meta.env.VITE_T3_DEV_INSTANCE
    ? { "t3.dev.instance": import.meta.env.VITE_T3_DEV_INSTANCE }
    : {}),
  ...(import.meta.env.VITE_T3_HOME ? { "t3.home": import.meta.env.VITE_T3_HOME } : {}),
} as const;

let configured = false;
let originalWarn: typeof console.warn | null = null;
let originalError: typeof console.error | null = null;

function stringifyLogPart(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function attributeValue(value: unknown) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return { doubleValue: value };
  return { stringValue: stringifyLogPart(value) };
}

function attributesToOtlp(attributes: Readonly<Record<string, unknown>>) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      value: attributeValue(value),
    }));
}

export function makeBrowserLogsPayload(input: BrowserLogInput) {
  const now = BigInt(Date.now()) * 1_000_000n;
  return {
    resourceLogs: [
      {
        resource: {
          attributes: attributesToOtlp(CLIENT_LOG_RESOURCE_ATTRIBUTES),
        },
        scopeLogs: [
          {
            scope: {
              name: "t3-web-browser-logs",
              version: APP_VERSION,
            },
            logRecords: [
              {
                timeUnixNano: now.toString(),
                observedTimeUnixNano: now.toString(),
                severityText: input.level,
                severityNumber: input.level === "ERROR" ? 17 : 13,
                body: { stringValue: input.message },
                attributes: attributesToOtlp(input.attributes ?? {}),
              },
            ],
          },
        ],
      },
    ],
  };
}

function postBrowserLog(input: BrowserLogInput) {
  const payload = makeBrowserLogsPayload(input);
  const logsUrl = resolvePrimaryEnvironmentHttpUrl("/api/observability/v1/logs");
  return runtime.runPromiseExit(
    HttpClient.post(logsUrl, {
      body: HttpBody.jsonUnsafe(payload),
    }),
  );
}

function sendBrowserLog(input: BrowserLogInput) {
  void postBrowserLog(input).catch(() => undefined);
}

function logConsoleCall(level: BrowserLogLevel, method: "warn" | "error", args: Array<unknown>) {
  sendBrowserLog({
    level,
    message: args.map(stringifyLogPart).join(" "),
    attributes: {
      component: "browser-console",
      "log.source": `console.${method}`,
      "log.argument_count": args.length,
    },
  });
}

function handleWindowError(event: ErrorEvent) {
  sendBrowserLog({
    level: "ERROR",
    message: event.error instanceof Error ? stringifyLogPart(event.error) : event.message,
    attributes: {
      component: "browser-window",
      "log.source": "window.onerror",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent) {
  sendBrowserLog({
    level: "ERROR",
    message: stringifyLogPart(event.reason),
    attributes: {
      component: "browser-window",
      "log.source": "unhandledrejection",
    },
  });
}

export function configureClientLogging(): void {
  if (configured || typeof window === "undefined") {
    return;
  }
  configured = true;
  originalWarn = console.warn;
  originalError = console.error;

  console.warn = (...args: Array<unknown>) => {
    originalWarn?.(...args);
    logConsoleCall("WARN", "warn", args);
  };
  console.error = (...args: Array<unknown>) => {
    originalError?.(...args);
    logConsoleCall("ERROR", "error", args);
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
}

export async function __resetClientLoggingForTests() {
  if (originalWarn) console.warn = originalWarn;
  if (originalError) console.error = originalError;
  originalWarn = null;
  originalError = null;
  if (typeof window !== "undefined") {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }
  configured = false;
  await Promise.resolve();
}
