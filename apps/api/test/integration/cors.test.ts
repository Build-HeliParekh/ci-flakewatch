import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/app.js";

const ALLOWED = "http://localhost:4173";
const withOrigins = (origins: string) => createTestApp({ env: { CORS_ORIGINS: origins } }).app;

describe("cross-origin access", () => {
  it("REQ-API-08: a request from an allowed origin gets Access-Control-Allow-Origin set to it", async () => {
    const response = await request(withOrigins(ALLOWED))
      .get("/api/v1/health")
      .set("Origin", ALLOWED);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
  });

  it("REQ-API-08: a request from another origin gets no CORS headers", async () => {
    const response = await request(withOrigins(ALLOWED))
      .get("/api/v1/health")
      .set("Origin", "https://evil.example");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("REQ-API-08: a preflight for a write from an allowed origin gets 204, allowing POST and Authorization", async () => {
    const response = await request(withOrigins(ALLOWED))
      .options("/api/v1/results")
      .set("Origin", ALLOWED)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization, content-type");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
    expect(String(response.headers["access-control-allow-methods"])).toMatch(/POST/);
    expect(String(response.headers["access-control-allow-methods"])).toMatch(/DELETE/);
    expect(String(response.headers["access-control-allow-headers"]).toLowerCase()).toMatch(
      /authorization/,
    );
  });

  it("REQ-API-08: with CORS_ORIGINS empty, no response has CORS headers", async () => {
    const response = await request(withOrigins("")).get("/api/v1/health").set("Origin", ALLOWED);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("REQ-API-08: CORS_ORIGINS can list several origins, separated by commas", async () => {
    const app = withOrigins("http://localhost:4173, https://flakewatch.example.com");
    for (const origin of ["http://localhost:4173", "https://flakewatch.example.com"]) {
      const response = await request(app).get("/api/v1/health").set("Origin", origin);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
    }
  });
});
