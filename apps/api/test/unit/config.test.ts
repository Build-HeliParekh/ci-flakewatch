import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config.js";

/** The variable named by the ConfigError that loadConfig throws, or null if it doesn't throw. */
function invalidVariable(env: Record<string, string | undefined>): string | null {
  try {
    loadConfig(env);
    return null;
  } catch (error) {
    if (error instanceof ConfigError) return error.variable;
    throw error;
  }
}

describe("loadConfig", () => {
  it("REQ-NFR-06: with every variable unset, uses the §13.2 defaults", () => {
    expect(loadConfig({})).toEqual({
      port: 4000,
      databasePath: "./data/flakewatch.db",
      quarantineThreshold: 0.1,
      quarantineMinCommits: 20,
      brokenMinCommits: 3,
      retentionDays: 90,
      maxUploadMb: 10,
      uploadToken: undefined,
      corsOrigins: [], // added in T-07 (REQ-API-08)
    });
  });

  it("REQ-NFR-06: empty values mean unset, so the defaults apply and UPLOAD_TOKEN is off", () => {
    const config = loadConfig({
      PORT: "",
      UPLOAD_TOKEN: "",
      FLAKEWATCH_NOW: "",
      DATABASE_PATH: "",
    });
    expect(config.port).toBe(4000);
    expect(config.uploadToken).toBeUndefined();
    expect(config.databasePath).toBe("./data/flakewatch.db");
  });

  it("REQ-NFR-06: reads valid values", () => {
    expect(
      loadConfig({
        PORT: "4100",
        DATABASE_PATH: "/tmp/fw.db",
        QUARANTINE_THRESHOLD: "0.05",
        QUARANTINE_MIN_COMMITS: "10",
        BROKEN_MIN_COMMITS: "2",
        RETENTION_DAYS: "37",
        MAX_UPLOAD_MB: "0.5",
        UPLOAD_TOKEN: "abc",
        FLAKEWATCH_NOW: "2026-10-24T00:00:00Z",
      }),
    ).toEqual({
      port: 4100,
      databasePath: "/tmp/fw.db",
      quarantineThreshold: 0.05,
      quarantineMinCommits: 10,
      brokenMinCommits: 2,
      retentionDays: 37,
      maxUploadMb: 0.5,
      uploadToken: "abc",
      corsOrigins: [], // added in T-07 (REQ-API-08)
    });
  });

  it("REQ-NFR-06: accepts the boundary values QUARANTINE_THRESHOLD=1 and PORT=65535", () => {
    expect(loadConfig({ QUARANTINE_THRESHOLD: "1", PORT: "65535" })).toMatchObject({
      quarantineThreshold: 1,
      port: 65535,
    });
  });

  it("REQ-NFR-06: names PORT when it isn't an integer from 1 to 65535", () => {
    for (const value of ["abc", "0", "65536", "40.5", "-1"]) {
      expect(invalidVariable({ PORT: value }), value).toBe("PORT");
    }
  });

  it("REQ-NFR-06: names QUARANTINE_THRESHOLD when it isn't above 0 and at most 1", () => {
    for (const value of ["0", "1.5", "-0.1", "abc"]) {
      expect(invalidVariable({ QUARANTINE_THRESHOLD: value }), value).toBe("QUARANTINE_THRESHOLD");
    }
  });

  it("REQ-NFR-06: names QUARANTINE_MIN_COMMITS when it isn't an integer ≥ 1", () => {
    for (const value of ["0", "1.5", "abc"]) {
      expect(invalidVariable({ QUARANTINE_MIN_COMMITS: value }), value).toBe(
        "QUARANTINE_MIN_COMMITS",
      );
    }
  });

  it("REQ-NFR-06: names BROKEN_MIN_COMMITS when it isn't an integer ≥ 2", () => {
    for (const value of ["1", "0", "2.5"]) {
      expect(invalidVariable({ BROKEN_MIN_COMMITS: value }), value).toBe("BROKEN_MIN_COMMITS");
    }
  });

  it("REQ-NFR-06: names MAX_UPLOAD_MB when it isn't a number above 0", () => {
    for (const value of ["-1", "0", "abc"]) {
      expect(invalidVariable({ MAX_UPLOAD_MB: value }), value).toBe("MAX_UPLOAD_MB");
    }
  });

  it("REQ-NFR-06: names FLAKEWATCH_NOW when it isn't an ISO date-time with a time zone", () => {
    expect(invalidVariable({ FLAKEWATCH_NOW: "tomorrow" })).toBe("FLAKEWATCH_NOW");
    expect(invalidVariable({ FLAKEWATCH_NOW: "2026-10-24" })).toBe("FLAKEWATCH_NOW");
  });

  it("REQ-NFR-06: the error message names the variable and the value", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/PORT.*abc|abc.*PORT/);
  });

  it("REQ-RET-02: RETENTION_DAYS below 37 is an error naming RETENTION_DAYS", () => {
    for (const value of ["10", "30", "36"]) {
      expect(invalidVariable({ RETENTION_DAYS: value }), value).toBe("RETENTION_DAYS");
    }
    expect(invalidVariable({ RETENTION_DAYS: "37" })).toBeNull();
  });

  it("REQ-RET-02: RETENTION_DAYS must be an integer", () => {
    expect(invalidVariable({ RETENTION_DAYS: "40.5" })).toBe("RETENTION_DAYS");
    expect(invalidVariable({ RETENTION_DAYS: "forever" })).toBe("RETENTION_DAYS");
  });
});
