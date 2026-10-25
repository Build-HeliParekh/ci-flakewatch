// Builders for in-memory ResultFact arrays used by the domain unit tests.
import type { ResultStatus } from "@flakewatch/shared";
import type { ResultFact } from "../../src/domain/types.js";

/** A fixed as-of time used across the tests (the ShopLite `--end`). */
export const NOW = new Date("2026-10-24T00:00:00Z");

/**
 * A 40-character hex SHA built from a short label, e.g. sha("b2"). The label is hex-encoded
 * first, so different labels never collide (plain zero-padding would make "p1" and "p10" equal).
 */
export function sha(label: string): string {
  return Buffer.from(label, "utf8").toString("hex").padEnd(40, "0").slice(0, 40);
}

let nextAttemptId = 1;

export interface FactInput {
  commit: string;
  status: ResultStatus;
  /** ISO date-time; defaults to one day before NOW. */
  at?: string;
  attempt?: number;
  /** Defaults to a fresh id, so each fact is its own attempt unless set explicitly. */
  attemptId?: number;
  branch?: string;
  testCaseId?: number;
  repo?: string;
}

export function fact(input: FactInput): ResultFact {
  return {
    testCaseId: input.testCaseId ?? 1,
    repo: input.repo ?? "demo/shoplite",
    commitSha: sha(input.commit),
    branch: input.branch ?? "main",
    attemptId: input.attemptId ?? nextAttemptId++,
    attempt: input.attempt ?? 1,
    startedAtMs: Date.parse(input.at ?? "2026-10-23T00:00:00Z"),
    status: input.status,
  };
}

/**
 * One commit's attempts as a compact list, e.g. commit("b2", ["failed", "passed"]): attempt 1
 * failed, attempt 2 passed, ten minutes apart.
 */
export function commit(
  label: string,
  statuses: readonly ResultStatus[],
  options: { at?: string; branch?: string; testCaseId?: number } = {},
): ResultFact[] {
  const start = Date.parse(options.at ?? "2026-10-23T00:00:00Z");
  return statuses.map((status, index) =>
    fact({
      commit: label,
      status,
      attempt: index + 1,
      at: new Date(start + index * 10 * 60_000).toISOString(),
      ...(options.branch === undefined ? {} : { branch: options.branch }),
      ...(options.testCaseId === undefined ? {} : { testCaseId: options.testCaseId }),
    }),
  );
}
