import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sharedSrc = fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url));

// One Vitest project per workspace (PLAN §3.7). `npm test` runs them all once and writes a
// single JUnit report to reports/junit/junit.xml (REQ-CI-03).
export default defineConfig({
  resolve: {
    alias: { "@flakewatch/shared": sharedSrc },
  },
  test: {
    passWithNoTests: true,
    reporters: ["default", "junit"],
    outputFile: { junit: "reports/junit/junit.xml" },
    projects: [
      {
        extends: true,
        test: { name: "shared", root: "packages/shared", include: ["test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "api", root: "apps/api", include: ["test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "web",
          root: "apps/web",
          include: ["test/**/*.test.{ts,tsx}"],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        test: { name: "seed", root: "tools/seed", include: ["test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "spec-check", root: "tools/spec-check", include: ["test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "bench", root: "tools/bench", include: ["test/**/*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "repo", root: ".", include: ["test/**/*.test.ts"] },
      },
    ],
  },
});
