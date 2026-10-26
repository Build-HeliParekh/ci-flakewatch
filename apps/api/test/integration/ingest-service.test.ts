import { describe, expect, it } from "vitest";
import { ingestUpload, RunConflictError } from "../../src/ingest/service.js";
import type { ParsedTestCase } from "../../src/ingest/junit.js";
import type { UploadMetadata } from "@flakewatch/shared";
import { createTestDb } from "../helpers/db.js";
import { counts, SHA_A, SHA_B } from "../helpers/upload.js";

const meta = (overrides: Partial<UploadMetadata> = {}): UploadMetadata => ({
  repo: "demo/shoplite",
  branch: "main",
  commitSha: SHA_A,
  runId: "100",
  attempt: 1,
  startedAt: "2026-10-23T09:00:00Z",
  ...overrides,
});

const testCase = (
  name: string,
  status: ParsedTestCase["status"] = "passed",
  extra: Partial<ParsedTestCase> = {},
): ParsedTestCase => ({
  position: 1,
  file: "tests/cart.test.ts",
  classname: "cart",
  name,
  status,
  durationMs: 100,
  message: status === "failed" ? "boom" : null,
  ...extra,
});

const numbered = (cases: ParsedTestCase[]) => cases.map((c, i) => ({ ...c, position: i + 1 }));

const many = (n: number, prefix = "case") =>
  numbered(Array.from({ length: n }, (_, i) => testCase(`${prefix} ${i + 1}`)));

const results = (db: ReturnType<typeof createTestDb>) =>
  db
    .prepare(
      `SELECT t.name, res.status, res.duration_ms AS durationMs, res.message, res.position
       FROM results res JOIN test_cases t ON t.id = res.test_case_id ORDER BY res.attempt_pk, res.position`,
    )
    .all();

describe("ingest service", () => {
  it("REQ-ING-04: the same repo, file, classname, and name in two uploads is the same test case", () => {
    const db = createTestDb();
    ingestUpload(db, meta(), [testCase("cart > updates total")]);
    ingestUpload(db, meta({ runId: "101", commitSha: SHA_B }), [testCase("cart > updates total")]);
    expect(counts(db).testCases).toBe(1);
    expect(counts(db).results).toBe(2);
  });

  it("REQ-ING-04: test cases that differ only in name, file, classname, or repo are different", () => {
    const db = createTestDb();
    ingestUpload(
      db,
      meta(),
      numbered([
        testCase("a"),
        testCase("b"),
        testCase("a", "passed", { file: "tests/other.test.ts" }),
        testCase("a", "passed", { classname: "other" }),
      ]),
    );
    ingestUpload(db, meta({ repo: "demo/other" }), [testCase("a")]);
    expect(counts(db).testCases).toBe(5);
  });

  it("REQ-ING-05: stores each result's duration and failure message", () => {
    const db = createTestDb();
    ingestUpload(
      db,
      meta(),
      numbered([
        testCase("slow", "failed", { durationMs: 2346, message: "Timeout after 5000ms" }),
        testCase("fast", "passed", { durationMs: 1 }),
      ]),
    );
    expect(results(db)).toEqual([
      {
        name: "slow",
        status: "failed",
        durationMs: 2346,
        message: "Timeout after 5000ms",
        position: 1,
      },
      { name: "fast", status: "passed", durationMs: 1, message: null, position: 2 },
    ]);
  });

  it("REQ-ING-06: a test case appearing twice in one report gives two results for that attempt", () => {
    const db = createTestDb();
    const outcome = ingestUpload(
      db,
      meta(),
      numbered([
        testCase("cart > updates total", "failed"),
        testCase("cart > updates total", "passed"),
      ]),
    );
    expect(counts(db)).toMatchObject({ testCases: 1, results: 2, attempts: 1 });
    expect(results(db).map((r) => (r as { status: string }).status)).toEqual(["failed", "passed"]);
    expect(outcome.summary.tests).toBe(2);
  });

  it("REQ-ING-07: re-uploading the same run and attempt with 150 results leaves 150, not 300", () => {
    const db = createTestDb();
    const first = ingestUpload(db, meta(), many(150));
    const second = ingestUpload(db, meta({ startedAt: "2026-10-23T10:00:00Z" }), many(150));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(counts(db)).toMatchObject({ attempts: 1, results: 150 });
  });

  it("REQ-ING-07: a re-upload replaces the attempt's results and start time, and keeps its id (PQ-13)", () => {
    const db = createTestDb();
    const first = ingestUpload(db, meta(), numbered([testCase("old", "failed")]));
    const second = ingestUpload(
      db,
      meta({ startedAt: "2026-10-23T11:30:00Z" }),
      numbered([testCase("new")]),
    );
    expect(second.summary.attemptId).toBe(first.summary.attemptId);
    expect(results(db)).toEqual([
      { name: "new", status: "passed", durationMs: 100, message: null, position: 1 },
    ]);
    const startedAt = db.prepare("SELECT started_at_ms AS ms FROM attempts").get() as {
      ms: number;
    };
    expect(startedAt.ms).toBe(Date.parse("2026-10-23T11:30:00Z"));
  });

  it("REQ-ING-07: a new attempt of an existing run is added, not replaced", () => {
    const db = createTestDb();
    ingestUpload(db, meta(), many(3));
    const second = ingestUpload(db, meta({ attempt: 2 }), many(3));
    expect(second.created).toBe(true);
    expect(counts(db)).toMatchObject({ runs: 1, attempts: 2, results: 6 });
  });

  it("REQ-ING-11: when the second result fails to store, nothing from the upload is stored", () => {
    const db = createTestDb();
    ingestUpload(db, meta({ runId: "1" }), many(2, "earlier"));
    const before = counts(db);
    expect(() =>
      ingestUpload(db, meta({ runId: "2" }), many(3), {
        beforeInsertResult(index) {
          if (index === 1) throw new Error("disk full");
        },
      }),
    ).toThrow("disk full");
    expect(counts(db)).toEqual(before);
  });

  it("REQ-ING-11: a failed re-upload leaves the previous version of the attempt in place", () => {
    const db = createTestDb();
    ingestUpload(db, meta(), many(2, "kept"));
    expect(() =>
      ingestUpload(db, meta(), many(2, "replacement"), {
        beforeInsertResult() {
          throw new Error("boom");
        },
      }),
    ).toThrow();
    expect(results(db).map((r) => (r as { name: string }).name)).toEqual(["kept 1", "kept 2"]);
  });

  it("REQ-ING-12: 146 passing, 3 failing, and 1 skipped test case give the summary 150/146/3/1", () => {
    const db = createTestDb();
    const cases = numbered([
      ...Array.from({ length: 146 }, (_, i) => testCase(`pass ${i}`)),
      ...Array.from({ length: 3 }, (_, i) => testCase(`fail ${i}`, "failed")),
      testCase("skip", "skipped"),
    ]);
    const { summary } = ingestUpload(db, meta(), cases);
    expect(summary).toEqual({
      attemptId: expect.any(Number) as number,
      tests: 150,
      passed: 146,
      failed: 3,
      skipped: 1,
    });
    const stored = db.prepare("SELECT id FROM attempts").get() as { id: number };
    expect(summary.attemptId).toBe(stored.id);
  });

  it("REQ-ING-13: attempt 2 of a run on a different commit is rejected and nothing is stored", () => {
    const db = createTestDb();
    ingestUpload(db, meta(), many(2));
    const before = counts(db);
    expect(() => ingestUpload(db, meta({ attempt: 2, commitSha: SHA_B }), many(2))).toThrow(
      RunConflictError,
    );
    expect(counts(db)).toEqual(before);
  });

  it("REQ-ING-13: attempt 2 of a run on a different branch is rejected, naming branch", () => {
    const db = createTestDb();
    ingestUpload(db, meta(), many(1));
    try {
      ingestUpload(db, meta({ attempt: 2, branch: "feature/x" }), many(1));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RunConflictError);
      expect((error as RunConflictError).field).toBe("branch");
    }
  });

  it("REQ-ING-13: re-uploading attempt 1 with a different commit is rejected while attempt 2 exists", () => {
    const db = createTestDb();
    ingestUpload(db, meta(), many(1));
    ingestUpload(db, meta({ attempt: 2 }), many(1));
    expect(() => ingestUpload(db, meta({ commitSha: SHA_B }), many(1))).toThrow(RunConflictError);
  });

  it("REQ-ING-13: re-uploading a run's only attempt may change its commit and branch (PQ-13)", () => {
    const db = createTestDb();
    ingestUpload(db, meta(), many(1));
    ingestUpload(db, meta({ commitSha: SHA_B, branch: "feature/x" }), many(1));
    expect(db.prepare("SELECT commit_sha AS sha, branch FROM runs").all()).toEqual([
      { sha: SHA_B, branch: "feature/x" },
    ]);
  });
});
