import type { ResultStatus } from "@flakewatch/shared";
import { describe, expect, it } from "vitest";
import { trendSeries } from "../../src/domain/trend.js";
import { commit, fact, NOW } from "./facts.js";

/** A date-time on a given October 2026 day. */
const oct = (day: number, time = "09:00:00") => `2026-10-${String(day).padStart(2, "0")}T${time}Z`;

const pointFor = (points: ReturnType<typeof trendSeries>, date: string) =>
  points.find((point) => point.date === date);

describe("trendSeries", () => {
  it("REQ-STA-05: has 30 points from date(now) − 30 to date(now) − 1: 2026-09-24 to 2026-10-23", () => {
    const points = trendSeries([], NOW);
    expect(points).toHaveLength(30);
    expect(points[0]?.date).toBe("2026-09-24");
    expect(points[29]?.date).toBe("2026-10-23");
  });

  it("REQ-STA-05: the dates are consecutive UTC days in YYYY-MM-DD form", () => {
    const dates = trendSeries([], NOW).map((point) => point.date);
    const expected = Array.from({ length: 30 }, (_, i) =>
      new Date(Date.parse("2026-09-24T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10),
    );
    expect(dates).toEqual(expected);
  });

  it("REQ-STA-05: uses the UTC date of now, so a mid-day now gives the same 30 dates", () => {
    const dates = trendSeries([], new Date("2026-10-24T18:30:00Z")).map((point) => point.date);
    expect(dates[0]).toBe("2026-09-24");
    expect(dates[29]).toBe("2026-10-23");
  });

  it("REQ-STA-05: a point is null when its 7 days have no commits", () => {
    const points = trendSeries(commit("a1", ["failed", "passed"], { at: oct(1) }), NOW);
    expect(pointFor(points, "2026-10-08")?.flakeRate).toBeNull();
    expect(pointFor(points, "2026-10-23")?.flakeRate).toBeNull();
  });

  it("REQ-STA-05: a point is the flake rate over the 7 days ending at the end of that day", () => {
    // Oct 10: flaky, Oct 11: passing, Oct 12: flaky, Oct 13: passing.
    const facts = [
      ...commit("a1", ["failed", "passed"], { at: oct(10) }),
      ...commit("a2", ["passed"], { at: oct(11) }),
      ...commit("a3", ["failed", "passed"], { at: oct(12) }),
      ...commit("a4", ["passed"], { at: oct(13) }),
    ];
    const points = trendSeries(facts, NOW);
    expect(pointFor(points, "2026-10-10")?.flakeRate).toBe(1); // a1 only
    expect(pointFor(points, "2026-10-11")?.flakeRate).toBe(0.5); // a1, a2
    expect(pointFor(points, "2026-10-13")?.flakeRate).toBe(0.5); // a1 to a4
    expect(pointFor(points, "2026-10-16")?.flakeRate).toBe(0.5); // still a1 to a4
    expect(pointFor(points, "2026-10-17")?.flakeRate).toBe(1 / 3); // a1 has dropped out
    expect(pointFor(points, "2026-10-09")?.flakeRate).toBeNull(); // before any commit
  });

  it("REQ-STA-05: the 7-day range excludes its start and includes its end", () => {
    // Point 2026-10-20 covers (2026-10-14T00:00:00Z, 2026-10-21T00:00:00Z].
    const point = (at: string, status: ResultStatus) =>
      pointFor(trendSeries([fact({ commit: "x", status, at })], NOW), "2026-10-20")?.flakeRate;
    expect(point("2026-10-14T00:00:00Z", "passed")).toBeNull();
    expect(point("2026-10-14T00:00:01Z", "passed")).toBe(0);
    expect(point("2026-10-21T00:00:00Z", "passed")).toBe(0);
    expect(point("2026-10-21T00:00:01Z", "passed")).toBeNull();
  });

  it("REQ-STA-05: attempts after now, or on today's date, are in no point", () => {
    const facts = [
      ...commit("t1", ["failed", "passed"], { at: "2026-10-24T01:00:00Z" }),
      ...commit("t2", ["failed", "passed"], { at: "2026-10-25T09:00:00Z" }),
    ];
    const points = trendSeries(facts, new Date("2026-10-24T03:00:00Z"));
    expect(points.every((point) => point.flakeRate === null)).toBe(true);
  });

  it("REQ-STA-05: a test fixed 10 days before the end reads 0 for days −4 to −1, not before", () => {
    // Like ShopLite's `orders > exports csv`: flaky every day until 2026-10-13 (day −11),
    // passing every day from 2026-10-14 (day −10).
    const facts = Array.from({ length: 23 }, (_, i) => {
      const day = i + 1;
      return commit(`d${day}`, day <= 13 ? ["failed", "passed"] : ["passed"], { at: oct(day) });
    }).flat();
    const points = trendSeries(facts, NOW);

    for (const date of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]) {
      expect(pointFor(points, date)?.flakeRate).toBe(0);
    }
    expect(pointFor(points, "2026-10-19")?.flakeRate).toBeGreaterThan(0); // still sees Oct 13
    expect(pointFor(points, "2026-10-13")?.flakeRate).toBe(1);
  });
});
