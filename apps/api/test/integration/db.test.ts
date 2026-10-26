// Smoke tests for the schema (T-06). These check infrastructure, so they carry no REQ IDs.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, openDb } from "../../src/db/open.js";
import { createTestDb, tmpDbPath } from "../helpers/db.js";
import { insertFacts, testCaseId } from "../helpers/facts.js";

const SHA = "a".repeat(40);
const count = (db: ReturnType<typeof createTestDb>, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("schema", () => {
  it("creates every table in PLAN §3.6", () => {
    const db = createTestDb();
    const tables = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    expect(tables).toEqual([
      "attempts",
      "manual_quarantines",
      "results",
      "runs",
      "schema_migrations",
      "test_cases",
    ]);
  });

  it("applies migrations once: running migrate again changes nothing", () => {
    const db = createTestDb();
    expect(migrate(db)).toEqual([]);
    expect(count(db, "schema_migrations")).toBe(1);
  });

  it("enables foreign keys", () => {
    const db = createTestDb();
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(() =>
      db
        .prepare(
          "INSERT INTO results (attempt_pk, test_case_id, position, status, duration_ms) VALUES (999, 999, 1, 'passed', 0)",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it("creates the folder for a file database and uses WAL", () => {
    const file = path.join(path.dirname(tmpDbPath()), "nested", "flakewatch.db");
    const db = openDb(file);
    migrate(db);
    expect(existsSync(file)).toBe(true);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    db.close();
  });
});

describe("keys and cascades", () => {
  const rows = [
    {
      runId: "100",
      commitSha: SHA,
      startedAt: "2026-10-23T09:00:00Z",
      name: "a",
      status: "failed",
    },
    {
      runId: "100",
      commitSha: SHA,
      startedAt: "2026-10-23T09:00:00Z",
      name: "b",
      status: "passed",
    },
    {
      runId: "100",
      attempt: 2,
      commitSha: SHA,
      startedAt: "2026-10-23T09:10:00Z",
      name: "a",
      status: "passed",
    },
  ] as const;

  it("insertFacts reuses runs, attempts, and test cases", () => {
    const db = createTestDb();
    insertFacts(db, rows);
    expect(count(db, "runs")).toBe(1);
    expect(count(db, "attempts")).toBe(2);
    expect(count(db, "test_cases")).toBe(2);
    expect(count(db, "results")).toBe(3);
    expect(testCaseId(db, "a")).toBeGreaterThan(0);
  });

  it("keeps a test case's identity unique per (repo, file, classname, name)", () => {
    const db = createTestDb();
    insertFacts(db, rows);
    expect(() =>
      db
        .prepare("INSERT INTO test_cases (repo, file, classname, name) VALUES (?, ?, ?, ?)")
        .run("demo/shoplite", "tests/example.test.ts", "", "a"),
    ).toThrow(/UNIQUE/);
  });

  it("keeps runs unique per (repo, runId) and attempts unique per (run, attempt)", () => {
    const db = createTestDb();
    insertFacts(db, rows);
    expect(() =>
      db
        .prepare("INSERT INTO runs (repo, run_id, commit_sha, branch) VALUES (?, ?, ?, ?)")
        .run("demo/shoplite", "100", SHA, "main"),
    ).toThrow(/UNIQUE/);
    expect(() =>
      db.prepare("INSERT INTO attempts (run_pk, attempt, started_at_ms) VALUES (1, 1, 0)").run(),
    ).toThrow(/UNIQUE/);
  });

  it("deleting an attempt deletes its results; deleting a run deletes its attempts", () => {
    const db = createTestDb();
    insertFacts(db, rows);
    db.prepare("DELETE FROM attempts WHERE attempt = 2").run();
    expect(count(db, "results")).toBe(2);
    db.prepare("DELETE FROM runs").run();
    expect(count(db, "attempts")).toBe(0);
    expect(count(db, "results")).toBe(0);
    expect(count(db, "test_cases")).toBe(2);
  });

  it("rejects invalid values: short SHA, branch *, unknown status, empty name", () => {
    const db = createTestDb();
    const run = db.prepare(
      "INSERT INTO runs (repo, run_id, commit_sha, branch) VALUES ('r/x', ?, ?, ?)",
    );
    expect(() => run.run("1", "abc1234", "main")).toThrow(/CHECK/);
    expect(() => run.run("2", "A".repeat(40), "main")).toThrow(/CHECK/);
    expect(() => run.run("3", SHA, "*")).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare("INSERT INTO test_cases (repo, file, classname, name) VALUES ('r/x', '', '', '')")
        .run(),
    ).toThrow(/CHECK/);
    insertFacts(db, [rows[0]]);
    expect(() =>
      db
        .prepare(
          "INSERT INTO results (attempt_pk, test_case_id, position, status, duration_ms) VALUES (1, 1, 2, 'flaky', 0)",
        )
        .run(),
    ).toThrow(/CHECK/);
  });
});
