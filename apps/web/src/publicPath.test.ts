import { joinPublicPathPrefix } from "@t3tools/shared/publicPath";
import { describe, expect, it } from "vitest";

import {
  readConfiguredPublicBaseUrl,
  readConfiguredPublicOrigin,
  readConfiguredPublicPathPrefix,
  readPublicPathPrefixFromPathname,
} from "./publicPath.ts";

describe("publicPath", () => {
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
});
