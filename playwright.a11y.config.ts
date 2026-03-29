import { defineConfig, devices } from "@playwright/test";

const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/a11y",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: "npm start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
    },
  },
});
