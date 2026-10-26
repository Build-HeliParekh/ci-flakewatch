// Storing one upload, all-or-nothing (REQ-ING-04, 06, 07, 11, 12, 13).
import type { UploadMetadata, UploadSummary } from "@flakewatch/shared";
import type { Db } from "../db/open.js";
import {
  countOtherAttempts,
  findAttempt,
  findRun,
  insertAttempt,
  insertRun,
  resetAttempt,
  resultInserter,
  testCaseIds,
  updateRun,
} from "../db/repos/ingest.js";
import type { ParsedTestCase } from "./junit.js";

export interface IngestOutcome {
  /** `false` when an existing attempt was replaced (REQ-ING-07). */
  created: boolean;
  summary: UploadSummary;
}

/** The upload's commit or branch differs from another stored attempt of its run (REQ-ING-13). */
export class RunConflictError extends Error {
  constructor(readonly field: "commitSha" | "branch") {
    super(`${field} differs from another attempt of the same run`);
  }
}

/** Test-only fault injection (REQ-ING-11). */
export interface IngestHooks {
  beforeInsertResult?(index: number): void;
}

/**
 * Stores an upload in one transaction: the run, the attempt (replacing an existing one with the
 * same number, keeping its id), the test cases by identity, and one result per `<testcase>`,
 * repeated cases included. Throws `RunConflictError`, or anything the database throws; either
 * way nothing is stored.
 */
export function ingestUpload(
  db: Db,
  meta: UploadMetadata,
  cases: readonly ParsedTestCase[],
  hooks: IngestHooks = {},
): IngestOutcome {
  const startedAtMs = Date.parse(meta.startedAt);
  return db.transaction((): IngestOutcome => {
    let runPk: number;
    const run = findRun(db, meta.repo, meta.runId);
    if (run) {
      runPk = run.id;
      const changed = run.commitSha !== meta.commitSha || run.branch !== meta.branch;
      if (changed) {
        // Only another stored attempt pins the run's commit and branch (PQ-13).
        if (countOtherAttempts(db, runPk, meta.attempt) > 0) {
          throw new RunConflictError(run.commitSha !== meta.commitSha ? "commitSha" : "branch");
        }
        updateRun(db, runPk, meta.commitSha, meta.branch);
      }
    } else {
      runPk = insertRun(db, meta);
    }

    let attemptPk = findAttempt(db, runPk, meta.attempt);
    const created = attemptPk === undefined;
    if (attemptPk === undefined) attemptPk = insertAttempt(db, runPk, meta.attempt, startedAtMs);
    else resetAttempt(db, attemptPk, startedAtMs);

    const idOf = testCaseIds(db, meta.repo);
    const insert = resultInserter(db);
    const summary: UploadSummary = {
      attemptId: attemptPk,
      tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };
    cases.forEach((testCase, index) => {
      hooks.beforeInsertResult?.(index);
      insert({
        attemptPk,
        testCaseId: idOf(testCase.file, testCase.classname, testCase.name),
        position: testCase.position,
        status: testCase.status,
        durationMs: testCase.durationMs,
        message: testCase.message,
      });
      summary.tests++;
      summary[testCase.status]++;
    });
    return { created, summary };
  })();
}
