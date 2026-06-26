import { joinPublicPathPrefix } from "@t3tools/shared/publicPath";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readBrowserPublicPathPrefix,
  readConfiguredPublicBaseUrl,
  readConfiguredPublicOrigin,
  readConfiguredPublicPathPrefix,
  readPublicPathPrefixFromPathname,
  resolveBrowserPublicBaseUrl,
} from "./publicPath.ts";

function installBrowser(input: { readonly url: string; readonly metaPublicPath?: string }) {
  vi.stubGlobal("window", {
    location: new URL(input.url),
  });
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector === 'meta[name="t3code-public-path-prefix"]' && input.metaPublicPath
        ? { getAttribute: () => input.metaPublicPath }
        : null,
  });
}

describe("publicPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("detects known local Tailscale path prefixes from pathnames", () => {
    expect(readPublicPathPrefixFromPathname("/main/pair")).toBe("/main");
    expect(readPublicPathPrefixFromPathname("/staging/pair")).toBe("/staging");
    expect(readPublicPathPrefixFromPathname("/original")).toBe("/original");
    expect(readPublicPathPrefixFromPathname("/t3code/pair")).toBe("/t3code");
    expect(readPublicPathPrefixFromPathname("/t3code-main/pair")).toBe("/t3code-main");
    expect(readPublicPathPrefixFromPathname("/t3code-staging")).toBe("/t3code-staging");
    expect(readPublicPathPrefixFromPathname("/t3code-tailscale-test/pair")).toBe(
      "/t3code-tailscale-test",
    );
    expect(readPublicPathPrefixFromPathname("/settings")).toBeUndefined();
    expect(readPublicPathPrefixFromPathname("/pair")).toBeUndefined();
  });

  it("joins browser paths with the active prefix", () => {
    expect(joinPublicPathPrefix("/t3code-main", "/pair")).toBe("/t3code-main/pair");
  });

  it("normalizes configured public base paths from environment", () => {
    expect(
      readConfiguredPublicPathPrefix({
        VITE_T3CODE_PUBLIC_BASE_PATH: "/project/worktree/app/",
      }),
    ).toBe("/project/worktree/app");
    expect(readConfiguredPublicPathPrefix({ VITE_T3CODE_PUBLIC_BASE_PATH: "/" })).toBeUndefined();
  });

  it("reads configured public origin and base URL from environment", () => {
    expect(
      readConfiguredPublicOrigin({
        VITE_T3CODE_PUBLIC_ORIGIN: "https://example.ts.net/",
      }),
    ).toBe("https://example.ts.net");
    expect(
      readConfiguredPublicBaseUrl({
        VITE_T3CODE_PUBLIC_BASE_URL: "https://example.ts.net/project/worktree/app/",
      }),
    ).toBe("https://example.ts.net/project/worktree/app/");
  });

  it("prefers the served browser path over stale compiled environment values", () => {
    vi.stubEnv("VITE_T3CODE_PUBLIC_BASE_PATH", "/main");
    vi.stubEnv("VITE_T3CODE_PUBLIC_BASE_URL", "http://127.0.0.1:8833/main/");
    installBrowser({ url: "https://giggabit.tailfb378a.ts.net/staging/" });

    expect(readBrowserPublicPathPrefix()).toBe("/staging");
    expect(resolveBrowserPublicBaseUrl()).toBe("https://giggabit.tailfb378a.ts.net/staging/");
  });

  it("uses the rewritten public path meta tag before stale browser pathnames", () => {
    vi.stubEnv("VITE_T3CODE_PUBLIC_BASE_PATH", "/main");
    vi.stubEnv("VITE_T3CODE_PUBLIC_BASE_URL", "http://127.0.0.1:8833/main/");
    installBrowser({
      url: "https://giggabit.tailfb378a.ts.net/main/settings",
      metaPublicPath: "/staging",
    });

    expect(readBrowserPublicPathPrefix()).toBe("/staging");
    expect(resolveBrowserPublicBaseUrl()).toBe("https://giggabit.tailfb378a.ts.net/staging/");
  });
});
