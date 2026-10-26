// Read queries that turn stored results into domain facts (PLAN §3.4). Never read the clock.
import type { BranchScope } from "@flakewatch/shared";
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

/** Every stored result matching `filter`, as facts, ordered by attempt start, then result id. */
export function loadFacts(db: Db, filter: FactFilter): ResultFact[] {
  return notImplemented("loadFacts", db, filter);
}

/**
 * For each test case, the latest attempt `startedAt` per branch (any result status, ignoring
 * any window). Keys of the inner map are branch names; `*` is not included.
 */
export function loadLastSeen(
  db: Db,
  filter: { repo?: string; testCaseIds?: readonly number[] },
): Map<number, Map<string, number>> {
  return notImplemented("loadLastSeen", db, filter);
}

/** Branches with any retained result for the test case (skipped included), sorted. */
export function loadBranchesWithResults(db: Db, testCaseId: number): string[] {
  return notImplemented("loadBranchesWithResults", db, testCaseId);
}

function notImplemented(name: string, ...args: unknown[]): never {
  throw new Error(`${name} is not implemented yet (T-16b); called with ${args.length} argument(s)`);
}
