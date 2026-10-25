// Domain types for detection and statistics (PLAN §3.4). No I/O.
import type { ResultStatus } from "@flakewatch/shared";

/** One stored result with the attempt and run details it belongs to. */
export interface ResultFact {
  testCaseId: number;
  repo: string;
  /** Full 40-character SHA, lower-case. */
  commitSha: string;
  branch: string;
  /** Unique per stored attempt (two runs on one commit have different attemptIds). */
  attemptId: number;
  /** The attempt number within its run: 1, 2, ... */
  attempt: number;
  /** The attempt's `startedAt`, in milliseconds since the epoch (UTC). */
  startedAtMs: number;
  status: ResultStatus;
}

/** A time range `(startExclusiveMs, endInclusiveMs]`. */
export interface TimeRange {
  startExclusiveMs: number;
  endInclusiveMs: number;
}
