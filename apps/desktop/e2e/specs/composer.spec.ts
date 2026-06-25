import { expect, test } from "../support/electronHarness.ts";
import { addAndOpenFixtureProject, createWorkspaceFixture } from "../support/workspaceFixture.ts";

test("composer slash commands and model command render @smoke", async ({ harness, page }) => {
  const fixture = await createWorkspaceFixture({ parentDir: harness.rootDir });
  await addAndOpenFixtureProject(harness, fixture);

  const editor = page.getByTestId("composer-editor");
  await editor.click();
  await page.keyboard.type("/");

  await expect(page.locator('[data-composer-item-id="menu-section:commands"]')).toContainText(
    "Commands",
  );
  await page.locator('[data-composer-item-id="menu-section:commands"]').click();

  await expect(page.locator('[data-composer-item-id="slash:model"]')).toContainText("/model");
  await expect(page.locator('[data-composer-item-id="slash:plan"]')).toContainText("/plan");
  await expect(page.locator('[data-composer-item-id="slash:default"]')).toContainText("/default");

  await page.locator('[data-composer-item-id="slash:plan"]').click();
  const expandedPlanToggle = page.getByRole("button", {
    name: "Plan mode — click to return to normal build mode",
  });
  if (await expandedPlanToggle.isVisible().catch(() => false)) {
    await expect(expandedPlanToggle).toBeVisible();
    await expect(page.getByRole("button", { name: "Plan" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Default mode — click to enter plan mode" }),
    ).toHaveCount(0);
  } else {
    await page.getByRole("button", { name: "More composer controls" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Plan" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Escape");
  }

  await editor.click();
  await page.keyboard.type("/model");
  await page.locator('[data-composer-item-id="slash:model"]').click();
  await expect(page.getByPlaceholder("Search models...")).toBeVisible();

  await page.keyboard.press("Escape");
  await editor.click();
  await page.keyboard.type("/review");
  await expect(page.locator('[data-composer-item-id="message-template:review"]')).toContainText(
    "Review changes",
  );

  await page.keyboard.press("Escape");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("@tracked");
  await expect(page.locator('[data-composer-item-id="path:file:tracked.txt"]')).toContainText(
    "tracked.txt",
  );
});
