import { describe, expect, it } from "vitest";
import { inRange, windowRange } from "../../src/domain/windows.js";
import { NOW } from "./facts.js";

const ms = (iso: string) => Date.parse(iso);

describe("windowRange and inRange", () => {
  it("REQ-STA-01: 7d is (now − 7×24h, now]: 00:00:01 seven days before is in, 00:00:00 is out", () => {
    const range = windowRange("7d", NOW);
    expect(inRange(ms("2026-10-17T00:00:01Z"), range)).toBe(true);
    expect(inRange(ms("2026-10-17T00:00:00Z"), range)).toBe(false);
  });

  it("REQ-STA-01: 30d is (now − 30×24h, now]", () => {
    const range = windowRange("30d", NOW);
    expect(range).toEqual({
      startExclusiveMs: ms("2026-09-24T00:00:00Z"),
      endInclusiveMs: ms("2026-10-24T00:00:00Z"),
    });
    expect(inRange(ms("2026-09-24T00:00:01Z"), range)).toBe(true);
    expect(inRange(ms("2026-09-24T00:00:00Z"), range)).toBe(false);
  });

  it("REQ-STA-01: the window ends at now, inclusive; later attempts are outside", () => {
    const range = windowRange("7d", NOW);
    expect(inRange(ms("2026-10-24T00:00:00Z"), range)).toBe(true);
    expect(inRange(ms("2026-10-24T00:00:01Z"), range)).toBe(false);
  });
});
