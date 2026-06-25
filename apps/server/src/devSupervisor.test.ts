// @effect-diagnostics nodeBuiltinImport:off - Dev supervisor tests exercise a local HTTP control endpoint.
import * as NodeHttp from "node:http";
import { describe, expect, it } from "vite-plus/test";

interface RestartControlServerHandle {
  readonly url: string;
  readonly close: () => Promise<void>;
}

interface DevSupervisorModule {
  readonly isAuthorizedRestartRequest: (
    authorization: string | undefined,
    token: string,
  ) => boolean;
  readonly parseRestartRequestMode: (body: string) => string;
  readonly resolveBackendHttpBaseUrl: (
    env: Record<string, string | undefined>,
    defaultPort?: number,
  ) => string | null;
  readonly resolveDevChangePolicy: (
    env: Record<string, string | undefined>,
    defaultPolicy?: "manual" | "auto",
  ) => "manual" | "auto";
  readonly resolveRuntimeRestartRequiredUrl: (baseUrl: string | null) => string | null;
  readonly shouldWatchPath: (path: string) => boolean;
  readonly startRestartControlServer: (input: {
    readonly token: string;
    readonly onRestart: (input: { readonly reason: string }) => void;
  }) => Promise<RestartControlServerHandle>;
}

async function loadSupervisor(): Promise<DevSupervisorModule> {
  return (await import(
    new URL("../scripts/dev-supervisor.mjs", import.meta.url).href
  )) as DevSupervisorModule;
}

function postJson(
  url: string,
  input: {
    readonly headers?: Record<string, string>;
    readonly body?: string;
  } = {},
): Promise<{ readonly status: number; readonly body: string }> {
  return new Promise((resolve, reject) => {
    const request = NodeHttp.request(
      url,
      {
        method: "POST",
        headers: input.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    request.end(input.body);
  });
}

describe("server dev supervisor", () => {
  it("resolves manual policy from default and legacy alias while preserving explicit auto", async () => {
    const supervisor = await loadSupervisor();

    expect(supervisor.resolveDevChangePolicy({}, "manual")).toBe("manual");
    expect(
      supervisor.resolveDevChangePolicy({
        T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE: "1",
      }),
    ).toBe("manual");
    expect(
      supervisor.resolveDevChangePolicy({
        T3CODE_DEV_CHANGE_POLICY: "auto",
        T3CODE_DESKTOP_DISABLE_RESTART_ON_CHANGE: "1",
      }),
    ).toBe("auto");
  });

  it("filters source changes without reacting to build artifacts", async () => {
    const supervisor = await loadSupervisor();

    expect(supervisor.shouldWatchPath("/repo/apps/server/src/bin.ts")).toBe(true);
    expect(supervisor.shouldWatchPath("/repo/apps/server/dist/bin.mjs")).toBe(false);
    expect(supervisor.shouldWatchPath("/repo/node_modules/pkg/index.ts")).toBe(false);
  });

  it("resolves the runtime restart notification endpoint", async () => {
    const supervisor = await loadSupervisor();

    expect(
      supervisor.resolveRuntimeRestartRequiredUrl(
        supervisor.resolveBackendHttpBaseUrl({ T3CODE_PORT: "4012" }),
      ),
    ).toBe("http://127.0.0.1:4012/.well-known/t3/runtime/restart-required");
    expect(
      supervisor.resolveRuntimeRestartRequiredUrl(
        supervisor.resolveBackendHttpBaseUrl({ VITE_HTTP_URL: "http://localhost:5000/api" }),
      ),
    ).toBe("http://localhost:5000/.well-known/t3/runtime/restart-required");
  });

  it("authorizes only matching bearer tokens", async () => {
    const supervisor = await loadSupervisor();

    expect(supervisor.isAuthorizedRestartRequest("Bearer secret-token", "secret-token")).toBe(true);
    expect(supervisor.isAuthorizedRestartRequest("Bearer wrong-token", "secret-token")).toBe(false);
    expect(supervisor.isAuthorizedRestartRequest(undefined, "secret-token")).toBe(false);
  });

  it("serves loopback restart requests and rejects unauthorized callers", async () => {
    const supervisor = await loadSupervisor();
    const restarts: Array<string> = [];
    const controlServer = await supervisor.startRestartControlServer({
      token: "secret-token",
      onRestart: (input) => {
        restarts.push(input.reason);
      },
    });

    try {
      const unauthorized = await postJson(`${controlServer.url}/restart`, {
        headers: { Authorization: "Bearer wrong-token" },
      });
      expect(unauthorized.status).toBe(401);

      const unsupported = await postJson(`${controlServer.url}/restart`, {
        headers: {
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "server-only" }),
      });
      expect(unsupported.status).toBe(400);

      const accepted = await postJson(`${controlServer.url}/restart`, {
        headers: {
          Authorization: "Bearer secret-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "full-setup", reason: "safe point" }),
      });
      expect(accepted.status).toBe(202);
      expect(restarts).toEqual(["safe point"]);
    } finally {
      await controlServer.close();
    }
  });
});
