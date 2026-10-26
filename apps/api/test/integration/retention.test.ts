import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { migrate, openDb } from "../../src/db/open.js";
import { upsertManual } from "../../src/db/repos/quarantine.js";
import { runRetention, scheduleRetention } from "../../src/retention.js";
import { fixedClock } from "../../src/clock.js";
import { loadConfig } from "../../src/config.js";
import { jsonLogger } from "../../src/logger.js";
import { createTestDb, tmpDbPath } from "../helpers/db.js";
import { insertFacts, testCaseId } from "../helpers/facts.js";
import { counts } from "../helpers/upload.js";

const NOW = new Date("2026-10-24T00:00:00Z");
const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();
const sha = (label: string) => Buffer.from(label).toString("hex").padEnd(40, "0").slice(0, 40);

describe("retention", () => {
  it("REQ-RET-01: with RETENTION_DAYS=90, an attempt from 91 days ago and its results are deleted; the test case is kept", () => {
    const db = createTestDb();
    insertFacts(db, [
      { runId: "old", commitSha: sha("old"), startedAt: ago(91), name: "a", status: "failed" },
      { runId: "old", commitSha: sha("old"), startedAt: ago(91), name: "b", status: "passed" },
      { runId: "new", commitSha: sha("new"), startedAt: ago(89), name: "b", status: "passed" },
    ]);
    const result = runRetention(db, NOW, 90);
    expect(result).toEqual({ attemptsDeleted: 1, resultsDeleted: 2, runsDeleted: 1 });
    expect(counts(db)).toEqual({ runs: 1, attempts: 1, testCases: 2, results: 1 });
    expect(() => testCaseId(db, "a")).not.toThrow();
  });

  it("REQ-RET-01: an attempt exactly 90 × 24h old is kept; a run keeps its newer attempts", () => {
    const db = createTestDb();
    insertFacts(db, [
      { runId: "edge", commitSha: sha("edge"), startedAt: ago(90), name: "a", status: "passed" },
      {
        runId: "mixed",
        attempt: 1,
        commitSha: sha("mixed"),
        startedAt: ago(95),
        name: "a",
        status: "failed",
      },
      {
        runId: "mixed",
        attempt: 2,
        commitSha: sha("mixed"),
        startedAt: ago(1),
        name: "a",
        status: "passed",
      },
    ]);
    expect(runRetention(db, NOW, 90)).toEqual({
      attemptsDeleted: 1,
      resultsDeleted: 1,
      runsDeleted: 0,
    });
    expect(counts(db)).toMatchObject({ runs: 2, attempts: 2 });
  });

  it("REQ-RET-01: manual quarantine records are kept", () => {
    const db = createTestDb();
    insertFacts(db, [
      { runId: "old", commitSha: sha("old"), startedAt: ago(100), name: "a", status: "passed" },
    ]);
    upsertManual(db, testCaseId(db, "a"), "keep me", NOW);
    runRetention(db, NOW, 90);
    expect(db.prepare("SELECT COUNT(*) AS n FROM manual_quarantines").get()).toEqual({ n: 1 });
  });

  it("REQ-RET-01: the server's schedule runs cleanup at start using the clock (PQ-22)", () => {
    const db = createTestDb();
    insertFacts(db, [
      { runId: "old", commitSha: sha("old"), startedAt: ago(50), name: "a", status: "passed" },
    ]);
    const schedule = scheduleRetention({
      db,
      clock: fixedClock("2026-10-24T00:00:00Z"),
      config: loadConfig({ RETENTION_DAYS: "40" }),
      logger: jsonLogger(() => {}),
    });
    schedule.stop();
    expect(counts(db).attempts).toBe(0);
  });

  it("REQ-RET-03: npm run retention deletes old attempts and prints the number deleted", () => {
    const file = tmpDbPath();
    const db = openDb(file);
    migrate(db);
    insertFacts(db, [
      { runId: "a", commitSha: sha("a"), startedAt: ago(120), name: "a", status: "passed" },
      { runId: "b", commitSha: sha("b"), startedAt: ago(100), name: "a", status: "passed" },
      { runId: "c", commitSha: sha("c"), startedAt: ago(10), name: "a", status: "passed" },
    ]);
    db.close();
    const cli = fileURLToPath(new URL("../../src/cli/retention.ts", import.meta.url));
    const output = execFileSync(process.execPath, ["--import", "tsx", cli], {
      env: {
        ...process.env,
        DATABASE_PATH: file,
        FLAKEWATCH_NOW: "2026-10-24T00:00:00Z",
        RETENTION_DAYS: "90",
      },
      encoding: "utf8",
    });
    expect(output).toMatch(/deleted 2 attempts/);
    const after = openDb(file);
    expect(counts(after).attempts).toBe(1);
    after.close();
  });
});
