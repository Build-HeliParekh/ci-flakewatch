// End-to-end tests (PLAN §3.5, T-32 to T-34). Playwright starts its own API, with ShopLite
// loaded and FLAKEWATCH_NOW = --end, and the built dashboard (decision PQ-20).
import { defineConfig, devices } from "@playwright/test";

const API_PORT = 4010;
const WEB_PORT = 4174;
// Optional: a Chromium already on the machine (CI installs its own).
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_PATH"];

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["junit", { outputFile: "../reports/junit/e2e.xml" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: [
    {
      command: "node --import tsx serve-api.ts",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: { E2E_API_PORT: String(API_PORT) },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
      command: `npm run build && npx vite preview --port ${WEB_PORT} --strictPort`,
      cwd: "../apps/web",
      url: `http://localhost:${WEB_PORT}`,
      env: { FLAKEWATCH_API_PROXY: `http://localhost:${API_PORT}` },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
