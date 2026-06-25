import { buildPairingPageUrl } from "@t3tools/shared/advertisedEndpoint";

import { expect, test } from "../support/electronHarness.ts";
import { requireTailscaleMutationAllowed, skipOrFailForPreflight } from "../support/preflight.ts";

test("path-prefixed Tailscale endpoint is used for pairing URLs @full", async ({
  harness,
  page,
}) => {
  const preflight = await requireTailscaleMutationAllowed();
  skipOrFailForPreflight(preflight);
  test.skip(!preflight.ok, preflight.reason);

  const servePath = `/t3code-e2e-${harness.runId}`;
  harness.registerTailscaleServePath(servePath);
  await harness.goto("/settings/connections");
  await expect(page.getByLabel("Tailscale HTTPS path")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Tailscale HTTPS path").fill(servePath);
  await page.getByRole("button", { name: "Apply and restart" }).click();
  const relaunchedPage = await harness.waitForRelaunch();
  await harness.goto("/settings/connections");

  await expect(relaunchedPage.getByText("Browser access")).toBeVisible({ timeout: 60_000 });
  await expect(relaunchedPage.locator(`[title*="${servePath}/"]`).first()).toBeVisible();
  await expect(relaunchedPage.getByRole("button", { name: "Copy" }).first()).toBeVisible();
  await expect(relaunchedPage.getByRole("button", { name: "Test" }).first()).toBeVisible();
  await expect(
    relaunchedPage.getByRole("button", { name: "Show Tailscale browser URL QR code" }),
  ).toBeVisible();

  const accessState = await relaunchedPage.evaluate(async () => {
    return await window.desktopBridge?.getTailscaleAccessState();
  });
  expect(accessState?.enabled).toBe(true);
  expect(accessState?.httpsUrl).toContain(`${servePath}/`);

  const endpoints = await relaunchedPage.evaluate(async () => {
    return await window.desktopBridge?.getAdvertisedEndpoints();
  });
  const endpoint = endpoints?.find((candidate) => candidate.httpBaseUrl.includes(`${servePath}/`));
  expect(endpoint, `Expected a Tailscale endpoint under ${servePath}`).toBeTruthy();
  expect(endpoint!.httpBaseUrl).toContain(`${servePath}/`);

  const pairingUrl = buildPairingPageUrl(endpoint!.httpBaseUrl, "e2e-token");
  expect(pairingUrl).toContain(`${servePath}/pair`);
  expect(pairingUrl).toContain("#token=e2e-token");
});
