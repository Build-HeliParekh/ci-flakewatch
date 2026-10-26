// Manual quarantine records (REQ-QUA-01, REQ-QUA-02). Times are UTC epoch milliseconds.
import type { ManualQuarantine } from "@flakewatch/shared";
import { toApiTimestamp } from "../../http/errors.js";
import type { Db } from "../open.js";

interface Row {
  reason: string;
  atMs: number;
}

const toValue = (row: Row): ManualQuarantine => ({
  reason: row.reason,
  at: toApiTimestamp(new Date(row.atMs)),
});

export function getManual(db: Db, testCaseId: number): ManualQuarantine | null {
  const row = db
    .prepare<[number], Row>(
      "SELECT reason, at_ms AS atMs FROM manual_quarantines WHERE test_case_id = ?",
    )
    .get(testCaseId);
  return row ? toValue(row) : null;
}

/** Creates or replaces the record; `created` is false when one already existed. */
export function upsertManual(
  db: Db,
  testCaseId: number,
  reason: string,
  at: Date,
): { created: boolean; value: ManualQuarantine } {
  return db.transaction(() => {
    const existed = getManual(db, testCaseId) !== null;
    db.prepare(
      `INSERT INTO manual_quarantines (test_case_id, reason, at_ms) VALUES (?, ?, ?)
       ON CONFLICT (test_case_id) DO UPDATE SET reason = excluded.reason, at_ms = excluded.at_ms`,
    ).run(testCaseId, reason, at.getTime());
    return { created: !existed, value: toValue({ reason, atMs: at.getTime() }) };
  })();
}

/** Removes the record; false if there was none. */
export function deleteManual(db: Db, testCaseId: number): boolean {
  return (
    db.prepare("DELETE FROM manual_quarantines WHERE test_case_id = ?").run(testCaseId).changes > 0
  );
}

/** Ids of manually quarantined test cases, optionally in one repo. */
export function listManualIds(db: Db, repo?: string): number[] {
  return db
    .prepare<unknown[], { id: number }>(
      repo === undefined
        ? "SELECT test_case_id AS id FROM manual_quarantines ORDER BY test_case_id"
        : `SELECT m.test_case_id AS id FROM manual_quarantines m
           JOIN test_cases t ON t.id = m.test_case_id WHERE t.repo = ? ORDER BY m.test_case_id`,
    )
    .all(...(repo === undefined ? [] : [repo]))
    .map((row) => row.id);
}
