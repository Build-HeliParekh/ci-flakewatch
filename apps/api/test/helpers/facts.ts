// insertFacts: writes results straight into the database, without the upload path, so
// statistics tests don't depend on ingestion (PLAN §3.7).
//
// Each row is one result. Runs, attempts, and test cases are created on first use and reused
// when a later row names the same (repo, runId), (run, attempt), or test case identity.
import type { ResultStatus } from "@flakewatch/shared";
import type { Db } from "../../src/db/open.js";

export interface FactRow {
  repo?: string; // default "demo/shoplite"
  runId: string;
  attempt?: number; // default 1
  commitSha: string; // 40 lower-case hex characters
  branch?: string; // default "main"
  startedAt: string; // ISO 8601 date-time
  file?: string; // default "tests/example.test.ts"
  classname?: string; // default ""
  name: string;
  status: ResultStatus;
  durationMs?: number; // default 100
  message?: string | null; // default null
}

export function insertFacts(db: Db, rows: readonly FactRow[]): void {
  const findRun = db.prepare<[string, string], { id: number }>(
    "SELECT id FROM runs WHERE repo = ? AND run_id = ?",
  );
  const insertRun = db.prepare(
    "INSERT INTO runs (repo, run_id, commit_sha, branch) VALUES (?, ?, ?, ?)",
  );
  const findAttempt = db.prepare<[number, number], { id: number }>(
    "SELECT id FROM attempts WHERE run_pk = ? AND attempt = ?",
  );
  const insertAttempt = db.prepare(
    "INSERT INTO attempts (run_pk, attempt, started_at_ms) VALUES (?, ?, ?)",
  );
  const findCase = db.prepare<[string, string, string, string], { id: number }>(
    "SELECT id FROM test_cases WHERE repo = ? AND file = ? AND classname = ? AND name = ?",
  );
  const insertCase = db.prepare(
    "INSERT INTO test_cases (repo, file, classname, name) VALUES (?, ?, ?, ?)",
  );
  const nextPosition = db.prepare<[number], { next: number }>(
    "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM results WHERE attempt_pk = ?",
  );
  const insertResult = db.prepare(
    "INSERT INTO results (attempt_pk, test_case_id, position, status, duration_ms, message) VALUES (?, ?, ?, ?, ?, ?)",
  );

  const idOf = (row: { id: number | bigint } | undefined, inserted: () => number | bigint) =>
    Number(row ? row.id : inserted());

  db.transaction(() => {
    for (const row of rows) {
      const repo = row.repo ?? "demo/shoplite";
      const runPk = idOf(
        findRun.get(repo, row.runId),
        () => insertRun.run(repo, row.runId, row.commitSha, row.branch ?? "main").lastInsertRowid,
      );
      const attempt = row.attempt ?? 1;
      const attemptPk = idOf(
        findAttempt.get(runPk, attempt),
        () => insertAttempt.run(runPk, attempt, Date.parse(row.startedAt)).lastInsertRowid,
      );
      const file = row.file ?? "tests/example.test.ts";
      const classname = row.classname ?? "";
      const caseId = idOf(
        findCase.get(repo, file, classname, row.name),
        () => insertCase.run(repo, file, classname, row.name).lastInsertRowid,
      );
      const position = nextPosition.get(attemptPk)?.next ?? 1;
      insertResult.run(
        attemptPk,
        caseId,
        position,
        row.status,
        row.durationMs ?? 100,
        row.message ?? null,
      );
    }
  })();
}

/** The id of a test case by name (and optionally repo and file), for assertions. */
export function testCaseId(db: Db, name: string, repo = "demo/shoplite"): number {
  const row = db
    .prepare<[string, string], { id: number }>(
      "SELECT id FROM test_cases WHERE repo = ? AND name = ? ORDER BY id LIMIT 1",
    )
    .get(repo, name);
  if (!row) throw new Error(`No test case named "${name}" in ${repo}`);
  return row.id;
}
