// Statuses, quarantine source, and scopes (SPEC §7, REQ-QUA-03, REQ-QUA-04, REQ-STA-03).
// Pure functions; inputs are for a single test case in one scope.
import type { QuarantineSource, Scope, Status } from "@flakewatch/shared";
import type { CommitSummary } from "./detector.js";
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
  return notImplemented("isBroken", commits, brokenMinCommits);
}

/** flakeRate ≥ threshold AND commitsRun ≥ minimum commits (REQ-CLS-02). */
export function meetsAutoQuarantine(counts: ScopeCounts, rules: StatusRules): boolean {
  return notImplemented("meetsAutoQuarantine", counts, rules);
}

/** The REQ-QUA-03 table: auto + manual → both, one → that one, neither → null. */
export function quarantineSourceOf(auto: boolean, manual: boolean): QuarantineSource | null {
  return notImplemented("quarantineSourceOf", auto, manual);
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
 * conditions hold, regardless of the status (REQ-QUA-03).
 */
export function resolveStatus(input: StatusInput): {
  status: Status | null;
  quarantineSource: QuarantineSource | null;
} {
  return notImplemented("resolveStatus", input);
}

/**
 * Every scope for a test case: {7d, 30d} × (its branches ∪ {*}), sorted by window (7d first),
 * then branch (`*` first, then code-point order) (REQ-STA-03, REQ-API-05).
 */
export function scopesFor(branchesWithResults: readonly string[]): Scope[] {
  return notImplemented("scopesFor", branchesWithResults);
}

function notImplemented(name: string, ...args: unknown[]): never {
  throw new Error(`${name} is not implemented yet (T-14b); called with ${args.length} argument(s)`);
}
