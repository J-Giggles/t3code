export const DEV_SOURCE_CHANGED_EVENT = "t3code:dev-source-changed";
export const RUNTIME_RESTART_REQUIRED_PATH = "/.well-known/t3/runtime/restart-required";
export const DEFAULT_DEV_SOURCE_CHANGE_REASON = "T3 Code web source changed.";

const watchedEvents = new Set(["add", "change", "unlink"]);
const watchedExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

export interface DevSourceChangePayload {
  readonly detectedAt: string;
  readonly reason: string;
  readonly sequence: number;
  readonly source: "vite";
}

export interface RestartRequiredPostInput {
  readonly endpoint: string | null;
  readonly token: string | undefined;
  readonly reason: string;
  readonly fetchImpl?: typeof fetch;
}

export function shouldNotifyForViteWatchEvent(event: string, path: string): boolean {
  if (!watchedEvents.has(event)) {
    return false;
  }

  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.includes("/node_modules/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/dist-electron/") ||
    normalized.includes("/.git/") ||
    normalized.includes("/.turbo/") ||
    normalized.includes("/.vite-plus/")
  ) {
    return false;
  }

  const fileName = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (fileName.startsWith(".")) {
    return false;
  }

  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex < 0) {
    return false;
  }

  return watchedExtensions.has(fileName.slice(extensionIndex));
}

export function resolveRestartNotificationEndpoint(httpBaseUrl: string | undefined): string | null {
  const configuredUrl = httpBaseUrl?.trim();
  if (!configuredUrl) {
    return null;
  }

  try {
    return new URL(RUNTIME_RESTART_REQUIRED_PATH, configuredUrl).toString();
  } catch {
    return null;
  }
}

export function createDevSourceChangePayload({
  reason = DEFAULT_DEV_SOURCE_CHANGE_REASON,
  sequence,
}: {
  readonly reason?: string;
  readonly sequence: number;
}): DevSourceChangePayload {
  return {
    detectedAt: new Date().toISOString(),
    reason,
    sequence,
    source: "vite",
  };
}

export async function postRestartRequired({
  endpoint,
  token,
  reason,
  fetchImpl = fetch,
}: RestartRequiredPostInput): Promise<boolean> {
  const normalizedToken = token?.trim();
  if (!endpoint || !normalizedToken) {
    return false;
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${normalizedToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
