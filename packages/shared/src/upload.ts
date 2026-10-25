// POST /api/v1/results (REQ-ING-01, REQ-ING-12).

export interface UploadMetadata {
  repo: string;
  branch: string;
  /** Full 40-character SHA, lower-case. */
  commitSha: string;
  runId: string;
  attempt: number;
  /** ISO 8601 date-time in UTC. */
  startedAt: string;
}

export interface UploadSummary {
  attemptId: number;
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
}
