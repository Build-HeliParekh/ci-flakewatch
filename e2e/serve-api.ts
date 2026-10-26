// The API for end-to-end tests: a fresh database with ShopLite loaded directly (no HTTP), then
// the real server. Playwright waits for /api/v1/health, so tests start only once data is in.
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate, openDb } from "../apps/api/src/db/open.js";
import { parseJUnit } from "../apps/api/src/ingest/junit.js";
import { ingestUpload } from "../apps/api/src/ingest/service.js";
import { startServer } from "../apps/api/src/server.js";
import { generateScenario, toJUnitXml } from "../tools/seed/src/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(root, "..", "data", "e2e.db");
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${file}${suffix}`, { force: true });

const db = openDb(file);
migrate(db);
for (const attempt of generateScenario()) {
  const parsed = parseJUnit(toJUnitXml(attempt));
  if (!parsed.ok) throw new Error(parsed.message);
  ingestUpload(
    db,
    {
      repo: attempt.repo,
      branch: attempt.branch,
      commitSha: attempt.commitSha,
      runId: attempt.runId,
      attempt: attempt.attempt,
      startedAt: `${attempt.startedAt.toISOString().slice(0, 19)}Z`,
    },
    parsed.cases,
  );
}
db.close();

const server = await startServer({
  ...process.env,
  DATABASE_PATH: file,
  PORT: process.env["E2E_API_PORT"] ?? "4010",
  FLAKEWATCH_NOW: "2026-10-24T00:00:00Z",
});
console.log(`e2e api on ${server.port}`);
