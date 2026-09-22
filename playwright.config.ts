import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 120000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.TMM_TEST_URL || "http://127.0.0.1:3000",
    ...devices["Desktop Chrome"],
  },
  reporter: "list",
});
