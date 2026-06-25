import type { Page } from "playwright/test";

import { expect, test } from "../support/electronHarness.ts";
import { addAndOpenFixtureProject, createWorkspaceFixture } from "../support/workspaceFixture.ts";

async function dismissVisibleNotifications(page: Page) {
  const dismissButtons = page.getByRole("button", { name: "Dismiss notification" });
  for (let index = 0; index < (await dismissButtons.count()); index += 1) {
    const dismissButton = dismissButtons.nth(index);
    if (await dismissButton.isVisible().catch(() => false)) {
      await dismissButton.click();
    }
  }
  await expect(page.locator('[data-slot="toast-portal"] [data-slot="toast-close"]')).toHaveCount(0);
}

test("workspace Git dashboard shows repository metrics and changes @smoke", async ({
  harness,
  page,
}) => {
  const fixture = await createWorkspaceFixture({ parentDir: harness.rootDir });
  await addAndOpenFixtureProject(harness, fixture);

  await dismissVisibleNotifications(page);
  await page.getByRole("button", { name: "Open project Git dashboard" }).click();
  const gitDialog = page.getByRole("dialog");
  await expect(gitDialog.getByText("Project Git")).toBeVisible();
  await expect(gitDialog.getByText("Repos", { exact: true })).toBeVisible();
  await expect(gitDialog.getByText("Worktrees", { exact: true })).toBeVisible();
  await expect(gitDialog.getByText("Dirty").first()).toBeVisible();

  await gitDialog.getByRole("button", { name: "Changes" }).click();
  await expect(gitDialog.getByText("tracked.txt", { exact: true })).toBeVisible();
  await expect(gitDialog.getByText("untracked.txt", { exact: true })).toBeVisible();

  await gitDialog.getByRole("button", { name: "Commits" }).click();
  await expect(gitDialog.getByText("Initial fixture commit")).toBeVisible();

  await gitDialog.getByRole("button", { name: "Overview" }).click();
  await gitDialog.getByRole("button", { name: "Refresh" }).first().click();
  await expect(gitDialog.getByText("Project Git")).toBeVisible();
});
