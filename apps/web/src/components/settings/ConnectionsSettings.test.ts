import type { DesktopTailscaleServeRouteProbeResult } from "@t3tools/contracts";
import { validateTailscaleServeUiRoute } from "@t3tools/shared/publicPath";
import { describe, expect, it } from "vite-plus/test";

import {
  isTailscaleServeRouteApplyBlocked,
  resolveTailscaleServeRouteStatusLabel,
} from "./ConnectionsSettings";

const conflictProbe: DesktopTailscaleServeRouteProbeResult = {
  status: "conflict",
  available: false,
  owned: false,
  conflict: true,
  servePath: "/qa",
  servePort: 443,
  expectedProxyUrl: "http://127.0.0.1:13853",
  existingProxyUrl: "http://127.0.0.1:13793",
  message:
    "Route /qa is already taken by http://127.0.0.1:13793. This backend expects http://127.0.0.1:13853.",
};

describe("ConnectionsSettings Tailscale route helpers", () => {
  it("marks nested routes invalid", () => {
    const validation = validateTailscaleServeUiRoute("/qa/demo");

    expect(validation).toMatchObject({ valid: false, issue: "nested" });
    expect(
      resolveTailscaleServeRouteStatusLabel({
        isPathValid: false,
        validationMessage: validation.valid ? null : validation.message,
        isChecking: false,
        routeProbe: null,
      }),
    ).toBe("Enter a single path segment, not a nested path.");
  });

  it("labels conflicts as already taken and blocks apply", () => {
    expect(
      resolveTailscaleServeRouteStatusLabel({
        isPathValid: true,
        validationMessage: null,
        isChecking: false,
        routeProbe: conflictProbe,
      }),
    ).toBe("Already taken");
    expect(
      isTailscaleServeRouteApplyBlocked({
        isPathValid: true,
        isChecking: false,
        routeProbe: conflictProbe,
      }),
    ).toBe(true);
  });

  it("allows applying available routes", () => {
    expect(
      isTailscaleServeRouteApplyBlocked({
        isPathValid: true,
        isChecking: false,
        routeProbe: {
          ...conflictProbe,
          status: "available",
          available: true,
          conflict: false,
          existingProxyUrl: null,
          message: "Available",
        },
      }),
    ).toBe(false);
  });
});
