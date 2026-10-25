// Per-scope metrics (REQ-STA-02, REQ-STA-07). Facts are for a single test case, already
// narrowed to one scope with `selectScopeFacts`.
import type { BranchScope } from "@flakewatch/shared";
import { notImplemented } from "./not-implemented.js";
import type { ResultFact } from "./types.js";

export interface ScopeCounts {
  commitsRun: number;
  flakyCommits: number;
  flakeRate: number;
  failedAttempts: number;
  unconfirmedFailures: number;
  skippedResults: number;
}

export function computeScopeCounts(scopeFacts: readonly ResultFact[]): ScopeCounts {
  return notImplemented("computeScopeCounts", scopeFacts);
}

/**
 * Latest `startedAt` of any attempt with any result (skipped included) on `branch`, or on all
 * branches for `*`, ignoring the window. `null` if there is none.
 */
export function lastSeenAtMs(facts: readonly ResultFact[], branch: BranchScope): number | null {
  return notImplemented("lastSeenAtMs", facts, branch);
}
