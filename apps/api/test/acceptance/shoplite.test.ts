// The ShopLite acceptance suite (PLAN T-24): seeds the default scenario through
// POST /api/v1/results with FLAKEWATCH_NOW = --end, then checks SPEC §12 exactly.
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateScenario, uploadAll } from "../../../../tools/seed/src/index.js";
import { createTestApp } from "../helpers/app.js";

let t: ReturnType<typeof createTestApp>;
let server: Server;

beforeAll(async () => {
  t = createTestApp({ now: "2026-10-24T00:00:00Z" });
  server = t.app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  await uploadAll(generateScenario(), { api: `http://127.0.0.1:${port}` });
}, 120_000);

afterAll(() => {
  server.close();
});

interface Item {
  id: number;
  name: string;
  status: string;
  quarantineSource: string | null;
  flakyCommits: number;
  commitsRun: number;
  flakeRate: number;
  failedAttempts: number;
  unconfirmedFailures: number;
}
interface Scope extends Omit<Item, "id" | "name"> {
  window: string;
  branch: string;
}

const get = async <T>(path: string): Promise<T> => {
  const res = await request(t.app).get(`/api/v1${path}`);
  expect(res.status, path).toBe(200);
  return res.body as T;
};

const all = async (window = "30d") =>
  (await get<{ items: Item[] }>(`/tests?window=${window}&pageSize=100&page=1`)).items.concat(
    (await get<{ items: Item[] }>(`/tests?window=${window}&pageSize=100&page=2`)).items,
  );

const find = async (name: string, window = "30d") =>
  (await all(window)).find((item) => item.name === name);

const scopeOf = async (name: string, window: string, branch: string) => {
  const item = await find(name);
  const detail = await get<{ scopes: Scope[] }>(`/tests/${item?.id}`);
  return detail.scopes.find((s) => s.window === window && s.branch === branch);
};

describe("ShopLite scenario", () => {
  it("REQ-SEED-03: 384 commits, 192 of them in 30d, across exactly 4 branches, and 151 test cases in the database", () => {
    const n = (sql: string) => (t.db.prepare(sql).get() as { n: number }).n;
    expect(n("SELECT COUNT(DISTINCT commit_sha) AS n FROM runs")).toBe(384);
    expect(
      n(`SELECT COUNT(DISTINCT r.commit_sha) AS n FROM runs r JOIN attempts a ON a.run_pk = r.id
         WHERE a.attempt = 1 AND a.started_at_ms > ${Date.parse("2026-09-24T00:00:00Z")}`),
    ).toBe(192);
    expect(n("SELECT COUNT(DISTINCT branch) AS n FROM runs")).toBe(4);
    expect(n("SELECT COUNT(*) AS n FROM test_cases")).toBe(151);
  });

  it("REQ-API-02: one repo with four branches, in code-point order", async () => {
    expect(await get("/repos")).toEqual({
      items: [
        {
          name: "demo/shoplite",
          branches: ["feature/avatar-v2", "feature/new-checkout", "fix/search-performance", "main"],
        },
      ],
    });
  });

  it("REQ-API-04: the 30d/* summary equals the example; 7d/* has broken 1, quarantined 2, flaky 2, stable 145", async () => {
    expect(await get("/summary")).toEqual({
      asOf: "2026-10-24T00:00:00Z",
      broken: 1,
      quarantined: 3,
      flaky: 2,
      stable: 145,
      failedAttemptsFromFlakes: 161,
    });
    expect(await get("/summary?window=7d")).toMatchObject({
      broken: 1,
      quarantined: 2,
      flaky: 2,
      stable: 145,
    });
  });

  it("REQ-API-03: with default parameters, the first five items are auth, orders, cart, profile, and search, in order", async () => {
    const { items } = await get<{ items: Item[] }>("/tests");
    expect(items.slice(0, 5).map((i) => i.name)).toEqual([
      "auth > redirects after sso",
      "orders > exports csv",
      "cart > updates total",
      "profile > uploads avatar",
      "search > paginates results",
    ]);
    expect(items[0]?.flakeRate).toBe(77 / 192);
  });

  it("REQ-SEED-05: the top five; profile and search tie on rate and attempts and are ordered by name", async () => {
    const { items } = await get<{ items: Item[] }>("/tests");
    const [, , , profile, search] = items;
    expect(profile?.flakeRate).toBe(search?.flakeRate);
    expect(profile?.failedAttempts).toBe(search?.failedAttempts);
    expect((profile?.name ?? "") < (search?.name ?? "")).toBe(true);
  });

  it("REQ-API-03: window=7d&status=flaky,quarantined returns only those statuses", async () => {
    const { items } = await get<{ items: Item[] }>(
      "/tests?window=7d&status=flaky,quarantined&pageSize=100",
    );
    expect(items.length).toBe(4);
    for (const item of items) expect(["flaky", "quarantined"]).toContain(item.status);
  });

  it("REQ-SEED-05: checkout > applies discount code is stable at 0", async () => {
    expect(await find("checkout > applies discount code")).toMatchObject({
      status: "stable",
      flakeRate: 0,
    });
  });

  it("REQ-SEED-05: auth > redirects after sso is 77/192, auto-quarantined, rank 1; 7d 18/44 quarantined", async () => {
    expect(await find("auth > redirects after sso")).toMatchObject({
      flakyCommits: 77,
      commitsRun: 192,
      status: "quarantined",
      quarantineSource: "auto",
    });
    expect(await find("auth > redirects after sso", "7d")).toMatchObject({
      flakyCommits: 18,
      commitsRun: 44,
      status: "quarantined",
    });
  });

  it("REQ-SEED-05: cart > updates total is 29/192 auto-quarantined; 7d 7/44 quarantined", async () => {
    expect(await find("cart > updates total")).toMatchObject({
      flakyCommits: 29,
      commitsRun: 192,
      status: "quarantined",
      quarantineSource: "auto",
    });
    expect(await find("cart > updates total", "7d")).toMatchObject({
      flakyCommits: 7,
      commitsRun: 44,
      status: "quarantined",
    });
  });

  it("REQ-SEED-05: search > paginates results is 9/192 flaky; 7d 2/44 flaky", async () => {
    expect(await find("search > paginates results")).toMatchObject({
      flakyCommits: 9,
      commitsRun: 192,
      status: "flaky",
    });
    expect(await find("search > paginates results", "7d")).toMatchObject({
      flakyCommits: 2,
      commitsRun: 44,
      status: "flaky",
    });
  });

  it("REQ-SEED-05: payments > refunds partial is broken in 7d and 30d with 96 unconfirmed failures in 30d", async () => {
    expect(await find("payments > refunds partial")).toMatchObject({
      status: "broken",
      unconfirmedFailures: 96,
    });
    expect(await find("payments > refunds partial", "7d")).toMatchObject({ status: "broken" });
  });

  it("REQ-SEED-05: profile > uploads avatar is 9/192 flaky on *, 9/29 quarantined on feature/avatar-v2, 2/7 flaky in 7d there, stable on main", async () => {
    expect(await find("profile > uploads avatar")).toMatchObject({
      flakyCommits: 9,
      commitsRun: 192,
      status: "flaky",
    });
    expect(await scopeOf("profile > uploads avatar", "30d", "feature/avatar-v2")).toMatchObject({
      flakyCommits: 9,
      commitsRun: 29,
      status: "quarantined",
    });
    expect(await scopeOf("profile > uploads avatar", "7d", "feature/avatar-v2")).toMatchObject({
      flakyCommits: 2,
      commitsRun: 7,
      status: "flaky",
    });
    expect(await scopeOf("profile > uploads avatar", "30d", "main")).toMatchObject({
      status: "stable",
    });
  });

  it("REQ-API-05: profile > uploads avatar is quarantined in 30d/feature/avatar-v2, flaky in 7d/feature/avatar-v2, stable in 30d/main", async () => {
    expect((await scopeOf("profile > uploads avatar", "30d", "feature/avatar-v2"))?.status).toBe(
      "quarantined",
    );
    expect((await scopeOf("profile > uploads avatar", "7d", "feature/avatar-v2"))?.status).toBe(
      "flaky",
    );
    expect((await scopeOf("profile > uploads avatar", "30d", "main"))?.status).toBe("stable");
  });

  it("REQ-SEED-05: orders > exports csv is 37/192 quarantined; 7d 0/44 stable", async () => {
    expect(await find("orders > exports csv")).toMatchObject({
      flakyCommits: 37,
      commitsRun: 192,
      status: "quarantined",
    });
    expect(await find("orders > exports csv", "7d")).toMatchObject({
      flakyCommits: 0,
      commitsRun: 44,
      status: "stable",
    });
  });

  it("REQ-DET-05: catalog > syncs stock and its rename are two test cases; the old one has 62 commits in 30d and is absent from 7d", async () => {
    const old = await find("catalog > syncs stock");
    const renamed = await find("catalog > syncs stock levels");
    expect(old).toMatchObject({ commitsRun: 62, status: "stable" });
    expect(renamed?.status).toBe("stable");
    expect(old?.id).not.toBe(renamed?.id);
    expect(await find("catalog > syncs stock", "7d")).toBeUndefined();
    expect(await find("catalog > syncs stock levels", "7d")).toBeDefined();
  });

  it("REQ-SEED-05: every other test case is stable", async () => {
    const planted = new Set([
      "auth > redirects after sso",
      "cart > updates total",
      "search > paginates results",
      "payments > refunds partial",
      "profile > uploads avatar",
      "orders > exports csv",
    ]);
    const items = await all();
    expect(items).toHaveLength(151);
    for (const item of items)
      if (!planted.has(item.name)) expect(item.status, item.name).toBe("stable");
  });

  it("REQ-QUA-05: the quarantine list is exactly auth, cart, and orders, and doesn't contain payments", async () => {
    const list = await get<{ items: { name: string }[] }>("/quarantine?repo=demo/shoplite");
    expect(list.items.map((i) => i.name)).toEqual([
      "auth > redirects after sso",
      "cart > updates total",
      "orders > exports csv",
    ]);
  });

  it("REQ-STA-05: the orders > exports csv trend is 0 for days −4 to −1 and between 0.15 and 0.45 at day −20", async () => {
    const item = await find("orders > exports csv");
    const { trend } = await get<{ trend: { date: string; flakeRate: number | null }[] }>(
      `/tests/${item?.id}/history`,
    );
    expect(trend.slice(-4).map((p) => p.flakeRate)).toEqual([0, 0, 0, 0]);
    const day20 = trend.find((p) => p.date === "2026-10-04")?.flakeRate ?? -1;
    expect(day20).toBeGreaterThanOrEqual(0.15);
    expect(day20).toBeLessThanOrEqual(0.45);
  });
});
