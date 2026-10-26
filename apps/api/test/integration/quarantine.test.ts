import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/app.js";
import { insertFacts, testCaseId, type FactRow } from "../helpers/facts.js";

const sha = (label: string) => Buffer.from(label).toString("hex").padEnd(40, "0").slice(0, 40);
const DAY = 24 * 3600 * 1000;
const ago = (days: number) =>
  new Date(Date.parse("2026-10-24T00:00:00Z") - days * DAY).toISOString();

function commits(
  name: string,
  count: number,
  flaky: number,
  extra: Partial<FactRow> = {},
): FactRow[] {
  const rows: FactRow[] = [];
  for (let i = 0; i < count; i++) {
    const label = `${name.slice(0, 8)}${i}`;
    const base = {
      runId: `run-${label}-${extra.repo ?? ""}`,
      commitSha: sha(label),
      name,
      ...extra,
    };
    if (i < flaky) {
      rows.push({
        ...base,
        attempt: 1,
        startedAt: ago(1 + i * 0.5),
        status: "failed",
        message: "boom",
      });
      rows.push({ ...base, attempt: 2, startedAt: ago(1 + i * 0.5 - 0.01), status: "passed" });
    } else {
      rows.push({ ...base, attempt: 1, startedAt: ago(1 + i * 0.5), status: "passed" });
    }
  }
  return rows;
}

const statusesOf = async (app: ReturnType<typeof createTestApp>["app"], id: number) =>
  (await request(app).get(`/api/v1/tests/${id}`)).body.scopes as {
    window: string;
    branch: string;
    status: string | null;
    quarantineSource: string | null;
  }[];

describe("manual quarantine", () => {
  it("REQ-QUA-01: quarantining a stable test case gives 201, quarantined in every scope with data, and the reason and time in the detail", async () => {
    const t = createTestApp();
    insertFacts(t.db, commits("stable one", 3, 0));
    const id = testCaseId(t.db, "stable one");
    const res = await request(t.app)
      .post(`/api/v1/tests/${id}/quarantine`)
      .send({ reason: "Times out on CI runners" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      manualQuarantine: { reason: "Times out on CI runners", at: "2026-10-24T00:00:00Z" },
    });
    const scopes = await statusesOf(t.app, id);
    for (const scope of scopes) {
      expect(scope.status).toBe(
        scope.window === "7d" || scope.window === "30d" ? "quarantined" : null,
      );
      expect(scope.quarantineSource).toBe("manual");
    }
    const detail = await request(t.app).get(`/api/v1/tests/${id}`);
    expect(detail.body.manualQuarantine).toEqual({
      reason: "Times out on CI runners",
      at: "2026-10-24T00:00:00Z",
    });
  });

  it("REQ-QUA-01: quarantining again gives 200 and updates both reason and at (PQ-10a: at comes from the clock)", async () => {
    const t = createTestApp();
    insertFacts(t.db, commits("a", 1, 0));
    const id = testCaseId(t.db, "a");
    await request(t.app).post(`/api/v1/tests/${id}/quarantine`).send({ reason: "first" });
    t.env["FLAKEWATCH_NOW"] = "2026-10-25T12:00:00Z";
    const again = await request(t.app)
      .post(`/api/v1/tests/${id}/quarantine`)
      .send({ reason: "second" });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({
      manualQuarantine: { reason: "second", at: "2026-10-25T12:00:00Z" },
    });
  });

  it.each([
    ["an empty reason", { reason: "" }],
    ["a blank reason", { reason: "   " }],
    ["a missing reason", {}],
    ["a reason that isn't text", { reason: 42 }],
    ["a reason over 500 characters", { reason: "x".repeat(501) }],
  ])("REQ-QUA-01: %s gives 400 VALIDATION_ERROR", async (_label, body) => {
    const t = createTestApp();
    insertFacts(t.db, commits("a", 1, 0));
    const res = await request(t.app)
      .post(`/api/v1/tests/${testCaseId(t.db, "a")}/quarantine`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("REQ-QUA-01: a 500-character reason is accepted, and surrounding spaces are trimmed (PQ-10b)", async () => {
    const t = createTestApp();
    insertFacts(t.db, commits("a", 1, 0));
    const id = testCaseId(t.db, "a");
    expect(
      (
        await request(t.app)
          .post(`/api/v1/tests/${id}/quarantine`)
          .send({ reason: "x".repeat(500) })
      ).status,
    ).toBe(201);
    const trimmed = await request(t.app)
      .post(`/api/v1/tests/${id}/quarantine`)
      .send({ reason: "  flaky on CI  " });
    expect(trimmed.body.manualQuarantine.reason).toBe("flaky on CI");
  });

  it("REQ-QUA-01: an unknown test case gives 404 and a non-integer id gives 400", async () => {
    const { app } = createTestApp();
    expect(
      (await request(app).post("/api/v1/tests/999/quarantine").send({ reason: "x" })).status,
    ).toBe(404);
    expect(
      (await request(app).post("/api/v1/tests/abc/quarantine").send({ reason: "x" })).status,
    ).toBe(400);
  });

  it("REQ-QUA-02: releasing a test case quarantined at 0% returns it to stable and gives 204", async () => {
    const t = createTestApp();
    insertFacts(t.db, commits("a", 3, 0));
    const id = testCaseId(t.db, "a");
    await request(t.app).post(`/api/v1/tests/${id}/quarantine`).send({ reason: "x" });
    const res = await request(t.app).delete(`/api/v1/tests/${id}/quarantine`);
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    const scopes = await statusesOf(t.app, id);
    expect(scopes.find((s) => s.window === "30d" && s.branch === "*")).toMatchObject({
      status: "stable",
      quarantineSource: null,
    });
    expect((await request(t.app).get(`/api/v1/tests/${id}`)).body.manualQuarantine).toBeNull();
  });

  it("REQ-QUA-02: releasing a test case at 40% over 30 commits leaves it quarantined with source auto", async () => {
    const t = createTestApp();
    insertFacts(t.db, commits("a", 30, 12));
    const id = testCaseId(t.db, "a");
    await request(t.app).post(`/api/v1/tests/${id}/quarantine`).send({ reason: "x" });
    expect(
      (await statusesOf(t.app, id)).find((s) => s.window === "30d" && s.branch === "*")
        ?.quarantineSource,
    ).toBe("both");
    await request(t.app).delete(`/api/v1/tests/${id}/quarantine`);
    expect(
      (await statusesOf(t.app, id)).find((s) => s.window === "30d" && s.branch === "*"),
    ).toMatchObject({ status: "quarantined", quarantineSource: "auto" });
  });

  it("REQ-QUA-02: releasing a test case that isn't manually quarantined gives 409 NOT_QUARANTINED; an unknown one gives 404 (PQ-10d)", async () => {
    const t = createTestApp();
    insertFacts(t.db, commits("a", 1, 0));
    const res = await request(t.app).delete(`/api/v1/tests/${testCaseId(t.db, "a")}/quarantine`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NOT_QUARANTINED");
    expect((await request(t.app).delete("/api/v1/tests/999/quarantine")).status).toBe(404);
  });

  it("REQ-ING-10: with UPLOAD_TOKEN=abc, quarantine and release need Bearer abc", async () => {
    const t = createTestApp({ env: { UPLOAD_TOKEN: "abc" } });
    insertFacts(t.db, commits("a", 1, 0));
    const id = testCaseId(t.db, "a");
    const url = `/api/v1/tests/${id}/quarantine`;
    expect((await request(t.app).post(url).send({ reason: "x" })).status).toBe(401);
    expect(
      (await request(t.app).post(url).set("Authorization", "Bearer nope").send({ reason: "x" }))
        .status,
    ).toBe(401);
    expect(
      (await request(t.app).post(url).set("Authorization", "Bearer abc").send({ reason: "x" }))
        .status,
    ).toBe(201);
    expect((await request(t.app).delete(url)).status).toBe(401);
    expect((await request(t.app).delete(url).set("Authorization", "Bearer abc")).status).toBe(204);
  });

  it("REQ-ING-10: the token is checked before the id and the body (PQ-10c)", async () => {
    const { app } = createTestApp({ env: { UPLOAD_TOKEN: "abc" } });
    expect((await request(app).post("/api/v1/tests/abc/quarantine").send({})).status).toBe(401);
  });
});

describe("GET /api/v1/quarantine", () => {
  it("REQ-QUA-05: lists 30d/* quarantined test cases plus every manual one, sorted by name then file, never broken", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commits("zeta flaky", 25, 5),
      ...commits("alpha flaky", 25, 5, { file: "tests/b.test.ts" }),
      ...commits("alpha flaky", 25, 5, { file: "tests/a.test.ts" }),
      ...commits("barely flaky", 25, 1),
      ...commits("stable one", 3, 0),
      // Broken and meeting the rule, and also manually quarantined: still never listed (PQ-09).
      // Index 0 is the newest commit, so its three most recent commits failed.
      ...commits("broken one", 25, 0).map((row, i) =>
        i < 3 ? { ...row, status: "failed" as const } : row,
      ),
      ...commits("other repo", 25, 5, { repo: "demo/other" }),
      // Manually quarantined with no results in the last 30 days.
      {
        runId: "old",
        commitSha: sha("old"),
        startedAt: ago(40),
        name: "old manual",
        status: "passed",
      },
    ]);
    for (const name of ["stable one", "old manual", "broken one"]) {
      await request(t.app)
        .post(`/api/v1/tests/${testCaseId(t.db, name)}/quarantine`)
        .send({ reason: "manual" });
    }
    const res = await request(t.app).get("/api/v1/quarantine?repo=demo/shoplite");
    expect(res.status).toBe(200);
    expect(res.body.repo).toBe("demo/shoplite");
    expect(res.body.asOf).toBe("2026-10-24T00:00:00Z");
    expect(
      res.body.items.map((i: { name: string; file: string; quarantineSource: string }) => [
        i.name,
        i.file,
        i.quarantineSource,
      ]),
    ).toEqual([
      ["alpha flaky", "tests/a.test.ts", "auto"],
      ["alpha flaky", "tests/b.test.ts", "auto"],
      ["old manual", "tests/example.test.ts", "manual"],
      ["stable one", "tests/example.test.ts", "manual"],
      ["zeta flaky", "tests/example.test.ts", "auto"],
    ]);
    expect(Object.keys(res.body.items[0]).sort()).toEqual([
      "classname",
      "file",
      "id",
      "name",
      "quarantineSource",
    ]);
  });

  it("REQ-QUA-05: a test case manually quarantined with no results in 30 days is in the list", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      { runId: "old", commitSha: sha("o"), startedAt: ago(45), name: "quiet", status: "passed" },
    ]);
    await request(t.app)
      .post(`/api/v1/tests/${testCaseId(t.db, "quiet")}/quarantine`)
      .send({ reason: "manual" });
    const res = await request(t.app).get("/api/v1/quarantine?repo=demo/shoplite");
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual(["quiet"]);
  });

  it("REQ-QUA-05: repo is required, and the list is not paginated", async () => {
    const t = createTestApp();
    const rows: FactRow[] = [];
    for (let i = 0; i < 120; i++) rows.push(...commits(`q${String(i).padStart(3, "0")}`, 20, 4));
    insertFacts(t.db, rows);
    expect((await request(t.app).get("/api/v1/quarantine")).status).toBe(400);
    expect((await request(t.app).get("/api/v1/quarantine?repo=")).status).toBe(400);
    expect(
      (await request(t.app).get("/api/v1/quarantine?repo=demo/shoplite")).body.items,
    ).toHaveLength(120);
  });
});
