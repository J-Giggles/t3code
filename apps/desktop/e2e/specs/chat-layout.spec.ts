import { expect, test } from "../support/electronHarness.ts";
import type { Locator, Page } from "playwright/test";
import { CHAT_LAYOUT_THREAD_TITLES, seedChatLayoutState } from "../support/seedChatLayoutState.ts";

test.use({ e2eSeed: { run: seedChatLayoutState } });

async function visibleBox(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 60_000 });
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

function threadRow(page: Page, threadNumber: number) {
  return page.getByTestId(`thread-row-thread-e2e-chat-layout-${threadNumber}`);
}

test("chat layout keeps history, context, composer, and panels reachable @smoke", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(threadRow(page, 1)).toBeVisible({
    timeout: 60_000,
  });
  await threadRow(page, 1).click();

  const composer = page.getByTestId("composer-editor");
  await expect(composer).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Context window 50% used" })).toBeVisible();

  const showMore = page.getByText("Show more", { exact: true }).first();
  if (await showMore.isVisible().catch(() => false)) {
    await showMore.click();
  }
  for (const [index] of CHAT_LAYOUT_THREAD_TITLES.entries()) {
    await expect(threadRow(page, index + 1)).toBeVisible();
  }

  await threadRow(page, 6).click();
  await expect(page).toHaveURL(/thread-e2e-chat-layout-6/u);
  await expect(composer).toBeVisible();

  await threadRow(page, 1).click();
  await expect(page).toHaveURL(/thread-e2e-chat-layout-1/u);

  const overlay = page.locator('[data-chat-composer-overlay="true"]');
  const form = page.locator('[data-chat-composer-form="true"]');
  const initialOverlayBox = await visibleBox(overlay);
  const initialFormBox = await visibleBox(form);
  const initialEditorBox = await visibleBox(composer);
  expect(initialFormBox.y).toBeGreaterThanOrEqual(initialOverlayBox.y);

  await composer.click();
  await page.keyboard.type(
    "This is a long regression prompt that should make the composer grow. ".repeat(20),
  );
  const expandedEditorBox = await visibleBox(composer);
  expect(expandedEditorBox.height).toBeGreaterThan(initialEditorBox.height + 20);

  await page.getByRole("button", { name: "Toggle right panel" }).click();
  await expect(page.locator("[data-right-panel-tabbar]")).toBeVisible();
  await expect(composer).toBeVisible();

  await page.getByRole("button", { name: "Toggle terminal drawer" }).click();
  const terminalDrawer = page.locator('[data-terminal-owner="drawer"]').first();
  await expect(terminalDrawer).toBeVisible({ timeout: 60_000 });

  const drawerBox = await visibleBox(terminalDrawer);
  const formWithDrawerBox = await visibleBox(form);
  expect(formWithDrawerBox.y + formWithDrawerBox.height).toBeLessThanOrEqual(drawerBox.y + 1);
});
