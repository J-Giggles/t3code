import { expect, test } from "../support/electronHarness.ts";
import { RECOVERY_THREAD_TITLE, seedRecoveryState } from "../support/seedRecoveryState.ts";

test.use({ e2eSeed: { run: seedRecoveryState } });

test("startup renders recovered lifecycle state without a blank shell @smoke", async ({ page }) => {
  await expect(page.getByText(RECOVERY_THREAD_TITLE)).toBeVisible({ timeout: 60_000 });
  await page.getByText(RECOVERY_THREAD_TITLE).click();
  await expect(page.getByRole("button", { name: "Open project Git dashboard" })).toBeVisible();
  await expect(page.getByTestId("composer-editor")).toBeVisible();
  await expect(page.getByText("Pick a thread to continue")).toBeHidden();
});
