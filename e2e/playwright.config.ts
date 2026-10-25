import { defineConfig } from "@playwright/test";

// The API and web servers, seeding, and browsers are configured in T-32 (PLAN §3.5).
export default defineConfig({
  testDir: "./tests",
  reporter: [["list"]],
});
