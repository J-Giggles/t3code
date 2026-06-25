import { expect, test } from "../support/electronHarness.ts";

test("connections settings render local and remote access controls @smoke", async ({
  harness,
  page,
}) => {
  await harness.goto("/settings/connections");

  await expect(page.getByRole("heading", { name: "This environment" })).toBeVisible();
  await expect(page.getByText("Network access").first()).toBeVisible();
  await expect(page.getByText("Tailscale HTTPS").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Remote environments" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add environment" })).toBeVisible();
});
