import { describe, expect, it } from "vitest";
import {
  catalog,
  createRng,
  DEFAULT_OPTIONS,
  FEATURE_BRANCHES,
  generateCommits,
  generateScenario,
  MODULES,
  plantFlakiness,
  PLANTED,
  roundHalfUp,
} from "../src/index.js";

const END = DEFAULT_OPTIONS.end.getTime();
const DAY = 24 * 3600 * 1000;
const attempts = generateScenario();
const firstAttempts = attempts.filter((a) => a.attempt === 1);
const inLast = (days: number) =>
  firstAttempts.filter((a) => a.startedAt.getTime() > END - days * DAY);
const statusOf = (a: (typeof attempts)[number], name: string) =>
  a.cases.find((c) => c.name === name)?.status;

describe("shape of the scenario", () => {
  it("REQ-SEED-03: 150 test cases across 8 modules with the planned counts, files, and classnames", () => {
    const entries = catalog();
    expect(entries).toHaveLength(150);
    const perModule = Object.fromEntries(
      MODULES.map((m) => [m, entries.filter((e) => e.module === m).length]),
    );
    expect(perModule).toEqual({
      auth: 20,
      catalog: 25,
      search: 15,
      cart: 20,
      checkout: 25,
      payments: 15,
      orders: 15,
      profile: 15,
    });
    for (const entry of entries) {
      expect(entry.file).toBe(`tests/${entry.module}.test.ts`);
      expect(entry.classname).toBe(entry.module);
      expect(entry.name.startsWith(`${entry.module} > `)).toBe(true);
    }
    expect(new Set(entries.map((e) => e.name)).size).toBe(150);
    for (const name of Object.values(PLANTED).filter((n) => n !== PLANTED.stockRenamed)) {
      expect(entries.map((e) => e.name)).toContain(name);
    }
  });

  it("REQ-SEED-03: every report has 150 test cases", () => {
    expect(attempts.every((a) => a.cases.length === 150)).toBe(true);
  });

  it("REQ-SEED-03: 384 commits with default options: 44 in 7d and 192 in 30d", () => {
    expect(firstAttempts).toHaveLength(384);
    expect(new Set(firstAttempts.map((a) => a.commitSha)).size).toBe(384);
    expect(inLast(7)).toHaveLength(44);
    expect(inLast(30)).toHaveLength(192);
  });

  it("REQ-SEED-03: 8 commits each weekday and 2 each weekend day, between 08:00 and 20:00 UTC, all before --end", () => {
    const byDay = new Map<string, number>();
    for (const a of firstAttempts) {
      const day = a.startedAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      expect(a.startedAt.getUTCHours()).toBeGreaterThanOrEqual(8);
      expect(a.startedAt.getUTCHours()).toBeLessThan(20);
    }
    expect(byDay.size).toBe(60);
    for (const [day, count] of byDay) {
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
      expect(count, day).toBe(weekday === 0 || weekday === 6 ? 2 : 8);
    }
    expect(attempts.every((a) => a.startedAt.getTime() < END)).toBe(true);
  });

  it("REQ-SEED-03: each commit has a lower-case 40-character SHA and one run shoplite-<n>", () => {
    for (const a of firstAttempts) expect(a.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(new Set(firstAttempts.map((a) => a.runId)).size).toBe(384);
    expect(firstAttempts.every((a) => /^shoplite-\d+$/.test(a.runId))).toBe(true);
  });

  it("REQ-SEED-03: round(0.15 × n) commits per feature branch in each segment; feature/avatar-v2 has 7, 22, and 29", () => {
    const commits = generateCommits(DEFAULT_OPTIONS, createRng(1));
    for (const segment of ["S1", "S2", "S3"] as const) {
      const n = commits.filter((c) => c.segment === segment).length;
      for (const branch of FEATURE_BRANCHES) {
        expect(commits.filter((c) => c.segment === segment && c.branch === branch)).toHaveLength(
          roundHalfUp(0.15 * n),
        );
      }
    }
    const avatar = (days: [number, number]) =>
      firstAttempts.filter((a) => {
        const t = a.startedAt.getTime();
        return (
          a.branch === "feature/avatar-v2" && t > END - days[1] * DAY && t <= END - days[0] * DAY
        );
      }).length;
    expect([avatar([0, 7]), avatar([7, 30]), avatar([30, 60])]).toEqual([7, 22, 29]);
    expect(new Set(attempts.map((a) => a.branch))).toEqual(new Set([...FEATURE_BRANCHES, "main"]));
  });

  it("REQ-SEED-03: a failed attempt 1 gets an attempt 2 5–20 minutes later with every test case; others don't", () => {
    for (const first of firstAttempts) {
      const second = attempts.find((a) => a.runId === first.runId && a.attempt === 2);
      const failed = first.cases.some((c) => c.status === "failed");
      expect(Boolean(second), first.runId).toBe(failed);
      if (second) {
        const gap = second.startedAt.getTime() - first.startedAt.getTime();
        expect(gap).toBeGreaterThanOrEqual(5 * 60_000);
        expect(gap).toBeLessThanOrEqual(20 * 60_000);
        expect(second.commitSha).toBe(first.commitSha);
        expect(second.branch).toBe(first.branch);
        expect(second.cases).toHaveLength(150);
      }
    }
  });

  it("REQ-SEED-03: durations stay within a test case's base of 50–3,000 ms ± 20%", () => {
    for (const a of attempts)
      for (const c of a.cases) {
        expect(c.durationMs).toBeGreaterThanOrEqual(40);
        expect(c.durationMs).toBeLessThanOrEqual(3600);
      }
  });

  it("REQ-SEED-03: attempts come in upload order: startedAt, then runId, then attempt", () => {
    for (let i = 1; i < attempts.length; i++) {
      const [a, b] = [attempts[i - 1], attempts[i]];
      expect((a?.startedAt.getTime() ?? 0) <= (b?.startedAt.getTime() ?? 0)).toBe(true);
    }
  });
});

describe("planting", () => {
  it("REQ-SEED-04: picks exactly round(p × eligible) commits per segment: p = 0.40 with 44 eligible in S1 gives 18", () => {
    const rng = createRng(7);
    const commits = generateCommits(DEFAULT_OPTIONS, rng);
    const picked = plantFlakiness(commits, DEFAULT_OPTIONS, rng).get(PLANTED.sso) ?? new Set();
    const s1 = commits.filter((c) => c.segment === "S1");
    expect(s1).toHaveLength(44);
    expect(s1.filter((c) => picked.has(c.index))).toHaveLength(18);
  });

  it("REQ-SEED-04: on a picked commit, the test fails attempt 1 with a realistic message and passes attempt 2", () => {
    const byRun = new Map(attempts.map((a) => [`${a.runId}/${a.attempt}`, a]));
    let seen = 0;
    for (const first of firstAttempts) {
      const testCase = first.cases.find((c) => c.name === PLANTED.sso);
      if (testCase?.status !== "failed") continue;
      seen++;
      expect(testCase.message).toMatch(/^(TimeoutError|AssertionError|Error): .{10,}/);
      expect(statusOf(byRun.get(`${first.runId}/2`) ?? first, PLANTED.sso)).toBe("passed");
    }
    expect(seen).toBe(77 + roundHalfUp(0.4 * 192));
  });

  it("REQ-SEED-04: planted counts per segment for each flaky test match the SEED-05 table", () => {
    const flakyIn = (name: string, days: number, branch?: string) =>
      inLast(days).filter(
        (a) => (branch === undefined || a.branch === branch) && statusOf(a, name) === "failed",
      ).length;
    expect([flakyIn(PLANTED.sso, 7), flakyIn(PLANTED.sso, 30)]).toEqual([18, 77]);
    expect([flakyIn(PLANTED.cartTotal, 7), flakyIn(PLANTED.cartTotal, 30)]).toEqual([7, 29]);
    expect([flakyIn(PLANTED.paginate, 7), flakyIn(PLANTED.paginate, 30)]).toEqual([2, 9]);
    expect([
      flakyIn(PLANTED.avatar, 7, "feature/avatar-v2"),
      flakyIn(PLANTED.avatar, 30, "feature/avatar-v2"),
    ]).toEqual([2, 9]);
    expect(flakyIn(PLANTED.avatar, 60) - flakyIn(PLANTED.avatar, 60, "feature/avatar-v2")).toBe(0);
    expect([flakyIn(PLANTED.csv, 7), flakyIn(PLANTED.csv, 30)]).toEqual([0, 37]);
  });

  it("REQ-SEED-04: orders > exports csv only fails on commits before day −10", () => {
    const cutoff = END - 10 * DAY;
    for (const a of firstAttempts)
      if (statusOf(a, PLANTED.csv) === "failed") expect(a.startedAt.getTime()).toBeLessThan(cutoff);
  });

  it("REQ-SEED-04: payments > refunds partial passes until day −15, then fails every attempt", () => {
    const from = END - 15 * DAY;
    for (const a of attempts) {
      const expected =
        a.startedAt.getTime() >= from ||
        (a.attempt === 2 &&
          attempts.some(
            (f) => f.runId === a.runId && f.attempt === 1 && f.startedAt.getTime() >= from,
          ))
          ? "failed"
          : "passed";
      expect(statusOf(a, PLANTED.refund), `${a.runId}/${a.attempt}`).toBe(expected);
    }
    expect(inLast(30).filter((a) => statusOf(a, PLANTED.refund) === "failed")).toHaveLength(96);
  });

  it("REQ-SEED-04: catalog > syncs stock is renamed from day −20; the old name has 62 commits in 30d", () => {
    const from = END - 20 * DAY;
    for (const a of attempts) {
      const names = a.cases.map((c) => c.name);
      const renamed = a.startedAt.getTime() >= from || names.includes(PLANTED.stockRenamed);
      expect(names.includes(PLANTED.stockRenamed)).toBe(renamed);
      expect(names.includes(PLANTED.stock)).toBe(!renamed);
    }
    expect(inLast(30).filter((a) => a.cases.some((c) => c.name === PLANTED.stock))).toHaveLength(
      62,
    );
  });

  it("REQ-SEED-04: every other test case always passes", () => {
    const planted = new Set<string>([
      PLANTED.sso,
      PLANTED.cartTotal,
      PLANTED.paginate,
      PLANTED.avatar,
      PLANTED.csv,
      PLANTED.refund,
    ]);
    for (const a of attempts)
      for (const c of a.cases) if (!planted.has(c.name)) expect(c.status, c.name).toBe("passed");
  });
});

describe("rng", () => {
  it("REQ-SEED-01: the same seed gives the same sequence; a different seed doesn't", () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 5 }, () => c.next())).not.toEqual(seqA);
    expect(createRng(1).hex(40)).toMatch(/^[0-9a-f]{40}$/);
  });
});
