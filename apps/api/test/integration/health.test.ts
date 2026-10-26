import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/app.js";

describe("GET /api/v1/health", () => {
  it("REQ-API-07: with a working database, returns 200 with { status: ok } as JSON", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("REQ-API-07: when the database can't be queried, returns 503 with { status: unavailable }", async () => {
    const { app, db } = createTestApp();
    db.close();
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });
  });
});
