// Read queries that turn stored results into domain facts (PLAN §3.4). Never read the clock.
import { ALL_BRANCHES, type BranchScope } from "@flakewatch/shared";
import { compareCodePoints } from "../../domain/detector.js";
import type { ResultFact } from "../../domain/types.js";
import type { Db } from "../open.js";

export interface FactFilter {
  repo?: string;
  testCaseIds?: readonly number[];
  /** A branch name, or `*` (or omitted) for all branches. */
  branch?: BranchScope;
  /** Only attempts with `startedAt` > this (exclusive), for SQL pre-filtering. */
  startedAfterMs?: number;
  /** Only attempts with `startedAt` <= this (inclusive). */
  startedAtOrBeforeMs?: number;
}

interface Where {
  sql: string;
  params: unknown[];
}

/** Builds the WHERE clause shared by the fact queries (aliases: r = runs, a = attempts, res = results). */
function whereClause(filter: FactFilter): Where {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.repo !== undefined) {
    clauses.push("r.repo = ?");
    params.push(filter.repo);
  }
  if (filter.branch !== undefined && filter.branch !== ALL_BRANCHES) {
    clauses.push("r.branch = ?");
    params.push(filter.branch);
  }
  if (filter.testCaseIds !== undefined) {
    // An empty list matches nothing.
    clauses.push(
      filter.testCaseIds.length === 0
        ? "0"
        : `res.test_case_id IN (${filter.testCaseIds.map(() => "?").join(", ")})`,
    );
    params.push(...filter.testCaseIds);
  }
  if (filter.startedAfterMs !== undefined) {
    clauses.push("a.started_at_ms > ?");
    params.push(filter.startedAfterMs);
  }
  if (filter.startedAtOrBeforeMs !== undefined) {
    clauses.push("a.started_at_ms <= ?");
    params.push(filter.startedAtOrBeforeMs);
  }
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const FROM_RESULTS = `
  FROM results res
  JOIN attempts a ON a.id = res.attempt_pk
  JOIN runs r ON r.id = a.run_pk`;

/** Every stored result matching `filter`, as facts, ordered by attempt start, then result id. */
export function loadFacts(db: Db, filter: FactFilter): ResultFact[] {
  const where = whereClause(filter);
  return db
    .prepare<unknown[], ResultFact>(
      `SELECT res.test_case_id AS testCaseId, r.repo AS repo, r.commit_sha AS commitSha,
              r.branch AS branch, a.id AS attemptId, a.attempt AS attempt,
              a.started_at_ms AS startedAtMs, res.status AS status
       ${FROM_RESULTS}
       ${where.sql}
       ORDER BY a.started_at_ms, res.id`,
    )
    .all(...where.params);
}

/**
 * For each test case, the latest attempt `startedAt` per branch (any result status, ignoring
 * any window). Keys of the inner map are branch names; `*` is not included.
 */
export function loadLastSeen(
  db: Db,
  filter: { repo?: string; testCaseIds?: readonly number[] },
): Map<number, Map<string, number>> {
  const where = whereClause(filter);
  const rows = db
    .prepare<unknown[], { testCaseId: number; branch: string; lastSeenMs: number }>(
      `SELECT res.test_case_id AS testCaseId, r.branch AS branch, MAX(a.started_at_ms) AS lastSeenMs
       ${FROM_RESULTS}
       ${where.sql}
       GROUP BY res.test_case_id, r.branch`,
    )
    .all(...where.params);

  const byTestCase = new Map<number, Map<string, number>>();
  for (const row of rows) {
    const branches = byTestCase.get(row.testCaseId) ?? new Map<string, number>();
    branches.set(row.branch, row.lastSeenMs);
    byTestCase.set(row.testCaseId, branches);
  }
  return byTestCase;
}

/** Branches with any retained result for the test case (skipped included), sorted. */
export function loadBranchesWithResults(db: Db, testCaseId: number): string[] {
  return db
    .prepare<[number], { branch: string }>(
      `SELECT DISTINCT r.branch AS branch ${FROM_RESULTS} WHERE res.test_case_id = ?`,
    )
    .all(testCaseId)
    .map((row) => row.branch)
    .sort(compareCodePoints);
}
