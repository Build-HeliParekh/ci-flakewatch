// The flake rule and per-commit summaries (REQ-DET-01 to REQ-DET-06).
// All functions take the facts of a **single test case**.
import {
  ALL_BRANCHES,
  type BranchScope,
  type CommitOutcome,
  type ResultStatus,
} from "@flakewatch/shared";
import type { ResultFact, TimeRange } from "./types.js";
import { inRange } from "./windows.js";

/**
 * A commit's outcome from its results for one test case: `flaky` if it has a `failed` and a
 * `passed` result (REQ-DET-01), `failed` if all decisive results failed, `passed` if all passed,
 * and `null` if there is no decisive result. Skipped results are ignored (REQ-DET-02).
 */
export function classifyCommit(statuses: readonly ResultStatus[]): CommitOutcome | null {
  const hasFailed = statuses.includes("failed");
  const hasPassed = statuses.includes("passed");
  if (hasFailed && hasPassed) return "flaky";
  if (hasFailed) return "failed";
  if (hasPassed) return "passed";
  return null;
}

/**
 * The facts in a scope: only `branch` (or every branch for `*`, REQ-DET-04), and only attempts
 * whose `startedAt` is inside `range`. The window applies per attempt, before the flake rule
 * (REQ-DET-06).
 */
export function selectScopeFacts(
  facts: readonly ResultFact[],
  branch: BranchScope,
  range: TimeRange,
): ResultFact[] {
  return facts.filter(
    (fact) =>
      (branch === ALL_BRANCHES || fact.branch === branch) && inRange(fact.startedAtMs, range),
  );
}

export interface CommitSummary {
  commitSha: string;
  /** Earliest `startedAt` of the commit's attempts in these facts. */
  firstStartedAtMs: number;
  outcome: CommitOutcome;
  /** Number of `passed` and `failed` results. */
  decisiveResults: number;
  /** Branches the commit's attempts ran on, sorted. */
  branches: string[];
}

/**
 * One summary per commit with at least one decisive result, oldest first by
 * `firstStartedAtMs`, ties broken by `commitSha` ascending. Results from every run and attempt
 * on the commit are combined (REQ-DET-03); commits with only skipped results are left out.
 */
export function summarizeCommits(scopeFacts: readonly ResultFact[]): CommitSummary[] {
  const byCommit = new Map<string, ResultFact[]>();
  for (const fact of scopeFacts) {
    const group = byCommit.get(fact.commitSha);
    if (group) group.push(fact);
    else byCommit.set(fact.commitSha, [fact]);
  }

  const summaries: CommitSummary[] = [];
  for (const [commitSha, facts] of byCommit) {
    const outcome = classifyCommit(facts.map((fact) => fact.status));
    if (outcome === null) continue;
    summaries.push({
      commitSha,
      firstStartedAtMs: Math.min(...facts.map((fact) => fact.startedAtMs)),
      outcome,
      decisiveResults: facts.filter((fact) => fact.status !== "skipped").length,
      branches: [...new Set(facts.map((fact) => fact.branch))].sort(compareCodePoints),
    });
  }

  return summaries.sort(
    (a, b) =>
      a.firstStartedAtMs - b.firstStartedAtMs || compareCodePoints(a.commitSha, b.commitSha),
  );
}

/** Code-point (binary) order, as the spec requires for text comparisons. */
export function compareCodePoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
