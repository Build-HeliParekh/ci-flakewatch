import { describe, expect, it } from "vitest";
import { ClockError, envClock, fixedClock, parseIsoDateTime } from "../../src/clock.js";

const SYSTEM = new Date("2030-01-01T12:00:00Z");
const system = () => new Date(SYSTEM.getTime());

describe("envClock", () => {
  it("REQ-NFR-04: with FLAKEWATCH_NOW=2026-10-24T00:00:00Z, now() is that time", () => {
    const clock = envClock({ FLAKEWATCH_NOW: "2026-10-24T00:00:00Z" }, system);
    expect(clock.now().toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });

  it("REQ-NFR-04: without FLAKEWATCH_NOW, or with it empty, now() is the system time", () => {
    expect(envClock({}, system).now()).toEqual(SYSTEM);
    expect(envClock({ FLAKEWATCH_NOW: "" }, system).now()).toEqual(SYSTEM);
  });

  it("REQ-NFR-04: re-reads FLAKEWATCH_NOW on every call, so a change applies to the next call", () => {
    const env: Record<string, string | undefined> = { FLAKEWATCH_NOW: "2026-10-24T00:00:00Z" };
    const clock = envClock(env, system);
    expect(clock.now().toISOString()).toBe("2026-10-24T00:00:00.000Z");
    env["FLAKEWATCH_NOW"] = "2026-10-30T00:00:00Z";
    expect(clock.now().toISOString()).toBe("2026-10-30T00:00:00.000Z");
    delete env["FLAKEWATCH_NOW"];
    expect(clock.now()).toEqual(SYSTEM);
  });

  it("REQ-NFR-04: accepts a time zone offset and returns the same instant", () => {
    const clock = envClock({ FLAKEWATCH_NOW: "2026-10-23T20:00:00-04:00" }, system);
    expect(clock.now().toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });

  it("REQ-NFR-06: an invalid FLAKEWATCH_NOW at call time throws a ClockError naming it", () => {
    const env: Record<string, string | undefined> = { FLAKEWATCH_NOW: "2026-10-24T00:00:00Z" };
    const clock = envClock(env, system);
    env["FLAKEWATCH_NOW"] = "tomorrow";
    expect(() => clock.now()).toThrow(ClockError);
    expect(() => clock.now()).toThrow(/FLAKEWATCH_NOW/);
  });

  it("REQ-NFR-04: returns a new Date each call, so callers can't change the clock", () => {
    const clock = envClock({ FLAKEWATCH_NOW: "2026-10-24T00:00:00Z" }, system);
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });
});

describe("fixedClock", () => {
  it("REQ-NFR-04: always returns the given time, as a new Date each call", () => {
    const clock = fixedClock("2026-10-24T00:00:00Z");
    const first = clock.now();
    first.setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });
});

describe("parseIsoDateTime", () => {
  it("REQ-NFR-06: accepts date-times with Z or an offset, with or without fractional seconds", () => {
    expect(parseIsoDateTime("2026-10-24T00:00:00Z")?.toISOString()).toBe(
      "2026-10-24T00:00:00.000Z",
    );
    expect(parseIsoDateTime("2026-10-24T00:00:00.123Z")?.toISOString()).toBe(
      "2026-10-24T00:00:00.123Z",
    );
    expect(parseIsoDateTime("2026-10-24T05:30:00+05:30")?.toISOString()).toBe(
      "2026-10-24T00:00:00.000Z",
    );
  });

  it("REQ-NFR-06: rejects words, dates without a time, times without a zone, and impossible dates", () => {
    for (const value of [
      "tomorrow",
      "",
      "2026-10-24",
      "2026-10-24T00:00:00",
      "2026-02-30T00:00:00Z",
      "2026-10-24T25:00:00Z",
      "1792982400000",
    ]) {
      expect(parseIsoDateTime(value), value).toBeNull();
    }
  });
});
