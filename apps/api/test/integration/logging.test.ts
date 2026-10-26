import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/app.js";

describe("request logging", () => {
  it("REQ-NFR-03: logs one JSON line per request with method, path, status, and duration", async () => {
    const { app, logs } = createTestApp();
    await request(app).get("/api/v1/health");
    await request(app).get("/api/v1/nope");
    const lines = logs.map((line) => JSON.parse(line) as Record<string, unknown>);
    const requests = lines.filter((line) => "status" in line);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ method: "GET", path: "/api/v1/health", status: 200 });
    expect(requests[1]).toMatchObject({ method: "GET", path: "/api/v1/nope", status: 404 });
    expect(typeof requests[0]?.["durationMs"]).toBe("number");
    expect(requests[0]?.["durationMs"] as number).toBeGreaterThanOrEqual(0);
  });

  it("REQ-NFR-03: an upload-shaped request's log line has path and status but no token or report", async () => {
    const router = Router();
    router.post("/results", (_req, res) => {
      res.status(201).json({ ok: true });
    });
    const { app, logs } = createTestApp({ routes: [router] });
    await request(app)
      .post("/api/v1/results?repo=demo/shoplite&token=query-secret")
      .set("Authorization", "Bearer secret")
      .field("repo", "demo/shoplite")
      .attach(
        "report",
        Buffer.from("<testsuite><testcase name='report-contents-xyz'/></testsuite>"),
        "junit.xml",
      );
    const line = logs.find((entry) => entry.includes('"/api/v1/results"'));
    expect(line).toBeDefined();
    expect(JSON.parse(line ?? "{}")).toMatchObject({
      method: "POST",
      path: "/api/v1/results",
      status: 201,
    });
    const all = logs.join("\n");
    expect(all).not.toContain("secret");
    expect(all).not.toContain("report-contents-xyz");
    expect(all).not.toContain("repo=");
  });
});
