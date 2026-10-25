// GET /api/v1/tests/:id/history (REQ-API-06, REQ-STA-05).
import type { BranchScope, CommitOutcome, ResultStatus, Window } from "./constants.js";

export interface HistoryQuery {
  branch?: BranchScope;
  window?: Window;
}

/** One attempt's result for the test case (see PLAN PQ-07). */
export interface HistoryAttempt {
  attempt: number;
  startedAt: string;
  status: ResultStatus;
  durationMs: number;
}

export interface HistoryCommit {
  commitSha: string;
  branches: string[];
  firstStartedAt: string;
  outcome: CommitOutcome;
  rerun: boolean;
  attempts: HistoryAttempt[];
}

export interface TrendPoint {
  /** UTC date, `YYYY-MM-DD`. */
  date: string;
  flakeRate: number | null;
}

export interface HistoryResponse {
  commits: HistoryCommit[];
  trend: TrendPoint[];
}
