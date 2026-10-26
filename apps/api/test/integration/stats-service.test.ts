// Stats service against a real (in-memory) database, filled with insertFacts.
import type { ResultStatus } from "@flakewatch/shared";
import { describe, expect, it } from "vitest";
import { loadBranchesWithResults, loadFacts, loadLastSeen } from "../../src/db/repos/read.js";
import type { StatusRules } from "../../src/domain/status.js";
import { createStatsService } from "../../src/services/stats-service.js";
import { createTestDb } from "../helpers/db.js";
import { insertFacts, testCaseId, type FactRow } from "../helpers/facts.js";

const NOW = new Date("2026-10-24T00:00:00Z");
const RULES: StatusRules = {
  quarantineThreshold: 0.1,
  quarantineMinCommits: 20,
  brokenMinCommits: 3,
};

/** A 40-character lower-case hex SHA from a number. */
const sha = (n: number) => n.toString(16).padStart(40, "0");

let nextRun = 1;
/**
 * One commit's attempts for one test case: one run, attempts 1, 2, ... ten minutes apart.
 * Rows from separate calls get separate runs and commits unless `commit` is given.
 */
function attempts(
  name: string,
  statuses: readonly ResultStatus[],
  at: string,
  options: { branch?: string; repo?: string; commit?: number } = {},
): FactRow[] {
  const run = nextRun++;
  const start = Date.parse(at);
  return statuses.map((status, i) => ({
    runId: `run-${run}`,
    attempt: i + 1,
    commitSha: sha(options.commit ?? run),
    startedAt: new Date(start + i * 10 * 60_000).toISOString(),
    name,
    status,
    ...(options.branch === undefined ? {} : { branch: options.branch }),
    ...(options.repo === undefined ? {} : { repo: options.repo }),
  }));
}

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T09:00:00Z`;

describe("read queries", () => {
  it("loadFacts returns facts with run, attempt, and test case details", () => {
    const db = createTestDb();
    insertFacts(db, attempts("cart > updates total", ["failed", "passed"], day(20), { commit: 7 }));
    const facts = loadFacts(db, {});
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({
      repo: "demo/shoplite",
      commitSha: sha(7),
      branch: "main",
      attempt: 1,
      startedAtMs: Date.parse(day(20)),
      status: "failed",
      testCaseId: testCaseId(db, "cart > updates total"),
    });
    expect(facts[1]?.attempt).toBe(2);
    expect(facts[0]?.attemptId).not.toBe(facts[1]?.attemptId);
  });

  it("loadFacts filters by repo, branch, test case, and time range (start exclusive, end inclusive)", () => {
    const db = createTestDb();
    insertFacts(db, [
      ...attempts("a", ["passed"], day(10)),
      ...attempts("a", ["passed"], day(11), { branch: "feature/x" }),
      ...attempts("a", ["passed"], day(12), { repo: "other/repo" }),
      ...attempts("b", ["passed"], day(13)),
    ]);
    const a = testCaseId(db, "a");
    expect(loadFacts(db, { repo: "demo/shoplite" })).toHaveLength(3);
    expect(loadFacts(db, { branch: "feature/x" })).toHaveLength(1);
    expect(loadFacts(db, { branch: "*" })).toHaveLength(4);
    expect(loadFacts(db, { testCaseIds: [a], repo: "demo/shoplite" })).toHaveLength(2);
    expect(
      loadFacts(db, {
        startedAfterMs: Date.parse(day(10)),
        startedAtOrBeforeMs: Date.parse(day(12)),
      }).map((f) => f.startedAtMs),
    ).toEqual([Date.parse(day(11)), Date.parse(day(12))]);
  });

  it("loadLastSeen gives the latest attempt per branch, ignoring any window", () => {
    const db = createTestDb();
    insertFacts(db, [
      ...attempts("a", ["passed"], "2026-07-01T09:00:00Z"),
      ...attempts("a", ["skipped"], "2026-07-05T09:00:00Z", { branch: "feature/x" }),
      ...attempts("a", ["passed"], "2026-07-03T09:00:00Z"),
    ]);
    const seen = loadLastSeen(db, {}).get(testCaseId(db, "a"));
    expect(seen?.get("main")).toBe(Date.parse("2026-07-03T09:00:00Z"));
    expect(seen?.get("feature/x")).toBe(Date.parse("2026-07-05T09:00:00Z"));
    expect(seen?.has("*")).toBe(false);
  });

  it("loadBranchesWithResults includes branches with only skipped results, sorted", () => {
    const db = createTestDb();
    insertFacts(db, [
      ...attempts("a", ["passed"], day(1)),
      ...attempts("a", ["skipped"], day(2), { branch: "feature/skip-only" }),
      ...attempts("a", ["passed"], day(3), { branch: "Feature/upper" }),
    ]);
    expect(loadBranchesWithResults(db, testCaseId(db, "a"))).toEqual([
      "Feature/upper",
      "feature/skip-only",
      "main",
    ]);
  });
});

describe("scopes", () => {
  it("REQ-STA-03: a test case with results on main and feature/avatar-v2 has six scopes", () => {
    const db = createTestDb();
    insertFacts(db, [
      ...attempts("profile > uploads avatar", ["failed", "passed"], day(20), {
        branch: "feature/avatar-v2",
      }),
      ...attempts("profile > uploads avatar", ["passed"], day(21)),
    ]);
    const scopes = createStatsService(db, RULES).scopes(
      testCaseId(db, "profile > uploads avatar"),
      NOW,
    );
    expect(scopes?.map((s) => `${s.window}/${s.branch}`)).toEqual([
      "7d/*",
      "7d/feature/avatar-v2",
      "7d/main",
      "30d/*",
      "30d/feature/avatar-v2",
      "30d/main",
    ]);
    const scope = (key: string) => scopes?.find((s) => `${s.window}/${s.branch}` === key);
    expect(scope("7d/feature/avatar-v2")).toMatchObject({
      commitsRun: 1,
      flakyCommits: 1,
      status: "flaky",
    });
    expect(scope("7d/main")).toMatchObject({ commitsRun: 1, flakyCommits: 0, status: "stable" });
    expect(scope("30d/*")).toMatchObject({ commitsRun: 2, flakyCommits: 1, flakeRate: 0.5 });
  });

  it("REQ-STA-03: results only 40 days old on feature/old still give a 30d/feature/old scope, with no data", () => {
    const db = createTestDb();
    insertFacts(db, [
      ...attempts("a", ["passed"], day(20)),
      ...attempts("a", ["failed", "passed"], "2026-09-14T09:00:00Z", { branch: "feature/old" }),
    ]);
    const scopes = createStatsService(db, RULES).scopes(testCaseId(db, "a"), NOW);
    const old = scopes?.find((s) => s.window === "30d" && s.branch === "feature/old");
    expect(old).toMatchObject({
      commitsRun: 0,
      flakyCommits: 0,
      flakeRate: 0,
      status: null,
      quarantineSource: null,
    });
    expect(Date.parse(old?.lastSeenAt ?? "")).toBe(Date.parse("2026-09-14T09:10:00Z"));
  });

  it("REQ-STA-03: a branch with only skipped results has scopes too", () => {
    const db = createTestDb();
    insertFacts(db, [
      ...attempts("a", ["passed"], day(20)),
      ...attempts("a", ["skipped"], day(21), { branch: "feature/skip-only" }),
    ]);
    const scopes = createStatsService(db, RULES).scopes(testCaseId(db, "a"), NOW);
    expect(
      scopes?.find((s) => s.window === "7d" && s.branch === "feature/skip-only"),
    ).toMatchObject({
      commitsRun: 0,
      skippedResults: 1,
      status: null,
    });
  });

  it("returns null for an unknown test case", () => {
    expect(createStatsService(createTestDb(), RULES).scopes(999, NOW)).toBeNull();
  });
});

describe("listScope", () => {
  it("REQ-STA-06: an attempt exactly 7 days before now is outside 7d for every test case in the result", () => {
    const db = createTestDb();
    const edge = "2026-10-17T00:00:00Z"; // NOW − 7 × 24h
    insertFacts(db, [
      { runId: "e1", commitSha: sha(1), startedAt: edge, name: "a", status: "failed" },
      { runId: "e2", commitSha: sha(2), startedAt: edge, name: "b", status: "failed" },
      {
        runId: "e3",
        commitSha: sha(3),
        startedAt: "2026-10-17T00:00:01Z",
        name: "c",
        status: "passed",
      },
    ]);
    const items = createStatsService(db, RULES).listScope({ branch: "*", window: "7d" }, NOW);
    expect(items.map((item) => item.name)).toEqual(["c"]);
  });

  it("REQ-STA-06: results depend only on the now passed in", () => {
    const db = createTestDb();
    // Inside 7d for now = Oct 24 (window starts Oct 17), outside it for now = Oct 30.
    insertFacts(db, attempts("a", ["failed", "passed"], day(20)));
    const service = createStatsService(db, RULES);
    expect(service.listScope({ branch: "*", window: "7d" }, NOW)).toHaveLength(1);
    expect(
      service.listScope({ branch: "*", window: "7d" }, new Date("2026-10-30T00:00:00Z")),
    ).toHaveLength(0);
    expect(service.listScope({ branch: "*", window: "7d" }, NOW)).toHaveLength(1);
  });

  it("lists only test cases with commits in the scope, filtered by repo and branch, by id", () => {
    const db = createTestDb();
    insertFacts(db, [
      ...attempts("b", ["passed"], day(20)),
      ...attempts("a", ["passed"], day(20)),
      ...attempts("skips", ["skipped"], day(20)),
      ...attempts("old", ["passed"], "2026-08-01T09:00:00Z"),
      ...attempts("x", ["passed"], day(20), { branch: "feature/x" }),
      ...attempts("other", ["passed"], day(20), { repo: "other/repo" }),
    ]);
    const service = createStatsService(db, RULES);
    const names = (params: Parameters<typeof service.listScope>[0]) =>
      service.listScope(params, NOW).map((item) => item.name);

    expect(names({ repo: "demo/shoplite", branch: "*", window: "30d" })).toEqual(["b", "a", "x"]);
    expect(names({ repo: "demo/shoplite", branch: "main", window: "30d" })).toEqual(["b", "a"]);
    expect(names({ branch: "*", window: "30d" })).toEqual(["b", "a", "x", "other"]);
    expect(names({ repo: "nope/nope", branch: "*", window: "30d" })).toEqual([]);
  });

  it("returns each item's identity, statistics, status, and quarantine source", () => {
    const db = createTestDb();
    const flaky = Array.from({ length: 3 }, (_, i) =>
      attempts("t", ["failed", "passed"], day(1 + i)),
    );
    const passing = Array.from({ length: 22 }, (_, i) =>
      attempts(
        "t",
        ["passed"],
        `2026-10-${String(4 + (i % 19)).padStart(2, "0")}T1${i % 10}:00:00Z`,
      ),
    );
    insertFacts(db, [...flaky, ...passing].flat());
    const [item] = createStatsService(db, RULES).listScope({ branch: "*", window: "30d" }, NOW);

    expect(item).toMatchObject({
      id: testCaseId(db, "t"),
      repo: "demo/shoplite",
      file: "tests/example.test.ts",
      classname: "",
      name: "t",
      commitsRun: 25,
      flakyCommits: 3,
      flakeRate: 0.12,
      failedAttempts: 3,
      unconfirmedFailures: 0,
      skippedResults: 0,
      status: "quarantined",
      quarantineSource: "auto",
    });
    expect(typeof item?.lastSeenAt).toBe("string");
  });

  it("applies a manual quarantine, and reports broken with source auto when the auto rule is met", () => {
    const db = createTestDb();
    const history = [
      ...Array.from({ length: 4 }, (_, i) => attempts("broken", ["failed", "passed"], day(1 + i))),
      ...Array.from({ length: 18 }, (_, i) =>
        attempts(
          "broken",
          ["passed"],
          `2026-10-${String(5 + (i % 15)).padStart(2, "0")}T1${i % 10}:00:00Z`,
        ),
      ),
      ...[20, 21, 22].map((d) => attempts("broken", ["failed", "failed"], day(d))),
      attempts("manual", ["passed"], day(20)),
    ].flat();
    insertFacts(db, history);
    db.prepare("INSERT INTO manual_quarantines (test_case_id, reason, at_ms) VALUES (?, ?, ?)").run(
      testCaseId(db, "manual"),
      "Times out on CI runners",
      Date.parse(day(21)),
    );
    const items = createStatsService(db, RULES).listScope({ branch: "*", window: "30d" }, NOW);
    const byName = Object.fromEntries(items.map((item) => [item.name, item]));

    expect(byName["broken"]).toMatchObject({ status: "broken", quarantineSource: "auto" });
    expect(byName["manual"]).toMatchObject({ status: "quarantined", quarantineSource: "manual" });
  });
});
