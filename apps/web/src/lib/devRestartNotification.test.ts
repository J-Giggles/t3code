import { describe, expect, it, vi } from "vite-plus/test";

import {
  postRestartRequired,
  resolveRestartNotificationEndpoint,
  shouldNotifyForViteWatchEvent,
} from "./devRestartNotification";

describe("devRestartNotification", () => {
  it("filters Vite watch events to source-like paths", () => {
    expect(shouldNotifyForViteWatchEvent("change", "/repo/apps/web/src/main.tsx")).toBe(true);
    expect(shouldNotifyForViteWatchEvent("add", "/repo/apps/web/src/index.css")).toBe(true);
    expect(shouldNotifyForViteWatchEvent("unlink", "/repo/apps/web/index.html")).toBe(true);
    expect(shouldNotifyForViteWatchEvent("change", "/repo/apps/web/dist/assets/app.js")).toBe(
      false,
    );
    expect(shouldNotifyForViteWatchEvent("change", "/repo/node_modules/pkg/index.ts")).toBe(false);
    expect(shouldNotifyForViteWatchEvent("addDir", "/repo/apps/web/src/routes")).toBe(false);
  });

  it("builds backend restart notification URLs", () => {
    expect(resolveRestartNotificationEndpoint("http://localhost:13773")).toBe(
      "http://localhost:13773/.well-known/t3/runtime/restart-required",
    );
    expect(resolveRestartNotificationEndpoint("http://localhost:13773/dev/")).toBe(
      "http://localhost:13773/.well-known/t3/runtime/restart-required",
    );
    expect(resolveRestartNotificationEndpoint(undefined)).toBeNull();
    expect(resolveRestartNotificationEndpoint("not a url")).toBeNull();
  });

  it("posts restart-required notifications to the backend", async () => {
    const requests: Array<{
      readonly url: string;
      readonly init: RequestInit | undefined;
    }> = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response("{}", { status: 202 });
    }) as unknown as typeof fetch;

    const posted = await postRestartRequired({
      endpoint: "http://localhost:13773/.well-known/t3/runtime/restart-required",
      token: "secret-token",
      reason: "source changed",
      fetchImpl,
    });

    expect(posted).toBe(true);
    expect(requests).toEqual([
      {
        url: "http://localhost:13773/.well-known/t3/runtime/restart-required",
        init: {
          method: "POST",
          headers: {
            Authorization: "Bearer secret-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: "source changed" }),
        },
      },
    ]);
  });

  it("falls back when no compatible backend credentials are configured", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("{}", { status: 202 }),
    ) as unknown as typeof fetch;

    await expect(
      postRestartRequired({
        endpoint: "http://localhost:13773/.well-known/t3/runtime/restart-required",
        token: undefined,
        reason: "source changed",
        fetchImpl,
      }),
    ).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
