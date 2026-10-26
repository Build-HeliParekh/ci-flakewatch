import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/app.js";
import { insertFacts, testCaseId, type FactRow } from "../helpers/facts.js";

/** A unique 40-character SHA per label (hex-encoded, so labels never collide; RETRO R-08). */
const sha = (label: string) => Buffer.from(label).toString("hex").padEnd(40, "0").slice(0, 40);

const DAY = 24 * 3600 * 1000;
/** An ISO time `days` days (may be fractional) before 2026-10-24T00:00:00Z. */
const ago = (days: number) =>
  new Date(Date.parse("2026-10-24T00:00:00Z") - days * DAY).toISOString();

/** One commit's results for one test case: attempt k gets statuses[k-1]. */
function commitRows(
  name: string,
  label: string,
  statuses: FactRow["status"][],
  extra: Partial<FactRow> = {},
  daysAgo = 1,
): FactRow[] {
  return statuses.map((status, i) => ({
    runId: `run-${label}`,
    attempt: i + 1,
    commitSha: sha(label),
    startedAt: ago(daysAgo - i * 0.01),
    name,
    status,
    ...(status === "failed" ? { message: `failure ${label}/${i + 1}` } : {}),
    ...extra,
  }));
}

const errorOf = (body: unknown) => (body as { error: { code: string } }).error;

describe("GET /api/v1/tests", () => {
  const seeded = () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commitRows("flaky one", "c1", ["failed", "passed"]),
      ...commitRows("flaky one", "c2", ["passed"]),
      ...commitRows("stable one", "c1", ["passed"]),
      ...commitRows("stable one", "c2", ["passed"]),
      ...commitRows("other repo", "x1", ["passed"], { repo: "demo/other" }),
    ]);
    return t;
  };

  it("REQ-API-03: defaults to every repo, *, 30d, flakeRate desc, page 1 of 25, with asOf", async () => {
    const { app } = seeded();
    const res = await request(app).get("/api/v1/tests");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      page: 1,
      pageSize: 25,
      total: 3,
      asOf: "2026-10-24T00:00:00Z",
    });
    expect(res.body.items[0]).toMatchObject({
      name: "flaky one",
      status: "flaky",
      flakyCommits: 1,
      commitsRun: 2,
      flakeRate: 0.5,
      failedAttempts: 1,
    });
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      [
        "id",
        "repo",
        "name",
        "file",
        "classname",
        "status",
        "quarantineSource",
        "flakeRate",
        "flakyCommits",
        "commitsRun",
        "failedAttempts",
        "unconfirmedFailures",
        "skippedResults",
        "lastSeenAt",
      ].sort(),
    );
  });

  it("REQ-API-03: filters by repo, status, and q; unknown repo or branch give an empty list", async () => {
    const { app } = seeded();
    const names = async (query: string) =>
      ((await request(app).get(`/api/v1/tests?${query}`)).body.items as { name: string }[]).map(
        (i) => i.name,
      );
    expect(await names("repo=demo/other")).toEqual(["other repo"]);
    expect(await names("status=stable&repo=demo/shoplite")).toEqual(["stable one"]);
    expect(await names("status=flaky,quarantined")).toEqual(["flaky one"]);
    expect(await names("q=STABLE")).toEqual(["stable one"]);
    expect(await names("repo=nobody/here")).toEqual([]);
    expect(await names("branch=no-such-branch")).toEqual([]);
  });

  it("REQ-API-03: sort, order, and paging; a page beyond the end has no items but the right total", async () => {
    const { app } = seeded();
    const byName = await request(app).get("/api/v1/tests?sort=name&pageSize=2");
    expect(byName.body.items.map((i: { name: string }) => i.name)).toEqual([
      "flaky one",
      "other repo",
    ]);
    const page2 = await request(app).get("/api/v1/tests?sort=name&pageSize=2&page=2");
    expect(page2.body.items.map((i: { name: string }) => i.name)).toEqual(["stable one"]);
    const beyond = await request(app).get("/api/v1/tests?page=9");
    expect(beyond.body).toMatchObject({ items: [], total: 3, page: 9 });
  });

  it.each([
    "window=14d",
    "pageSize=101",
    "pageSize=0",
    "page=0",
    "page=abc",
    "sort=bogus",
    "order=up",
    "status=broken,nope",
    `q=${"x".repeat(201)}`,
    "window=7d&window=30d",
    "q=",
    "branch=",
  ])("REQ-API-01: %s gives 400 VALIDATION_ERROR", async (query) => {
    const { app } = seeded();
    const res = await request(app).get(`/api/v1/tests?${query}`);
    expect(res.status).toBe(400);
    expect(errorOf(res.body).code).toBe("VALIDATION_ERROR");
  });

  it("REQ-API-01: an undocumented parameter is ignored", async () => {
    const { app } = seeded();
    const plain = await request(app).get("/api/v1/tests");
    const extra = await request(app).get("/api/v1/tests?foo=1");
    expect(extra.body).toEqual(plain.body);
  });

  it("REQ-API-01: timestamps are UTC to the second with Z", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      {
        runId: "r",
        commitSha: sha("t"),
        startedAt: "2026-10-23T09:00:00.789+02:00",
        name: "a",
        status: "passed",
      },
    ]);
    const res = await request(t.app).get("/api/v1/tests");
    expect(res.body.items[0].lastSeenAt).toBe("2026-10-23T07:00:00Z");
  });

  it("REQ-CLS-05: a test case whose only results are 12 days old is in 30d but not 7d; skipped-only is in neither", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commitRows("old", "o1", ["passed"], {}, 12),
      ...commitRows("skipped only", "s1", ["skipped"]),
    ]);
    const names = async (window: string) =>
      (
        (await request(t.app).get(`/api/v1/tests?window=${window}`)).body.items as {
          name: string;
        }[]
      ).map((i) => i.name);
    expect(await names("30d")).toEqual(["old"]);
    expect(await names("7d")).toEqual([]);
  });

  it("REQ-STA-06: changing FLAKEWATCH_NOW between two requests moves the windows (REQ-NFR-04)", async () => {
    const t = createTestApp();
    insertFacts(t.db, commitRows("a", "c1", ["passed"], {}, 5));
    expect((await request(t.app).get("/api/v1/tests?window=7d")).body.total).toBe(1);
    t.env["FLAKEWATCH_NOW"] = "2026-10-30T00:00:00Z";
    const later = await request(t.app).get("/api/v1/tests?window=7d");
    expect(later.body).toMatchObject({ total: 0, asOf: "2026-10-30T00:00:00Z" });
  });

  it("REQ-NFR-04: windows are measured back from FLAKEWATCH_NOW", async () => {
    const t = createTestApp({ now: "2026-11-30T00:00:00Z" });
    insertFacts(t.db, commitRows("a", "c1", ["passed"], {}, 1));
    expect((await request(t.app).get("/api/v1/tests")).body.total).toBe(0);
  });

  it("REQ-ING-10: with UPLOAD_TOKEN=abc, GET /api/v1/tests without a header gives 200", async () => {
    const { app } = createTestApp({ env: { UPLOAD_TOKEN: "abc" } });
    expect((await request(app).get("/api/v1/tests")).status).toBe(200);
  });
});

describe("GET /api/v1/repos", () => {
  it("REQ-API-02: every repo with its branches, both in code-point order", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commitRows("a", "z1", ["passed"], { repo: "zeta/z", branch: "main" }),
      ...commitRows("a", "a1", ["passed"], { branch: "main" }),
      ...commitRows("a", "a2", ["passed"], { branch: "Feature/b" }),
      ...commitRows("a", "a3", ["passed"], { branch: "feature/a" }),
    ]);
    const res = await request(t.app).get("/api/v1/repos");
    expect(res.body).toEqual({
      items: [
        { name: "demo/shoplite", branches: ["Feature/b", "feature/a", "main"] },
        { name: "zeta/z", branches: ["main"] },
      ],
    });
  });

  it("REQ-API-02: an empty database gives no repos", async () => {
    const { app } = createTestApp();
    expect((await request(app).get("/api/v1/repos")).body).toEqual({ items: [] });
  });
});

describe("GET /api/v1/summary", () => {
  it("REQ-API-04: counts statuses over test cases with data, and sums failedAttempts of flaky and quarantined ones", async () => {
    const t = createTestApp();
    const rows: FactRow[] = [];
    // Two flaky test cases failing in the same attempt: that attempt counts twice.
    for (const name of ["flaky a", "flaky b"])
      rows.push(
        ...commitRows(name, "c1", ["failed", "passed"]),
        ...commitRows(name, "c2", ["passed"]),
      );
    // A broken one: 3 commits failed.
    for (const label of ["b1", "b2", "b3"]) rows.push(...commitRows("broken", label, ["failed"]));
    rows.push(...commitRows("stable", "s1", ["passed"]));
    rows.push(...commitRows("skipped only", "k1", ["skipped"]));
    insertFacts(t.db, rows);
    const res = await request(t.app).get("/api/v1/summary");
    expect(res.body).toEqual({
      asOf: "2026-10-24T00:00:00Z",
      broken: 1,
      quarantined: 0,
      flaky: 2,
      stable: 1,
      failedAttemptsFromFlakes: 2,
    });
  });

  it("REQ-API-04: takes repo, branch, and window, and validates them", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commitRows("a", "c1", ["passed"], { branch: "dev" }),
      ...commitRows("b", "c2", ["passed"], {}, 20),
    ]);
    expect((await request(t.app).get("/api/v1/summary?branch=dev")).body.stable).toBe(1);
    expect((await request(t.app).get("/api/v1/summary?window=7d")).body.stable).toBe(1);
    expect((await request(t.app).get("/api/v1/summary?repo=x/y")).body.stable).toBe(0);
    expect((await request(t.app).get("/api/v1/summary?window=1d")).status).toBe(400);
  });
});

describe("GET /api/v1/tests/:id", () => {
  it("REQ-API-05: identity, manualQuarantine, six scopes for two branches in order, and recent errors", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commitRows("a", "m1", ["failed", "passed"], { branch: "main" }, 2),
      ...commitRows("a", "f1", ["passed"], { branch: "feature/x" }, 10),
    ]);
    const id = testCaseId(t.db, "a");
    const res = await request(t.app).get(`/api/v1/tests/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      repo: "demo/shoplite",
      file: "tests/example.test.ts",
      classname: "",
      name: "a",
      manualQuarantine: null,
    });
    expect(
      res.body.scopes.map((s: { window: string; branch: string }) => `${s.window} ${s.branch}`),
    ).toEqual(["7d *", "7d feature/x", "7d main", "30d *", "30d feature/x", "30d main"]);
    expect(res.body.scopes[1]).toMatchObject({ commitsRun: 0, status: null });
    expect(res.body.scopes[5]).toMatchObject({ status: "flaky", flakyCommits: 1, commitsRun: 1 });
    expect(res.body.recentErrors).toEqual([
      {
        commitSha: sha("m1"),
        branch: "main",
        attempt: 1,
        startedAt: `${ago(2).slice(0, 19)}Z`,
        message: "failure m1/1",
      },
    ]);
  });

  it("REQ-API-05: recent errors are the 5 newest failure messages, newest first", async () => {
    const t = createTestApp();
    const rows: FactRow[] = [];
    for (let i = 1; i <= 7; i++) rows.push(...commitRows("a", `e${i}`, ["failed"], {}, 8 - i));
    insertFacts(t.db, rows);
    const res = await request(t.app).get(`/api/v1/tests/${testCaseId(t.db, "a")}`);
    expect(res.body.recentErrors.map((e: { message: string }) => e.message)).toEqual([
      "failure e7/1",
      "failure e6/1",
      "failure e5/1",
      "failure e4/1",
      "failure e3/1",
    ]);
  });

  it("REQ-API-01: an unknown id gives 404 NOT_FOUND in the error format; a non-integer id gives 400", async () => {
    const { app } = createTestApp();
    const missing = await request(app).get("/api/v1/tests/999999");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({
      error: { code: "NOT_FOUND", message: expect.any(String) as string },
    });
    expect((await request(app).get("/api/v1/tests/abc")).status).toBe(400);
    expect((await request(app).get("/api/v1/tests/0")).status).toBe(400);
  });

  it("REQ-QUA-03: a broken test case that also meets the automatic rule has status broken and source auto", async () => {
    const t = createTestApp({ env: { QUARANTINE_MIN_COMMITS: "3" } });
    const rows: FactRow[] = [];
    for (let i = 1; i <= 4; i++)
      rows.push(...commitRows("a", `f${i}`, ["failed", "passed"], {}, 10 + i));
    for (let i = 1; i <= 3; i++) rows.push(...commitRows("a", `b${i}`, ["failed"], {}, 4 - i));
    insertFacts(t.db, rows);
    const res = await request(t.app).get(`/api/v1/tests/${testCaseId(t.db, "a")}`);
    const scope = res.body.scopes.find(
      (s: { window: string; branch: string }) => s.window === "30d" && s.branch === "*",
    );
    expect(scope).toMatchObject({ status: "broken", quarantineSource: "auto" });
  });
});

describe("GET /api/v1/tests/:id/history", () => {
  const history = async (t: ReturnType<typeof createTestApp>, name: string, query = "") =>
    (await request(t.app).get(`/api/v1/tests/${testCaseId(t.db, name)}/history${query}`)).body as {
      commits: {
        commitSha: string;
        outcome: string;
        rerun: boolean;
        branches: string[];
        firstStartedAt: string;
        attempts: unknown[];
      }[];
      trend: { date: string; flakeRate: number | null }[];
    };

  it("REQ-API-06: failed then passed is flaky with rerun; a single failed is failed without rerun", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commitRows("a", "c1", ["failed", "passed"], {}, 2),
      ...commitRows("a", "c2", ["failed"], {}, 1),
    ]);
    const { commits } = await history(t, "a");
    expect(commits.map((c) => [c.commitSha, c.outcome, c.rerun])).toEqual([
      [sha("c2"), "failed", false],
      [sha("c1"), "flaky", true],
    ]);
  });

  it("REQ-API-06: two failed results in one attempt (an in-run retry) count as a rerun", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      { runId: "r", commitSha: sha("c"), startedAt: ago(1), name: "a", status: "failed" },
      { runId: "r", commitSha: sha("c"), startedAt: ago(1), name: "a", status: "failed" },
    ]);
    const { commits } = await history(t, "a");
    expect(commits[0]).toMatchObject({ outcome: "failed", rerun: true });
    expect(commits[0]?.attempts).toHaveLength(2);
  });

  it("REQ-API-06: each commit has branches, firstStartedAt, and one attempt entry per result", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      {
        runId: "r1",
        commitSha: sha("c"),
        branch: "main",
        startedAt: "2026-10-20T10:00:00Z",
        name: "a",
        status: "failed",
        durationMs: 1200,
      },
      {
        runId: "r1",
        attempt: 2,
        commitSha: sha("c"),
        branch: "main",
        startedAt: "2026-10-20T10:15:00Z",
        name: "a",
        status: "passed",
        durationMs: 900,
      },
      {
        runId: "r2",
        commitSha: sha("c"),
        branch: "dev",
        startedAt: "2026-10-20T11:00:00Z",
        name: "a",
        status: "passed",
        durationMs: 800,
      },
    ]);
    const { commits } = await history(t, "a");
    expect(commits).toEqual([
      {
        commitSha: sha("c"),
        branches: ["dev", "main"],
        firstStartedAt: "2026-10-20T10:00:00Z",
        outcome: "flaky",
        rerun: true,
        attempts: [
          { attempt: 1, startedAt: "2026-10-20T10:00:00Z", status: "failed", durationMs: 1200 },
          { attempt: 2, startedAt: "2026-10-20T10:15:00Z", status: "passed", durationMs: 900 },
          { attempt: 1, startedAt: "2026-10-20T11:00:00Z", status: "passed", durationMs: 800 },
        ],
      },
    ]);
  });

  it("REQ-API-06: at most the 100 most recent commits, newest first, in the requested scope", async () => {
    const t = createTestApp();
    const rows: FactRow[] = [];
    for (let i = 0; i < 120; i++)
      rows.push(...commitRows("a", `c${i}`, ["passed"], {}, 25 - i * 0.2));
    rows.push(...commitRows("a", "dev1", ["passed"], { branch: "dev" }, 0.5));
    insertFacts(t.db, rows);
    const all = await history(t, "a");
    expect(all.commits).toHaveLength(100);
    expect(all.commits[0]?.commitSha).toBe(sha("dev1"));
    const main7d = await history(t, "a", "?branch=main&window=7d");
    expect(main7d.commits.every((c) => c.branches.join() === "main")).toBe(true);
    expect(main7d.commits.length).toBeLessThan(40);
  });

  it("REQ-API-06: commits with only skipped results are left out (PQ-08)", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commitRows("a", "s1", ["skipped"]),
      ...commitRows("a", "p1", ["passed"], {}, 2),
    ]);
    expect((await history(t, "a")).commits.map((c) => c.commitSha)).toEqual([sha("p1")]);
  });

  it("REQ-STA-05: the trend has 30 daily points ending yesterday, with null where there were no commits", async () => {
    const t = createTestApp();
    insertFacts(t.db, [
      ...commitRows("a", "c1", ["failed", "passed"], {}, 1.5),
      ...commitRows("a", "c2", ["passed"], {}, 1.4),
    ]);
    const { trend } = await history(t, "a");
    expect(trend).toHaveLength(30);
    expect(trend[0]).toEqual({ date: "2026-09-24", flakeRate: null });
    expect(trend[29]).toEqual({ date: "2026-10-23", flakeRate: 0.5 });
  });

  it("REQ-API-06: validates branch and window, and gives 404 for an unknown id", async () => {
    const t = createTestApp();
    insertFacts(t.db, commitRows("a", "c1", ["passed"]));
    const id = testCaseId(t.db, "a");
    expect((await request(t.app).get(`/api/v1/tests/${id}/history?window=14d`)).status).toBe(400);
    expect((await request(t.app).get(`/api/v1/tests/${id}/history?branch=`)).status).toBe(400);
    expect((await request(t.app).get("/api/v1/tests/424242/history")).status).toBe(404);
  });
});
