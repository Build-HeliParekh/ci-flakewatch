import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/config.js";

describe("CORS_ORIGINS", () => {
  it("REQ-API-08: is a comma-separated list of origins; spaces and empty entries are ignored", () => {
    expect(loadConfig({}).corsOrigins).toEqual([]);
    expect(loadConfig({ CORS_ORIGINS: "" }).corsOrigins).toEqual([]);
    expect(
      loadConfig({ CORS_ORIGINS: " http://localhost:4173 , https://flakewatch.example.com:8443 ," })
        .corsOrigins,
    ).toEqual(["http://localhost:4173", "https://flakewatch.example.com:8443"]);
  });

  it("REQ-NFR-06: an entry that isn't http(s)://host[:port] with no path is an error naming CORS_ORIGINS", () => {
    for (const value of ["localhost:4173", "http://localhost:4173/", "ftp://example.com", "*"]) {
      const error = (() => {
        try {
          loadConfig({ CORS_ORIGINS: value });
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(error, value).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).variable, value).toBe("CORS_ORIGINS");
    }
  });
});
