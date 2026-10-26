// Per-scope metrics (REQ-STA-02, REQ-STA-07). Facts are for a single test case, already
// narrowed to one scope with `selectScopeFacts`.
import { ALL_BRANCHES, type BranchScope } from "@flakewatch/shared";
import { summarizeCommits, type CommitSummary } from "./detector.js";
import type { ResultFact } from "./types.js";

export interface ScopeCounts {
  /** Commits with at least one decisive result. */
  commitsRun: number;
  /** Commits with both a failed and a passed result (REQ-DET-01). */
  flakyCommits: number;
  /** `flakyCommits / commitsRun`, unrounded, or 0 when there are no commits. */
  flakeRate: number;
  /** Distinct attempts with at least one failed result. */
  failedAttempts: number;
  /** Commits whose decisive results all failed (REQ-STA-07). */
  unconfirmedFailures: number;
  /** Number of skipped results. */
  skippedResults: number;
}

/** `commits` may be passed when already computed with `summarizeCommits(scopeFacts)`. */
export function computeScopeCounts(
  scopeFacts: readonly ResultFact[],
  commits: readonly CommitSummary[] = summarizeCommits(scopeFacts),
): ScopeCounts {
  const flakyCommits = commits.filter((commit) => commit.outcome === "flaky").length;
  const failedAttemptIds = new Set<number>();
  let skippedResults = 0;
  for (const fact of scopeFacts) {
    if (fact.status === "failed") failedAttemptIds.add(fact.attemptId);
    else if (fact.status === "skipped") skippedResults++;
  }

  return {
    commitsRun: commits.length,
    flakyCommits,
    flakeRate: commits.length === 0 ? 0 : flakyCommits / commits.length,
    failedAttempts: failedAttemptIds.size,
    unconfirmedFailures: commits.filter((commit) => commit.outcome === "failed").length,
    skippedResults,
  };
}

/**
 * Latest `startedAt` of any attempt with any result (skipped included) on `branch`, or on all
 * branches for `*`, ignoring the window. `null` if there is none (decision PQ-12a).
 */
export function lastSeenAtMs(facts: readonly ResultFact[], branch: BranchScope): number | null {
  let latest: number | null = null;
  for (const fact of facts) {
    if (branch !== ALL_BRANCHES && fact.branch !== branch) continue;
    if (latest === null || fact.startedAtMs > latest) latest = fact.startedAtMs;
  }
  return latest;
}
