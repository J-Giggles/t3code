import { describe, expect, it } from "vitest";

import { resolveDevProxyRoutes } from "./devProxyPaths";

describe("resolveDevProxyRoutes", () => {
  it("returns root development proxy routes without a public prefix", () => {
    expect(resolveDevProxyRoutes(undefined)).toEqual([
      { path: "/.well-known", websocket: false },
      { path: "/api", websocket: false },
      { path: "/attachments", websocket: false },
      { path: "/ws", websocket: true },
    ]);
  });

  it("adds equivalent public-path proxy routes for path-served Vite apps", () => {
    expect(resolveDevProxyRoutes("/staging/")).toEqual([
      { path: "/.well-known", websocket: false },
      { path: "/api", websocket: false },
      { path: "/attachments", websocket: false },
      { path: "/ws", websocket: true },
      { path: "/staging/.well-known", websocket: false },
      { path: "/staging/api", websocket: false },
      { path: "/staging/attachments", websocket: false },
      { path: "/staging/ws", websocket: true },
    ]);
  });
});
