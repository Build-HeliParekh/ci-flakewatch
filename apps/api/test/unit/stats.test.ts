import { describe, expect, it } from "vitest";
import { computeScopeCounts, lastSeenAtMs } from "../../src/domain/stats.js";
import { commit, fact } from "./facts.js";

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}T09:00:00Z`;

describe("computeScopeCounts", () => {
  it("REQ-STA-02: five commits with b2 and d4 flaky give commitsRun 5, flakyCommits 2, flakeRate 0.4", () => {
    const facts = [
      ...commit("a1", ["passed"], { at: day(1) }),
      ...commit("b2", ["failed", "passed"], { at: day(2) }),
      ...commit("c3", ["passed"], { at: day(3) }),
      ...commit("d4", ["failed", "passed"], { at: day(4) }),
      ...commit("e5", ["passed"], { at: day(5) }),
    ];
    expect(computeScopeCounts(facts)).toMatchObject({
      commitsRun: 5,
      flakyCommits: 2,
      flakeRate: 0.4,
    });
  });

  it("REQ-STA-02: b2 attempted failed ×4 then passed adds 1 flaky commit and 4 failed attempts", () => {
    const facts = commit("b2", ["failed", "failed", "failed", "failed", "passed"]);
    expect(computeScopeCounts(facts)).toMatchObject({
      commitsRun: 1,
      flakyCommits: 1,
      failedAttempts: 4,
    });
  });

  it("REQ-STA-02: flakeRate is unrounded and 0 when there are no commits", () => {
    const third = [
      ...commit("a1", ["failed", "passed"], { at: day(1) }),
      ...commit("b2", ["passed"], { at: day(2) }),
      ...commit("c3", ["passed"], { at: day(3) }),
    ];
    expect(computeScopeCounts(third).flakeRate).toBe(1 / 3);
    expect(computeScopeCounts([])).toEqual({
      commitsRun: 0,
      flakyCommits: 0,
      flakeRate: 0,
      failedAttempts: 0,
      unconfirmedFailures: 0,
      skippedResults: 0,
    });
  });

  it("REQ-STA-02: failedAttempts counts distinct attempts, so an in-run fail-then-pass counts once", () => {
    const facts = [
      fact({ commit: "b2", status: "failed", attemptId: 5 }),
      fact({ commit: "b2", status: "failed", attemptId: 5 }),
      fact({ commit: "b2", status: "passed", attemptId: 5 }),
    ];
    expect(computeScopeCounts(facts).failedAttempts).toBe(1);
  });

  it("REQ-STA-02: skipped results are counted, and a skipped-only commit isn't in commitsRun", () => {
    const facts = [
      ...commit("a1", ["skipped"], { at: day(1) }),
      ...commit("b2", ["skipped", "passed"], { at: day(2) }),
    ];
    expect(computeScopeCounts(facts)).toMatchObject({ commitsRun: 1, skippedResults: 2 });
  });
});

describe("unconfirmed failures", () => {
  it("REQ-STA-07: d4 failing once with no re-run, others passing: unconfirmed 1, flaky 0", () => {
    const facts = [
      ...Array.from({ length: 29 }, (_, i) =>
        commit(`p${i}`, ["passed"], {
          at: `2026-09-${String(25 + (i % 5)).padStart(2, "0")}T09:00:00Z`,
        }),
      ).flat(),
      ...commit("d4", ["failed"], { at: day(4) }),
    ];
    expect(computeScopeCounts(facts)).toMatchObject({
      commitsRun: 30,
      unconfirmedFailures: 1,
      flakyCommits: 0,
    });
  });

  it("REQ-STA-07: c3 failing on both attempts adds 1 unconfirmed failure", () => {
    expect(computeScopeCounts(commit("c3", ["failed", "failed"])).unconfirmedFailures).toBe(1);
  });

  it("REQ-STA-07: b2 failing then passing adds 0 unconfirmed failures and 1 flaky commit", () => {
    expect(computeScopeCounts(commit("b2", ["failed", "passed"]))).toMatchObject({
      unconfirmedFailures: 0,
      flakyCommits: 1,
    });
  });

  it("REQ-STA-07: a broken test's all-failing commits are all counted as unconfirmed failures", () => {
    const facts = [
      ...commit("a1", ["passed"], { at: day(1) }),
      ...commit("b2", ["failed", "failed"], { at: day(2) }),
      ...commit("c3", ["failed", "failed"], { at: day(3) }),
      ...commit("d4", ["failed", "failed"], { at: day(4) }),
    ];
    expect(computeScopeCounts(facts)).toMatchObject({
      commitsRun: 4,
      unconfirmedFailures: 3,
      flakyCommits: 0,
      failedAttempts: 6,
    });
  });
});

describe("lastSeenAtMs", () => {
  const facts = [
    fact({ commit: "a1", status: "passed", branch: "main", at: "2026-08-01T09:00:00Z" }),
    fact({ commit: "b2", status: "skipped", branch: "feature/x", at: "2026-08-05T09:00:00Z" }),
  ];

  it("REQ-STA-02: lastSeenAt is the latest attempt on the branch, ignoring the window", () => {
    expect(lastSeenAtMs(facts, "main")).toBe(Date.parse("2026-08-01T09:00:00Z"));
  });

  it("REQ-STA-02: lastSeenAt for * covers all branches and counts skipped results", () => {
    expect(lastSeenAtMs(facts, "*")).toBe(Date.parse("2026-08-05T09:00:00Z"));
    expect(lastSeenAtMs(facts, "feature/x")).toBe(Date.parse("2026-08-05T09:00:00Z"));
  });

  it("REQ-STA-02: lastSeenAt is null when the branch has no attempts", () => {
    expect(lastSeenAtMs(facts, "fix/other")).toBeNull();
  });
});
