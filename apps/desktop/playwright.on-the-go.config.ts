import { defineConfig } from "playwright/test";

const isCi = process.env.CI === "true" || process.env.CI === "1";

export default defineConfig({
  testDir: "./e2e/specs",
  testMatch: "on-the-go.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 480_000,
  expect: {
    timeout: 20_000,
  },
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  outputDir: "./test-results/on-the-go-e2e",
  use: {
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
});
