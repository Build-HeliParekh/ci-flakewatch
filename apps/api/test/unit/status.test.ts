import type { ResultStatus } from "@flakewatch/shared";
import { describe, expect, it } from "vitest";
import { summarizeCommits } from "../../src/domain/detector.js";
import { computeScopeCounts } from "../../src/domain/stats.js";
import {
  isBroken,
  meetsAutoQuarantine,
  quarantineSourceOf,
  resolveStatus,
  scopesFor,
  type StatusRules,
} from "../../src/domain/status.js";
import { commit } from "./facts.js";
import type { ResultFact } from "../../src/domain/types.js";

/** The §13.2 defaults: 10% threshold, 20 commits minimum, 3 commits to be broken. */
const RULES: StatusRules = {
  quarantineThreshold: 0.1,
  quarantineMinCommits: 20,
  brokenMinCommits: 3,
};

/**
 * Builds one test case's history from a list of commits, oldest first, one day apart.
 * Each entry is that commit's attempts, e.g. ["failed", "passed"].
 */
function history(commits: readonly (readonly ResultStatus[])[]): ResultFact[] {
  const start = Date.parse("2026-09-01T09:00:00Z");
  return commits.flatMap((attempts, i) =>
    commit(`c${i}`, attempts, { at: new Date(start + i * 86_400_000).toISOString() }),
  );
}

/** `flaky` flaky commits and `passing` passing commits, interleaved. */
function flakyHistory(flaky: number, passing: number): ResultFact[] {
  const commits: ResultStatus[][] = [
    ...Array.from({ length: flaky }, (): ResultStatus[] => ["failed", "passed"]),
    ...Array.from({ length: passing }, (): ResultStatus[] => ["passed"]),
  ];
  return history(commits);
}

function statusOf(facts: readonly ResultFact[], manual = false) {
  return resolveStatus({
    counts: computeScopeCounts(facts),
    commits: summarizeCommits(facts),
    manual,
    rules: RULES,
  });
}

const F: ResultStatus[] = ["failed"];
const FF: ResultStatus[] = ["failed", "failed"];
const FP: ResultStatus[] = ["failed", "passed"];
const P: ResultStatus[] = ["passed"];

describe("broken", () => {
  it("REQ-CLS-01: the last three commits ❌❌, ❌❌, ❌ make the test broken", () => {
    const facts = history([P, P, FF, FF, F]);
    expect(isBroken(summarizeCommits(facts), 3)).toBe(true);
    expect(statusOf(facts).status).toBe("broken");
  });

  it("REQ-CLS-01: ❌❌, ❌✅, ❌❌ as the last three commits is not broken", () => {
    const facts = history([P, FF, FP, FF]);
    expect(isBroken(summarizeCommits(facts), 3)).toBe(false);
    expect(statusOf(facts).status).not.toBe("broken");
  });

  it("REQ-CLS-01: only two commits in the scope, both all-failing, is not broken", () => {
    const facts = history([FF, FF]);
    expect(isBroken(summarizeCommits(facts), 3)).toBe(false);
    expect(statusOf(facts).status).not.toBe("broken");
  });

  it("REQ-CLS-01: only the most recent commits count: old failures followed by passes aren't broken", () => {
    expect(isBroken(summarizeCommits(history([FF, FF, FF, P])), 3)).toBe(false);
  });

  it("REQ-CLS-01: broken and manually quarantined is still broken, with quarantineSource manual", () => {
    expect(statusOf(history([P, FF, FF, FF]), true)).toEqual({
      status: "broken",
      quarantineSource: "manual",
    });
  });
});

describe("quarantined", () => {
  it("REQ-CLS-02: 3 flaky commits in 25 (12%) with the 20-commit minimum met is quarantined", () => {
    const facts = flakyHistory(3, 22);
    expect(computeScopeCounts(facts)).toMatchObject({ commitsRun: 25, flakyCommits: 3 });
    expect(meetsAutoQuarantine(computeScopeCounts(facts), RULES)).toBe(true);
    expect(statusOf(facts)).toEqual({ status: "quarantined", quarantineSource: "auto" });
  });

  it("REQ-CLS-02: 5 flaky commits in 10 (50%) is not auto-quarantined (too few commits), so flaky", () => {
    const facts = flakyHistory(5, 5);
    expect(meetsAutoQuarantine(computeScopeCounts(facts), RULES)).toBe(false);
    expect(statusOf(facts)).toEqual({ status: "flaky", quarantineSource: null });
  });

  it("REQ-CLS-02: exactly 10.0% with exactly 20 commits is quarantined (both limits inclusive)", () => {
    const facts = flakyHistory(2, 18);
    expect(computeScopeCounts(facts)).toMatchObject({ commitsRun: 20, flakeRate: 0.1 });
    expect(statusOf(facts).status).toBe("quarantined");
  });

  it("REQ-CLS-02: a manual quarantine makes any scope with data quarantined, even a stable one", () => {
    expect(statusOf(history([P, P, P]), true)).toEqual({
      status: "quarantined",
      quarantineSource: "manual",
    });
  });
});

describe("flaky", () => {
  it("REQ-CLS-03: 2 flaky commits in 40 (5%) is flaky", () => {
    expect(statusOf(flakyHistory(2, 38))).toEqual({ status: "flaky", quarantineSource: null });
  });
});

describe("stable", () => {
  it("REQ-CLS-04: 30 passing commits is stable with no failed attempts", () => {
    const facts = flakyHistory(0, 30);
    expect(computeScopeCounts(facts).failedAttempts).toBe(0);
    expect(statusOf(facts)).toEqual({ status: "stable", quarantineSource: null });
  });

  it("REQ-CLS-04: one failure with no re-run among 30 commits is still stable", () => {
    const facts = history([...Array.from({ length: 29 }, () => P), F]);
    expect(computeScopeCounts(facts)).toMatchObject({ failedAttempts: 1, unconfirmedFailures: 1 });
    expect(statusOf(facts).status).toBe("stable");
  });
});

describe("no data", () => {
  it("REQ-CLS-05: a scope with no commits has status null", () => {
    expect(statusOf([]).status).toBeNull();
  });

  it("REQ-CLS-05: a scope with only skipped results has status null", () => {
    expect(statusOf(history([["skipped"], ["skipped"]])).status).toBeNull();
  });

  it("REQ-CLS-05: a manually quarantined test case with no data still has status null", () => {
    expect(statusOf([], true)).toEqual({ status: null, quarantineSource: "manual" });
  });
});

describe("quarantine source", () => {
  it("REQ-QUA-03: follows the table: auto, manual, both, or null", () => {
    expect(quarantineSourceOf(true, false)).toBe("auto");
    expect(quarantineSourceOf(false, true)).toBe("manual");
    expect(quarantineSourceOf(true, true)).toBe("both");
    expect(quarantineSourceOf(false, false)).toBeNull();
  });

  it("REQ-QUA-03: manual plus the automatic rule gives quarantineSource both", () => {
    expect(statusOf(flakyHistory(3, 22), true)).toEqual({
      status: "quarantined",
      quarantineSource: "both",
    });
  });

  it("REQ-QUA-03: broken while meeting the automatic rule gives status broken, source auto", () => {
    // 4 flaky commits, then 18 passing, then 3 all-failing commits: 25 commits, 16% flaky.
    const facts = history([
      ...Array.from({ length: 4 }, () => FP),
      ...Array.from({ length: 18 }, () => P),
      FF,
      FF,
      FF,
    ]);
    expect(meetsAutoQuarantine(computeScopeCounts(facts), RULES)).toBe(true);
    expect(statusOf(facts)).toEqual({ status: "broken", quarantineSource: "auto" });
  });
});

describe("automatic release", () => {
  it("REQ-QUA-04: 12% becoming 9% after new passing commits lifts the automatic quarantine", () => {
    const before = flakyHistory(3, 22); // 3 / 25 = 12%
    expect(statusOf(before).status).toBe("quarantined");

    const after = flakyHistory(3, 30); // 3 / 33 ≈ 9.1%
    expect(computeScopeCounts(after).flakeRate).toBeLessThan(0.1);
    expect(statusOf(after)).toEqual({ status: "flaky", quarantineSource: null });
  });
});

describe("scopes", () => {
  it("REQ-STA-03: two branches give six scopes, 7d first, then * before branch names", () => {
    expect(scopesFor(["main", "feature/avatar-v2"])).toEqual([
      { window: "7d", branch: "*" },
      { window: "7d", branch: "feature/avatar-v2" },
      { window: "7d", branch: "main" },
      { window: "30d", branch: "*" },
      { window: "30d", branch: "feature/avatar-v2" },
      { window: "30d", branch: "main" },
    ]);
  });

  it("REQ-STA-03: branches are de-duplicated and sorted by code point", () => {
    expect(scopesFor(["main", "Main", "main"]).map((s) => `${s.window}/${s.branch}`)).toEqual([
      "7d/*",
      "7d/Main",
      "7d/main",
      "30d/*",
      "30d/Main",
      "30d/main",
    ]);
  });

  it("REQ-STA-03: a test case with no branches still has the two * scopes", () => {
    expect(scopesFor([])).toEqual([
      { window: "7d", branch: "*" },
      { window: "30d", branch: "*" },
    ]);
  });
});
