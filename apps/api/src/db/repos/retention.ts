// Deleting old attempts (REQ-RET-01). Test cases and manual quarantines are kept.
import type { Db } from "../open.js";

export interface RetentionCounts {
  attemptsDeleted: number;
  resultsDeleted: number;
  runsDeleted: number;
}

/** Deletes attempts that started before `cutoffMs`, their results, and runs left empty. */
export function deleteAttemptsBefore(db: Db, cutoffMs: number): RetentionCounts {
  return db.transaction((): RetentionCounts => {
    const resultsDeleted = db
      .prepare(
        "DELETE FROM results WHERE attempt_pk IN (SELECT id FROM attempts WHERE started_at_ms < ?)",
      )
      .run(cutoffMs).changes;
    const attemptsDeleted = db
      .prepare("DELETE FROM attempts WHERE started_at_ms < ?")
      .run(cutoffMs).changes;
    const runsDeleted = db
      .prepare(
        "DELETE FROM runs WHERE NOT EXISTS (SELECT 1 FROM attempts WHERE attempts.run_pk = runs.id)",
      )
      .run().changes;
    return { attemptsDeleted, resultsDeleted, runsDeleted };
  })();
}
