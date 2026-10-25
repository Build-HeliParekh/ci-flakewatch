// Statuses, windows, scopes, and paging (SPEC §3, §7, §9).

/** Test case status, listed in evaluation order: the first match wins (SPEC §7). */
export type Status = "broken" | "quarantined" | "flaky" | "stable";
export const STATUSES: readonly Status[] = ["broken", "quarantined", "flaky", "stable"];

/** Which quarantine conditions hold, regardless of status (REQ-QUA-03). Fields use `| null`. */
export type QuarantineSource = "auto" | "manual" | "both";

/** Statistics windows (REQ-STA-01). */
export type Window = "7d" | "30d";
export const WINDOWS: readonly Window[] = ["7d", "30d"];
export const DEFAULT_WINDOW: Window = "30d";

/** The reserved branch value meaning "all branches" (SPEC §3). */
export const ALL_BRANCHES = "*" as const;
/** A branch name, or `*` for all branches. */
export type BranchScope = string;

/** A `(window, branch)` pair that statistics are computed for. */
export interface Scope {
  window: Window;
  branch: BranchScope;
}

/** One result's outcome (REQ-ING-02). */
export type ResultStatus = "passed" | "failed" | "skipped";
/** A commit's outcome for one test case in a scope (REQ-API-06). */
export type CommitOutcome = "passed" | "failed" | "flaky";

/** Ranked-list sorting (REQ-API-03). */
export type SortField = "flakeRate" | "failedAttempts" | "name";
export const SORT_FIELDS: readonly SortField[] = ["flakeRate", "failedAttempts", "name"];
export type SortOrder = "asc" | "desc";
export const SORT_ORDERS: readonly SortOrder[] = ["asc", "desc"];

export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;
