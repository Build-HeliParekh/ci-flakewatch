import { describe, expect, it } from "vitest";
import { check, formatReport, percentile } from "../src/stats.js";

describe("benchmark statistics", () => {
  it("REQ-NFR-01: computes p95 and flags targets over the limit", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(samples, 95)).toBe(95);
    expect(percentile([5], 95)).toBe(5);
    expect(percentile([3, 1, 2], 50)).toBe(2);
    expect(check("fast", samples, 300)).toEqual({
      name: "fast",
      p95Ms: 95,
      targetMs: 300,
      over: false,
    });
    expect(check("slow", samples, 90).over).toBe(true);
    expect(check("edge", samples, 95).over).toBe(false);
    const report = formatReport([check("slow", samples, 90), check("fast", samples, 300)]);
    expect(report.split("\n")[0]).toMatch(/^OVER TARGET\s+slow/);
    expect(report.split("\n")[1]).toMatch(/^ok\s+fast/);
    expect(() => percentile([], 95)).toThrow();
  });
});
