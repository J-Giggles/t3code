import { expect, test } from "../support/electronHarness.ts";
import { providerRunAllowed, skipOrFailForPreflight } from "../support/preflight.ts";
import { addAndOpenFixtureProject, createWorkspaceFixture } from "../support/workspaceFixture.ts";

test("real provider prompt runs to ready when explicitly enabled @full", async ({
  harness,
  page,
}) => {
  const preflight = providerRunAllowed();
  skipOrFailForPreflight(preflight);
  test.skip(!preflight.ok, preflight.reason);

  const fixture = await createWorkspaceFixture({ parentDir: harness.rootDir });
  await addAndOpenFixtureProject(harness, fixture);

  await page.getByTestId("composer-editor").click();
  await page.keyboard.type("Reply with one short sentence for an E2E smoke check.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: /Stop/u })).toBeVisible({ timeout: 60_000 });
  await expect(
    page.locator('[data-message-role="assistant"]').filter({ hasText: /\S/u }),
  ).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByRole("button", { name: "Send message" })).toBeVisible({
    timeout: 180_000,
  });
});
