#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire("/workspace/code/pod-smoke-project/");
const { chromium } = require("playwright");

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: process.env.HEADLESS !== "false",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  const targetUrl = process.env.BROWSER_TARGET_URL || "https://example.com";
  const screenshotPath =
    process.env.BROWSER_SCREENSHOT_PATH || "/tmp/browser-playwright-smoke.png";

  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  console.log(`Loaded ${page.url()}`);
  console.log(`Title: ${await page.title()}`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved to ${screenshotPath}`);
} finally {
  await browser.close();
}
