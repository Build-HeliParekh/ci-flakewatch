// Write queries for uploads (PLAN §3.4). Called inside the ingest transaction.
import type { ResultStatus } from "@flakewatch/shared";
import type { Db } from "../open.js";

export interface RunRow {
  id: number;
  commitSha: string;
  branch: string;
}

export function findRun(db: Db, repo: string, runId: string): RunRow | undefined {
  return db
    .prepare<[string, string], RunRow>(
      "SELECT id, commit_sha AS commitSha, branch FROM runs WHERE repo = ? AND run_id = ?",
    )
    .get(repo, runId);
}

export function insertRun(
  db: Db,
  run: { repo: string; runId: string; commitSha: string; branch: string },
): number {
  return Number(
    db
      .prepare("INSERT INTO runs (repo, run_id, commit_sha, branch) VALUES (?, ?, ?, ?)")
      .run(run.repo, run.runId, run.commitSha, run.branch).lastInsertRowid,
  );
}

export function updateRun(db: Db, runPk: number, commitSha: string, branch: string): void {
  db.prepare("UPDATE runs SET commit_sha = ?, branch = ? WHERE id = ?").run(
    commitSha,
    branch,
    runPk,
  );
}

/** Attempt numbers stored for a run, other than `exceptAttempt`. */
export function countOtherAttempts(db: Db, runPk: number, exceptAttempt: number): number {
  return (
    db
      .prepare<[number, number], { n: number }>(
        "SELECT COUNT(*) AS n FROM attempts WHERE run_pk = ? AND attempt <> ?",
      )
      .get(runPk, exceptAttempt)?.n ?? 0
  );
}

export function findAttempt(db: Db, runPk: number, attempt: number): number | undefined {
  return db
    .prepare<[number, number], { id: number }>(
      "SELECT id FROM attempts WHERE run_pk = ? AND attempt = ?",
    )
    .get(runPk, attempt)?.id;
}

export function insertAttempt(db: Db, runPk: number, attempt: number, startedAtMs: number): number {
  return Number(
    db
      .prepare("INSERT INTO attempts (run_pk, attempt, started_at_ms) VALUES (?, ?, ?)")
      .run(runPk, attempt, startedAtMs).lastInsertRowid,
  );
}

/** Replaces an attempt's metadata and removes its results, keeping its id (PQ-13). */
export function resetAttempt(db: Db, attemptPk: number, startedAtMs: number): void {
  db.prepare("UPDATE attempts SET started_at_ms = ? WHERE id = ?").run(startedAtMs, attemptPk);
  db.prepare("DELETE FROM results WHERE attempt_pk = ?").run(attemptPk);
}

/** A function returning the test case id for an identity, creating it on first use. */
export function testCaseIds(
  db: Db,
  repo: string,
): (file: string, classname: string, name: string) => number {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO test_cases (repo, file, classname, name) VALUES (?, ?, ?, ?)",
  );
  const select = db.prepare<[string, string, string, string], { id: number }>(
    "SELECT id FROM test_cases WHERE repo = ? AND file = ? AND classname = ? AND name = ?",
  );
  const cache = new Map<string, number>();
  return (file, classname, name) => {
    const key = JSON.stringify([file, classname, name]);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    insert.run(repo, file, classname, name);
    const id = select.get(repo, file, classname, name)?.id;
    if (id === undefined) throw new Error("test case was not stored");
    cache.set(key, id);
    return id;
  };
}

export function resultInserter(db: Db) {
  const insert = db.prepare(
    "INSERT INTO results (attempt_pk, test_case_id, position, status, duration_ms, message) VALUES (?, ?, ?, ?, ?, ?)",
  );
  return (row: {
    attemptPk: number;
    testCaseId: number;
    position: number;
    status: ResultStatus;
    durationMs: number;
    message: string | null;
  }) =>
    insert.run(
      row.attemptPk,
      row.testCaseId,
      row.position,
      row.status,
      row.durationMs,
      row.message,
    );
}
