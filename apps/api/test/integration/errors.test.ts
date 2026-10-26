import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../src/clock.js";
import { requestNow } from "../../src/http/app.js";
import { HttpError, toApiTimestamp } from "../../src/http/errors.js";
import { createTestApp } from "../helpers/app.js";

/** Test-only routes for app-wide behavior. */
function testRoutes(): Router {
  const router = Router();
  router.get("/test/validation", () => {
    throw new HttpError("VALIDATION_ERROR", "attempt must be an integer ≥ 1");
  });
  router.get("/test/not-quarantined", () => {
    throw new HttpError("NOT_QUARANTINED", "not manually quarantined");
  });
  router.get("/test/boom", () => {
    throw new Error("boom: secret internal detail");
  });
  router.post("/test/echo", (req, res) => {
    res.json({ received: req.body as unknown });
  });
  router.get("/test/now", (_req, res) => {
    const first = requestNow(res);
    const second = requestNow(res);
    res.json({ first: first.toISOString(), second: second.toISOString() });
  });
  return router;
}

describe("error format", () => {
  it("REQ-API-01: an unknown route gives 404 NOT_FOUND in the error format, as JSON", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/api/v1/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: expect.any(String) } });
  });

  it("REQ-API-01: a path outside /api/v1 also gives 404 NOT_FOUND", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/somewhere");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("REQ-API-01: an HttpError gives its code, its HTTP status, and its message", async () => {
    const { app } = createTestApp({ routes: [testRoutes()] });
    const validation = await request(app).get("/api/v1/test/validation");
    expect(validation.status).toBe(400);
    expect(validation.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "attempt must be an integer ≥ 1" },
    });
    const conflict = await request(app).get("/api/v1/test/not-quarantined");
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("NOT_QUARANTINED");
  });

  it("REQ-API-01: an unexpected error gives 500 INTERNAL_ERROR with no stack trace or detail", async () => {
    const { app, entries } = createTestApp({ routes: [testRoutes()] });
    const response = await request(app).get("/api/v1/test/boom");
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(response.text).not.toContain("boom");
    expect(response.text).not.toMatch(/\bat\s+\S+\s+\(/); // no "at fn (file:line)" frames
    expect(entries().some((e) => String(e["message"]).includes("boom"))).toBe(true);
  });

  it("REQ-API-01: a malformed JSON body gives 400 VALIDATION_ERROR", async () => {
    const { app } = createTestApp({ routes: [testRoutes()] });
    const response = await request(app)
      .post("/api/v1/test/echo")
      .set("Content-Type", "application/json")
      .send("{ not json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("timestamps", () => {
  it("REQ-API-01: are ISO 8601 UTC to the second with Z, fractional seconds truncated", () => {
    expect(toApiTimestamp(new Date("2026-10-23T09:00:00.789+02:00"))).toBe("2026-10-23T07:00:00Z");
    expect(toApiTimestamp(new Date("2026-10-24T00:00:00Z"))).toBe("2026-10-24T00:00:00Z");
    expect(toApiTimestamp(new Date("2026-10-23T23:59:59.999Z"))).toBe("2026-10-23T23:59:59Z");
  });
});

describe("one now per request", () => {
  it("REQ-STA-06: a request that asks for now twice reads the clock once and gets the same value", async () => {
    let calls = 0;
    const clock: Clock = {
      now: () => {
        calls++;
        return new Date(Date.parse("2026-10-24T00:00:00Z") + calls * 1000);
      },
    };
    const { app } = createTestApp({ routes: [testRoutes()], clock });
    const response = await request(app).get("/api/v1/test/now");
    expect(response.body.first).toBe(response.body.second);
    expect(calls).toBe(1);
  });

  it("REQ-NFR-04: changing FLAKEWATCH_NOW between requests changes the next request's now", async () => {
    const { app, env } = createTestApp({ routes: [testRoutes()] });
    expect((await request(app).get("/api/v1/test/now")).body.first).toBe(
      "2026-10-24T00:00:00.000Z",
    );
    env["FLAKEWATCH_NOW"] = "2026-10-30T12:00:00Z";
    expect((await request(app).get("/api/v1/test/now")).body.first).toBe(
      "2026-10-30T12:00:00.000Z",
    );
  });

  it("REQ-NFR-06: if FLAKEWATCH_NOW becomes invalid, requests needing the time get 500 and it's logged", async () => {
    const { app, env, entries } = createTestApp({ routes: [testRoutes()] });
    env["FLAKEWATCH_NOW"] = "tomorrow";
    const response = await request(app).get("/api/v1/test/now");
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL_ERROR");
    expect(entries().some((e) => String(e["message"]).includes("FLAKEWATCH_NOW"))).toBe(true);
  });

  it("REQ-NFR-06: requests that don't need the time still work when FLAKEWATCH_NOW is invalid", async () => {
    const { app, env } = createTestApp();
    env["FLAKEWATCH_NOW"] = "tomorrow";
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
  });
});
