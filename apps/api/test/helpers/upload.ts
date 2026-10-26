// Upload helpers for API tests: valid metadata and a POST /api/v1/results with Supertest.
import type { Express } from "express";
import request from "supertest";

export const SHA_A = "a".repeat(40);
export const SHA_B = "b".repeat(40);

export const META = {
  repo: "demo/shoplite",
  branch: "main",
  commitSha: SHA_A,
  runId: "100",
  attempt: "1",
  startedAt: "2026-10-23T09:00:00Z",
} as const;

export type Meta = Partial<Record<keyof typeof META, string | undefined>>;

/** A <testsuite> report with these test cases (name → status). */
export function report(
  cases: readonly [name: string, status: "passed" | "failed" | "skipped"][],
  suite = "cart",
): string {
  const body = cases
    .map(([name, status]) =>
      status === "failed"
        ? `<testcase name="${name}" time="0.1"><failure message="boom"/></testcase>`
        : status === "skipped"
          ? `<testcase name="${name}"><skipped/></testcase>`
          : `<testcase name="${name}" time="0.1"/>`,
    )
    .join("");
  return `<testsuite name="${suite}" file="tests/${suite}.test.ts">${body}</testsuite>`;
}

/**
 * POSTs an upload. `meta` overrides fields; a field set to undefined is left out. `xml: null`
 * sends no report.
 */
export function upload(
  app: Express,
  xml: string | Buffer | null,
  meta: Meta = {},
  options: { token?: string } = {},
) {
  let req = request(app).post("/api/v1/results");
  if (options.token !== undefined) req = req.set("Authorization", `Bearer ${options.token}`);
  const fields = { ...META, ...meta };
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) req = req.field(name, value);
  }
  if (xml !== null)
    req = req.attach("report", Buffer.isBuffer(xml) ? xml : Buffer.from(xml), "junit.xml");
  return req;
}

/** Row counts, to check that a rejected upload changed nothing. */
export function counts(db: import("../../src/db/open.js").Db) {
  const n = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return {
    runs: n("runs"),
    attempts: n("attempts"),
    testCases: n("test_cases"),
    results: n("results"),
  };
}
