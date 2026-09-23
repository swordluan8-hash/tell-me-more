import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 120000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.TMM_TEST_URL || "http://127.0.0.1:31877",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command:
      "rm -f .data/e2e-archive.json && TMM_STORAGE=local-demo TMM_LOCAL_ARCHIVE_PATH=.data/e2e-archive.json npm run dev --workspace web -- --port 31877",
    url: "http://127.0.0.1:31877",
    reuseExistingServer: true,
    timeout: 120000,
  },
  reporter: "list",
});
