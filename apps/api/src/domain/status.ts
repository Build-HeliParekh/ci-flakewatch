// Statuses, quarantine source, and scopes (SPEC §7, REQ-QUA-03, REQ-QUA-04, REQ-STA-03).
// Pure functions; inputs are for a single test case in one scope.
import {
  ALL_BRANCHES,
  WINDOWS,
  type QuarantineSource,
  type Scope,
  type Status,
} from "@flakewatch/shared";
import { compareCodePoints, type CommitSummary } from "./detector.js";
import type { ScopeCounts } from "./stats.js";

export interface StatusRules {
  /** QUARANTINE_THRESHOLD, inclusive (REQ-CLS-02). */
  quarantineThreshold: number;
  /** QUARANTINE_MIN_COMMITS (REQ-CLS-02). */
  quarantineMinCommits: number;
  /** BROKEN_MIN_COMMITS (REQ-CLS-01). */
  brokenMinCommits: number;
}

/**
 * Broken: the most recent `brokenMinCommits` commits all have only failed decisive results
 * (REQ-CLS-01). `commits` is ordered oldest first, as returned by `summarizeCommits`.
 */
export function isBroken(commits: readonly CommitSummary[], brokenMinCommits: number): boolean {
  if (brokenMinCommits < 1 || commits.length < brokenMinCommits) return false;
  return commits.slice(-brokenMinCommits).every((commit) => commit.outcome === "failed");
}

/** flakeRate ≥ threshold AND commitsRun ≥ minimum commits (REQ-CLS-02). */
export function meetsAutoQuarantine(counts: ScopeCounts, rules: StatusRules): boolean {
  return (
    counts.commitsRun >= rules.quarantineMinCommits && counts.flakeRate >= rules.quarantineThreshold
  );
}

/** The REQ-QUA-03 table: auto + manual → both, one → that one, neither → null. */
export function quarantineSourceOf(auto: boolean, manual: boolean): QuarantineSource | null {
  if (auto && manual) return "both";
  if (auto) return "auto";
  if (manual) return "manual";
  return null;
}

export interface StatusInput {
  counts: ScopeCounts;
  commits: readonly CommitSummary[];
  /** Whether the test case is manually quarantined (applies to every scope). */
  manual: boolean;
  rules: StatusRules;
}

/**
 * The status in one scope, first match wins: broken → quarantined → flaky → stable, or `null`
 * when the scope has no data (REQ-CLS-05). `quarantineSource` describes which quarantine
 * conditions hold, regardless of the status (REQ-QUA-03). A manually quarantined test case
 * with no data has status `null` and source `manual` (accepted in the T-14 test review).
 */
export function resolveStatus(input: StatusInput): {
  status: Status | null;
  quarantineSource: QuarantineSource | null;
} {
  const { counts, commits, manual, rules } = input;
  const auto = meetsAutoQuarantine(counts, rules);
  const quarantineSource = quarantineSourceOf(auto, manual);

  let status: Status | null;
  if (counts.commitsRun === 0) status = null;
  else if (isBroken(commits, rules.brokenMinCommits)) status = "broken";
  else if (auto || manual) status = "quarantined";
  else if (counts.flakyCommits > 0) status = "flaky";
  else status = "stable";

  return { status, quarantineSource };
}

/**
 * Every scope for a test case: {7d, 30d} × (its branches ∪ {*}), sorted by window (7d first),
 * then branch (`*` first, then code-point order) (REQ-STA-03, REQ-API-05).
 */
export function scopesFor(branchesWithResults: readonly string[]): Scope[] {
  const branches = [...new Set(branchesWithResults)]
    .filter((branch) => branch !== ALL_BRANCHES)
    .sort(compareCodePoints);
  return WINDOWS.flatMap((window) =>
    [ALL_BRANCHES, ...branches].map((branch): Scope => ({ window, branch })),
  );
}
