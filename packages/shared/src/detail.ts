// GET /api/v1/tests/:id (REQ-API-05, REQ-QUA-01, REQ-QUA-03).
import type { BranchScope, QuarantineSource, Status, Window } from "./constants.js";
import type { ScopeStats, TestIdentity } from "./stats.js";

export interface ManualQuarantine {
  reason: string;
  at: string;
}

export interface TestScope extends ScopeStats {
  window: Window;
  branch: BranchScope;
  /** `null` when the scope has no data (REQ-CLS-05). */
  status: Status | null;
  quarantineSource: QuarantineSource | null;
}

export interface RecentError {
  commitSha: string;
  branch: string;
  attempt: number;
  startedAt: string;
  message: string;
}

export interface TestDetailResponse extends TestIdentity {
  manualQuarantine: ManualQuarantine | null;
  scopes: TestScope[];
  recentErrors: RecentError[];
}
