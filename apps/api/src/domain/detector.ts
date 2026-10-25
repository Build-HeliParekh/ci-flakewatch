// The flake rule and per-commit summaries (REQ-DET-01 to REQ-DET-06).
// All functions take the facts of a **single test case**.
import type { BranchScope, CommitOutcome, ResultStatus } from "@flakewatch/shared";
import { notImplemented } from "./not-implemented.js";
import type { ResultFact, TimeRange } from "./types.js";

/**
 * A commit's outcome from its results for one test case: `flaky` if it has a `failed` and a
 * `passed` result, `failed` if all decisive results failed, `passed` if all passed, and `null`
 * if there is no decisive result (only `skipped`).
 */
export function classifyCommit(statuses: readonly ResultStatus[]): CommitOutcome | null {
  return notImplemented("classifyCommit", statuses);
}

/**
 * The facts in a scope: only `branch` (or every branch for `*`), and only attempts whose
 * `startedAt` is inside `range` (the window applies per attempt, REQ-DET-06).
 */
export function selectScopeFacts(
  facts: readonly ResultFact[],
  branch: BranchScope,
  range: TimeRange,
): ResultFact[] {
  return notImplemented("selectScopeFacts", facts, branch, range);
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
 * `firstStartedAtMs`, ties broken by `commitSha` ascending. Commits with only skipped results
 * are left out.
 */
export function summarizeCommits(scopeFacts: readonly ResultFact[]): CommitSummary[] {
  return notImplemented("summarizeCommits", scopeFacts);
}
