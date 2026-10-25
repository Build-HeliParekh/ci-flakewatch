// Per-scope statistics and test case identity (REQ-STA-02, REQ-STA-07).

export interface ScopeStats {
  commitsRun: number;
  flakyCommits: number;
  /** Unrounded, from 0 to 1 (REQ-STA-04). */
  flakeRate: number;
  failedAttempts: number;
  unconfirmedFailures: number;
  skippedResults: number;
  lastSeenAt: string | null;
}

export interface TestIdentity {
  id: number;
  repo: string;
  file: string;
  classname: string;
  name: string;
}
