// GET /api/v1/summary (REQ-API-04).
import type { BranchScope, Window } from "./constants.js";

export interface SummaryQuery {
  repo?: string;
  branch?: BranchScope;
  window?: Window;
}

export interface SummaryResponse {
  asOf: string;
  broken: number;
  quarantined: number;
  flaky: number;
  stable: number;
  failedAttemptsFromFlakes: number;
}
