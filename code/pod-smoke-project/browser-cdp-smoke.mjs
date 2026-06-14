#!/usr/bin/env node

import { createRequire } from "node:module";

const require = createRequire("/workspace/code/pod-smoke-project/");
const { chromium } = require("playwright");

const cdpPort = process.env.CDP_PORT || "9224";
const cdpUrl = process.env.CDP_URL || `http://127.0.0.1:${cdpPort}`;
const screenshotPath =
  process.env.BROWSER_SCREENSHOT_PATH || "/tmp/browser-cdp-smoke.png";

const browser = await chromium.connectOverCDP(cdpUrl);

try {
  const contexts = browser.contexts();
  console.log(`Connected to ${cdpUrl}`);
  console.log(`Contexts: ${contexts.length}`);

  for (const [contextIndex, context] of contexts.entries()) {
    const pages = context.pages();
    console.log(`Context ${contextIndex}: ${pages.length} page(s)`);

    for (const [pageIndex, page] of pages.entries()) {
      const url = page.url();
      const title = await page.title().catch(() => "<unavailable>");
      console.log(`  Page ${pageIndex}: ${title} :: ${url}`);
    }
  }

  const page = contexts[0]?.pages()[0];
  if (!page) {
    throw new Error("No existing page is available on the CDP browser context.");
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Screenshot saved to ${screenshotPath}`);
} finally {
  await browser.close();
}
