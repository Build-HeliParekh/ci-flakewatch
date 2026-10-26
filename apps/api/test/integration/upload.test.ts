import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/app.js";
import { counts, META, report, SHA_B, upload } from "../helpers/upload.js";

const four = report([
  ["passes", "passed"],
  ["fails", "failed"],
  ["errors", "passed"],
  ["skips", "skipped"],
]).replace(
  '<testcase name="errors" time="0.1"/>',
  '<testcase name="errors"><error message="crash"/></testcase>',
);

const storedStatuses = (db: ReturnType<typeof createTestApp>["db"]) =>
  db
    .prepare(
      "SELECT t.name, res.status FROM results res JOIN test_cases t ON t.id = res.test_case_id ORDER BY res.position",
    )
    .all();

const errorOf = (body: unknown) => (body as { error: { code: string; message: string } }).error;

describe("POST /api/v1/results", () => {
  it("REQ-ING-01: a valid report and metadata give 201 and the results are stored", async () => {
    const { app, db } = createTestApp();
    const res = await upload(app, report([["cart > updates total", "passed"]]));
    expect(res.status).toBe(201);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(counts(db)).toMatchObject({ runs: 1, attempts: 1, testCases: 1, results: 1 });
  });

  it.each([
    ["repo", { repo: undefined }],
    ["repo", { repo: "shoplite" }],
    ["repo", { repo: "demo/shop lite" }],
    ["branch", { branch: undefined }],
    ["branch", { branch: "*" }],
    ["branch", { branch: "b".repeat(256) }],
    ["commitSha", { commitSha: "abc1234" }],
    ["commitSha", { commitSha: "g".repeat(40) }],
    ["runId", { runId: undefined }],
    ["runId", { runId: "r".repeat(101) }],
    ["attempt", { attempt: "0" }],
    ["attempt", { attempt: "1.0" }],
    ["attempt", { attempt: "01" }],
    ["attempt", { attempt: "two" }],
    ["startedAt", { startedAt: undefined }],
    ["startedAt", { startedAt: "2026-10-23" }],
    ["startedAt", { startedAt: "2026-10-23T09:00:00" }],
  ])(
    "REQ-ING-01: an invalid %s gives 400 VALIDATION_ERROR naming the field, and nothing is stored (%o)",
    async (field, meta) => {
      const { app, db } = createTestApp();
      const res = await upload(app, report([["a", "passed"]]), meta);
      expect(res.status).toBe(400);
      expect(errorOf(res.body).code).toBe("VALIDATION_ERROR");
      expect(errorOf(res.body).message).toContain(field);
      expect(counts(db).results).toBe(0);
    },
  );

  it("REQ-ING-01: a missing report gives 400 naming report", async () => {
    const { app } = createTestApp();
    const res = await upload(app, null);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).message).toContain("report");
  });

  it("REQ-ING-01: a request that isn't multipart gives 400", async () => {
    const { app } = createTestApp();
    const res = await request(app).post("/api/v1/results").send({ repo: "demo/shoplite" });
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("REQ-ING-01: a metadata field sent twice gives 400 naming it (PQ-14)", async () => {
    const { app } = createTestApp();
    const res = await upload(app, report([["a", "passed"]])).field("branch", "other");
    expect(res.status).toBe(400);
    expect(errorOf(res.body).message).toContain("branch");
  });

  it("REQ-ING-01: commitSha is stored lower-case and startedAt as UTC", async () => {
    const { app, db } = createTestApp();
    await upload(app, report([["a", "passed"]]), {
      commitSha: "A".repeat(40),
      startedAt: "2026-10-23T09:00:00.789+02:00",
    });
    expect(db.prepare("SELECT commit_sha AS sha FROM runs").get()).toEqual({ sha: "a".repeat(40) });
    expect(db.prepare("SELECT started_at_ms AS ms FROM attempts").get()).toEqual({
      ms: Date.parse("2026-10-23T07:00:00Z"),
    });
  });

  it("REQ-ING-02: one passing, one <failure>, one <error>, and one <skipped> are stored as passed, failed, failed, skipped", async () => {
    const { app, db } = createTestApp();
    expect((await upload(app, four)).status).toBe(201);
    expect(storedStatuses(db)).toEqual([
      { name: "passes", status: "passed" },
      { name: "fails", status: "failed" },
      { name: "errors", status: "failed" },
      { name: "skips", status: "skipped" },
    ]);
  });

  it("REQ-ING-03: the same test cases as <testsuites> and as a single <testsuite>, each in an empty database, store identical results", async () => {
    const cases = `<testcase name="a" classname="cart" file="tests/cart.test.ts" time="0.2"/><testcase name="b" classname="cart" file="tests/cart.test.ts"><failure message="x"/></testcase>`;
    const dump = (db: ReturnType<typeof createTestApp>["db"]) =>
      db
        .prepare(
          `SELECT t.repo, t.file, t.classname, t.name, res.position, res.status, res.duration_ms, res.message
           FROM results res JOIN test_cases t ON t.id = res.test_case_id ORDER BY res.position`,
        )
        .all();
    const one = createTestApp();
    const two = createTestApp();
    await upload(one.app, `<testsuites><testsuite name="cart">${cases}</testsuite></testsuites>`);
    await upload(two.app, `<testsuite name="cart">${cases}</testsuite>`);
    expect(dump(one.db)).toHaveLength(2);
    expect(dump(one.db)).toEqual(dump(two.db));
  });

  it("REQ-ING-04: the third <testcase> without a name gives 422 INVALID_REPORT mentioning test case 3", async () => {
    const { app, db } = createTestApp();
    const res = await upload(
      app,
      `<testsuite name="s"><testcase name="1"/><testcase name="2"/><testcase/></testsuite>`,
    );
    expect(res.status).toBe(422);
    expect(errorOf(res.body).code).toBe("INVALID_REPORT");
    expect(errorOf(res.body).message).toMatch(/test case 3\b/i);
    expect(counts(db).results).toBe(0);
  });

  it("REQ-ING-07: re-uploading the same run and attempt gives 200 and replaces the results", async () => {
    const { app, db } = createTestApp();
    const cases = Array.from(
      { length: 150 },
      (_, i) => [`case ${i}`, "passed"] as [string, "passed"],
    );
    expect((await upload(app, report(cases))).status).toBe(201);
    const again = await upload(app, report(cases));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ tests: 150 });
    expect(counts(db)).toMatchObject({ attempts: 1, results: 150 });
  });

  it("REQ-ING-08: a truncated XML file gives 422 INVALID_REPORT and the database is unchanged", async () => {
    const { app, db } = createTestApp();
    await upload(app, report([["earlier", "passed"]]), { runId: "1" });
    const before = counts(db);
    const xml = report([
      ["a", "passed"],
      ["b", "passed"],
    ]);
    const res = await upload(app, xml.slice(0, xml.length - 20), { runId: "2" });
    expect(res.status).toBe(422);
    expect(errorOf(res.body).code).toBe("INVALID_REPORT");
    expect(counts(db)).toEqual(before);
  });

  it("REQ-ING-08: a well-formed <testsuite> with no <testcase> gives 422", async () => {
    const { app } = createTestApp();
    const res = await upload(app, `<testsuite name="empty" tests="0"></testsuite>`);
    expect(res.status).toBe(422);
    expect(errorOf(res.body).code).toBe("INVALID_REPORT");
  });

  it("REQ-ING-08: a report with the wrong root gives 422", async () => {
    const { app } = createTestApp();
    expect((await upload(app, `<results><testcase name="a"/></results>`)).status).toBe(422);
  });

  it("REQ-ING-09: with MAX_UPLOAD_MB=1, a 1,572,864-byte report gives 413 PAYLOAD_TOO_LARGE", async () => {
    const { app, db } = createTestApp({ env: { MAX_UPLOAD_MB: "1" } });
    const res = await upload(app, Buffer.alloc(1_572_864, "a"));
    expect(res.status).toBe(413);
    expect(errorOf(res.body).code).toBe("PAYLOAD_TOO_LARGE");
    expect(counts(db).results).toBe(0);
  });

  it("REQ-ING-09: a report of exactly MAX_UPLOAD_MB is accepted", async () => {
    const { app } = createTestApp({ env: { MAX_UPLOAD_MB: "1" } });
    const xml = report([["a", "passed"]]);
    const padded = `${xml}${" ".repeat(1_048_576 - Buffer.byteLength(xml))}`;
    expect(Buffer.byteLength(padded)).toBe(1_048_576);
    expect((await upload(app, padded)).status).toBe(201);
  });

  it("REQ-ING-10: with UPLOAD_TOKEN=abc, an upload with no header or a wrong token gives 401; Bearer abc is accepted", async () => {
    const { app } = createTestApp({ env: { UPLOAD_TOKEN: "abc" } });
    const xml = report([["a", "passed"]]);
    const none = await upload(app, xml);
    expect(none.status).toBe(401);
    expect(errorOf(none.body).code).toBe("UNAUTHORIZED");
    expect((await upload(app, xml, {}, { token: "wrong" })).status).toBe(401);
    expect((await upload(app, xml).set("Authorization", "abc")).status).toBe(401);
    expect((await upload(app, xml, {}, { token: "abc" })).status).toBe(201);
  });

  it("REQ-ING-10: with UPLOAD_TOKEN empty, uploads need no token", async () => {
    const { app } = createTestApp({ env: { UPLOAD_TOKEN: "" } });
    expect((await upload(app, report([["a", "passed"]]))).status).toBe(201);
  });

  it("REQ-ING-11: when the second test case fails to store, the response is 500 and nothing is stored", async () => {
    const t = createTestApp();
    const { createApp } = await import("../../src/http/app.js");
    const { jsonLogger } = await import("../../src/logger.js");
    const { fixedClock } = await import("../../src/clock.js");
    const app = createApp(
      {
        db: t.db,
        config: t.config,
        clock: fixedClock("2026-10-24T00:00:00Z"),
        logger: jsonLogger(() => {}),
      },
      {
        ingestHooks: {
          beforeInsertResult(index) {
            if (index === 1) throw new Error("disk full");
          },
        },
      },
    );
    const res = await upload(
      app,
      report([
        ["a", "passed"],
        ["b", "passed"],
        ["c", "passed"],
      ]),
    );
    expect(res.status).toBe(500);
    expect(errorOf(res.body).code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toContain("disk full");
    expect(counts(t.db)).toEqual({ runs: 0, attempts: 0, testCases: 0, results: 0 });
  });

  it("REQ-ING-11: after a 201, GET /api/v1/tests reflects the upload", async () => {
    const { app } = createTestApp();
    expect((await upload(app, report([["cart > updates total", "passed"]]))).status).toBe(201);
    const list = await request(app).get("/api/v1/tests");
    expect(list.body.items.map((item: { name: string }) => item.name)).toEqual([
      "cart > updates total",
    ]);
  });

  it("REQ-ING-12: 146 passing, 3 failing, and 1 skipped give tests 150, passed 146, failed 3, skipped 1", async () => {
    const { app, db } = createTestApp();
    const cases: [string, "passed" | "failed" | "skipped"][] = [
      ...Array.from({ length: 146 }, (_, i) => [`p${i}`, "passed"] as [string, "passed"]),
      ...Array.from({ length: 3 }, (_, i) => [`f${i}`, "failed"] as [string, "failed"]),
      ["s", "skipped"],
    ];
    const res = await upload(app, report(cases));
    const attempt = db.prepare("SELECT id FROM attempts").get() as { id: number };
    expect(res.body).toEqual({
      attemptId: attempt.id,
      tests: 150,
      passed: 146,
      failed: 3,
      skipped: 1,
    });
  });

  it("REQ-ING-13: attempt 2 of run 100 for a different commit gives 400 and nothing is stored", async () => {
    const { app, db } = createTestApp();
    await upload(app, report([["a", "failed"]]));
    const before = counts(db);
    const res = await upload(app, report([["a", "passed"]]), { attempt: "2", commitSha: SHA_B });
    expect(res.status).toBe(400);
    expect(errorOf(res.body)).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(errorOf(res.body).message).toContain("commitSha");
    expect(counts(db)).toEqual(before);
  });

  it("REQ-ING-14: with a token required, no token, an oversized report, and a missing branch give 401", async () => {
    const { app } = createTestApp({ env: { UPLOAD_TOKEN: "abc", MAX_UPLOAD_MB: "1" } });
    const res = await upload(app, Buffer.alloc(1_572_864, "a"), { branch: undefined });
    expect(res.status).toBe(401);
  });

  it("REQ-ING-14: a valid token, an oversized report, and a missing branch give 413", async () => {
    const { app } = createTestApp({ env: { UPLOAD_TOKEN: "abc", MAX_UPLOAD_MB: "1" } });
    const res = await upload(
      app,
      Buffer.alloc(1_572_864, "a"),
      { branch: undefined },
      { token: "abc" },
    );
    expect(res.status).toBe(413);
  });

  it("REQ-ING-14: a missing branch and an invalid report give 400, not 422", async () => {
    const { app } = createTestApp();
    const res = await upload(app, "<not-xml", { branch: undefined });
    expect(res.status).toBe(400);
  });

  it("REQ-NFR-03: the real upload route logs path and status, but not the token or the report", async () => {
    const { app, logs } = createTestApp({ env: { UPLOAD_TOKEN: "s3cret-token" } });
    await upload(app, report([["report-contents-xyz", "passed"]]), {}, { token: "s3cret-token" });
    const line = logs
      .map((entry) => JSON.parse(entry) as Record<string, unknown>)
      .find((entry) => entry["path"] === "/api/v1/results");
    expect(line).toMatchObject({ method: "POST", status: 201 });
    const all = logs.join("\n");
    expect(all).not.toContain("s3cret-token");
    expect(all).not.toContain("report-contents-xyz");
  });
});

export { META };
