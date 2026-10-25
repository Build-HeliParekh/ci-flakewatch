import { describe, expect, it } from "vitest";
import { classifyCommit, selectScopeFacts, summarizeCommits } from "../../src/domain/detector.js";
import { computeScopeCounts } from "../../src/domain/stats.js";
import { windowRange } from "../../src/domain/windows.js";
import { commit, fact, NOW, sha } from "./facts.js";

const ALL_TIME = { startExclusiveMs: 0, endInclusiveMs: NOW.getTime() };
const outcomeOf = (facts: ReturnType<typeof commit>) => summarizeCommits(facts)[0]?.outcome;

describe("the flake rule", () => {
  it("REQ-DET-01: attempt 1 failed and attempt 2 passed on b2 makes b2 a flaky commit", () => {
    expect(outcomeOf(commit("b2", ["failed", "passed"]))).toBe("flaky");
  });

  it("REQ-DET-01: attempt 1 passed and attempt 2 failed is also flaky (order doesn't matter)", () => {
    expect(outcomeOf(commit("b2", ["passed", "failed"]))).toBe("flaky");
  });

  it("REQ-DET-01: attempts 1 and 2 both failed is not a flaky commit", () => {
    expect(outcomeOf(commit("b2", ["failed", "failed"]))).toBe("failed");
  });

  it("REQ-DET-01: a failed and a passed result in one attempt (in-run retry) is flaky", () => {
    const facts = [
      fact({ commit: "b2", status: "failed", attemptId: 7 }),
      fact({ commit: "b2", status: "passed", attemptId: 7 }),
    ];
    expect(outcomeOf(facts)).toBe("flaky");
  });

  it("REQ-DET-01: classifyCommit gives flaky, failed, or passed from a commit's statuses", () => {
    expect(classifyCommit(["failed", "passed"])).toBe("flaky");
    expect(classifyCommit(["failed", "failed"])).toBe("failed");
    expect(classifyCommit(["passed", "passed"])).toBe("passed");
  });
});

describe("skipped results", () => {
  it("REQ-DET-02: skipped, failed, failed on one commit is not flaky", () => {
    expect(classifyCommit(["skipped", "failed", "failed"])).toBe("failed");
  });

  it("REQ-DET-02: skipped, failed, passed on one commit is flaky", () => {
    expect(classifyCommit(["skipped", "failed", "passed"])).toBe("flaky");
  });

  it("REQ-DET-02: a commit with only skipped results has no outcome and isn't summarized", () => {
    expect(classifyCommit(["skipped", "skipped"])).toBeNull();
    expect(summarizeCommits(commit("s1", ["skipped"]))).toEqual([]);
  });
});

describe("across runs", () => {
  it("REQ-DET-03: run 100 attempt 1 failed and run 200 attempt 1 passed on b2 makes b2 flaky", () => {
    const facts = [
      fact({ commit: "b2", status: "failed", attempt: 1, attemptId: 100 }),
      fact({ commit: "b2", status: "passed", attempt: 1, attemptId: 200 }),
    ];
    expect(outcomeOf(facts)).toBe("flaky");
  });
});

describe("branch scope", () => {
  const facts = [
    fact({ commit: "c9", status: "failed", branch: "feature/x", at: "2026-10-23T08:00:00Z" }),
    fact({ commit: "c9", status: "passed", branch: "main", at: "2026-10-23T09:00:00Z" }),
  ];
  const outcomeIn = (branch: string) =>
    summarizeCommits(selectScopeFacts(facts, branch, ALL_TIME)).map((c) => c.outcome);

  it("REQ-DET-04: c9 failed on feature/x and passed on main is flaky in the * scope", () => {
    expect(outcomeIn("*")).toEqual(["flaky"]);
  });

  it("REQ-DET-04: c9 is not flaky in the main scope or the feature/x scope", () => {
    expect(outcomeIn("main")).toEqual(["passed"]);
    expect(outcomeIn("feature/x")).toEqual(["failed"]);
  });

  it("REQ-DET-04: the same SHA on two branches counts as one commit in *, listing both branches", () => {
    const summaries = summarizeCommits(selectScopeFacts(facts, "*", ALL_TIME));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.branches).toEqual(["feature/x", "main"]);
    expect(computeScopeCounts(selectScopeFacts(facts, "*", ALL_TIME)).commitsRun).toBe(1);
  });
});

describe("renamed tests", () => {
  it("REQ-DET-05: an old and a new name are two test cases with separate statistics", () => {
    const oldName = [
      ...commit("a1", ["passed"], { testCaseId: 1, at: "2026-10-01T09:00:00Z" }),
      ...commit("a2", ["failed", "passed"], { testCaseId: 1, at: "2026-10-02T09:00:00Z" }),
    ];
    const newName = commit("a3", ["passed"], { testCaseId: 2, at: "2026-10-05T09:00:00Z" });
    const all = [...oldName, ...newName];
    const countsFor = (id: number) => computeScopeCounts(all.filter((f) => f.testCaseId === id));

    expect(countsFor(1)).toMatchObject({ commitsRun: 2, flakyCommits: 1 });
    expect(countsFor(2)).toMatchObject({ commitsRun: 1, flakyCommits: 0 });
  });
});

describe("the window applies per attempt", () => {
  it("REQ-DET-06: a commit whose failed attempt is just outside 30d counts as passed in 30d", () => {
    const facts = [
      fact({ commit: "s1", status: "failed", attempt: 1, at: "2026-09-23T23:55:00Z" }),
      fact({ commit: "s1", status: "passed", attempt: 2, at: "2026-09-24T00:10:00Z" }),
    ];
    const inWindow = selectScopeFacts(facts, "*", windowRange("30d", NOW));

    expect(inWindow).toHaveLength(1);
    expect(summarizeCommits(inWindow).map((c) => c.outcome)).toEqual(["passed"]);
    expect(computeScopeCounts(inWindow)).toMatchObject({
      commitsRun: 1,
      flakyCommits: 0,
      failedAttempts: 0,
    });
  });
});

describe("summarizeCommits", () => {
  it("REQ-DET-01: lists commits oldest first, with ties broken by SHA, and counts decisive results", () => {
    const facts = [
      ...commit("c3", ["passed"], { at: "2026-10-22T09:00:00Z" }),
      ...commit("b2", ["failed", "skipped", "passed"], { at: "2026-10-21T09:00:00Z" }),
      ...commit("a1", ["passed"], { at: "2026-10-22T09:00:00Z" }),
    ];
    const summaries = summarizeCommits(facts);

    expect(summaries.map((c) => c.commitSha)).toEqual([sha("b2"), sha("a1"), sha("c3")]);
    expect(summaries[0]).toEqual({
      commitSha: sha("b2"),
      firstStartedAtMs: Date.parse("2026-10-21T09:00:00Z"),
      outcome: "flaky",
      decisiveResults: 2,
      branches: ["main"],
    });
  });
});
