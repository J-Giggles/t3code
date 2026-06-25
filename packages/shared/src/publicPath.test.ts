import { describe, expect, it } from "vitest";

import {
  DEFAULT_PUBLIC_PATH_PREFIX,
  joinPublicPathPrefix,
  normalizePublicPathSegment,
  normalizePublicPathPrefix,
  normalizeTailscaleServeUiRoute,
  readLocalPublicPathPrefixFromPathname,
  resolveWorkspacePublicPathPrefix,
  validateTailscaleServeUiRoute,
} from "./publicPath.ts";

describe("publicPath", () => {
  it("defines the default public path prefix", () => {
    expect(DEFAULT_PUBLIC_PATH_PREFIX).toBe("/t3code");
  });

  it("normalizes empty and root prefixes away", () => {
    expect(normalizePublicPathPrefix(undefined)).toBeUndefined();
    expect(normalizePublicPathPrefix("")).toBeUndefined();
    expect(normalizePublicPathPrefix("/")).toBeUndefined();
  });

  it("normalizes path prefixes to a leading slash without a trailing slash", () => {
    expect(normalizePublicPathPrefix("t3code/")).toBe("/t3code");
    expect(normalizePublicPathPrefix("t3code-main/")).toBe("/t3code-main");
    expect(normalizePublicPathPrefix("/t3code-staging/?ignored=1")).toBe("/t3code-staging");
  });

  it("normalizes single-segment Tailscale UI routes", () => {
    expect(normalizeTailscaleServeUiRoute("/qa")).toBe("/qa");
    expect(normalizeTailscaleServeUiRoute("qa")).toBe("/qa");
    expect(normalizeTailscaleServeUiRoute("/qa-route")).toBe("/qa-route");
    expect(normalizeTailscaleServeUiRoute("QA-Route")).toBe("/qa-route");
  });

  it("rejects invalid Tailscale UI routes", () => {
    expect(validateTailscaleServeUiRoute("/")).toMatchObject({ valid: false, issue: "root" });
    expect(validateTailscaleServeUiRoute("/qa/demo")).toMatchObject({
      valid: false,
      issue: "nested",
    });
    expect(validateTailscaleServeUiRoute("https://host/qa")).toMatchObject({
      valid: false,
      issue: "url",
    });
    expect(validateTailscaleServeUiRoute("/qa?x=1")).toMatchObject({
      valid: false,
      issue: "query",
    });
    expect(validateTailscaleServeUiRoute("/qa#frag")).toMatchObject({
      valid: false,
      issue: "hash",
    });
  });

  it("normalizes workspace slugs for public path defaults", () => {
    expect(normalizePublicPathSegment(" Staging ")).toBe("staging");
    expect(normalizePublicPathSegment("Feature/Pairing URLs")).toBe("feature-pairing-urls");
    expect(resolveWorkspacePublicPathPrefix({ workspaceSlug: "staging" })).toBe("/staging");
    expect(resolveWorkspacePublicPathPrefix({ worktreeRole: "main" })).toBe("/main");
    expect(resolveWorkspacePublicPathPrefix({ devInstance: "t3code-local-staging" })).toBe(
      "/t3code-local-staging",
    );
    expect(resolveWorkspacePublicPathPrefix({})).toBe(DEFAULT_PUBLIC_PATH_PREFIX);
  });

  it("joins paths without double-prefixing", () => {
    expect(joinPublicPathPrefix("/t3code", "/pair")).toBe("/t3code/pair");
    expect(joinPublicPathPrefix("/t3code-main", "/pair")).toBe("/t3code-main/pair");
    expect(joinPublicPathPrefix("/t3code-main", "/t3code-main/pair")).toBe("/t3code-main/pair");
    expect(joinPublicPathPrefix(undefined, "/pair")).toBe("/pair");
  });

  it("detects dynamic local Tailscale prefixes from pathnames", () => {
    expect(readLocalPublicPathPrefixFromPathname("/main/pair")).toBe("/main");
    expect(readLocalPublicPathPrefixFromPathname("/staging/pair")).toBe("/staging");
    expect(readLocalPublicPathPrefixFromPathname("/original")).toBe("/original");
    expect(readLocalPublicPathPrefixFromPathname("/t3code/pair")).toBe("/t3code");
    expect(readLocalPublicPathPrefixFromPathname("/t3code-main/pair")).toBe("/t3code-main");
    expect(readLocalPublicPathPrefixFromPathname("/t3code-staging")).toBe("/t3code-staging");
    expect(readLocalPublicPathPrefixFromPathname("/t3code-tailscale-test/pair")).toBe(
      "/t3code-tailscale-test",
    );
    expect(
      readLocalPublicPathPrefixFromPathname("/dev-staging-upstream-manual-port-20260624/pair"),
    ).toBeUndefined();
    expect(readLocalPublicPathPrefixFromPathname("/t3codeish/pair")).toBeUndefined();
    expect(readLocalPublicPathPrefixFromPathname("/settings")).toBeUndefined();
    expect(readLocalPublicPathPrefixFromPathname("/pair")).toBeUndefined();
  });
});
