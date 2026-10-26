// npm run bench (REQ-NFR-01): an in-process API on a temporary database, ShopLite seeded through
// HTTP (timed against 2 minutes), then 50 calls to each endpoint, reporting p95 against targets.
// Not part of npm test or CI. SHOULD-level: misses are flagged, never fatal.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import type { AddressInfo } from "node:net";
import { fixedClock } from "../../../apps/api/src/clock.js";
import { loadConfig } from "../../../apps/api/src/config.js";
import { migrate, openDb } from "../../../apps/api/src/db/open.js";
import { createApp } from "../../../apps/api/src/http/app.js";
import { jsonLogger } from "../../../apps/api/src/logger.js";
import { generateScenario, toJUnitXml, uploadAll } from "../../seed/src/index.js";
import { check, formatReport, type BenchResult } from "./stats.js";

const CALLS = 50;
const dir = mkdtempSync(path.join(tmpdir(), "flakewatch-bench-"));
const db = openDb(path.join(dir, "bench.db"));
migrate(db);
const app = createApp({
  db,
  config: loadConfig({}),
  clock: fixedClock("2026-10-24T00:00:00Z"),
  logger: jsonLogger(() => {}),
});
const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

async function time(call: () => Promise<Response>): Promise<number> {
  const start = performance.now();
  const response = await call();
  await response.arrayBuffer();
  if (!response.ok) throw new Error(`benchmark call failed: ${response.status}`);
  return performance.now() - start;
}

async function sample(call: () => Promise<Response>): Promise<number[]> {
  await time(call); // warm-up
  const samples: number[] = [];
  for (let i = 0; i < CALLS; i++) samples.push(await time(call));
  return samples;
}

try {
  const attempts = generateScenario();
  const seed = await uploadAll(attempts, { api });
  const results: BenchResult[] = [
    {
      name: `seed ShopLite (${seed.attempts} uploads)`,
      p95Ms: seed.elapsedMs,
      targetMs: 120_000,
      over: seed.elapsedMs > 120_000,
    },
  ];

  results.push(check("GET /api/v1/tests", await sample(() => fetch(`${api}/api/v1/tests`)), 300));
  results.push(
    check("GET /api/v1/summary", await sample(() => fetch(`${api}/api/v1/summary`)), 300),
  );
  const list = (await (await fetch(`${api}/api/v1/tests?pageSize=1`)).json()) as {
    items: { id: number }[];
  };
  const id = list.items[0]?.id ?? 1;
  results.push(
    check(
      "GET /api/v1/tests/:id/history",
      await sample(() => fetch(`${api}/api/v1/tests/${id}/history`)),
      500,
    ),
  );

  // A 150-test upload, re-uploading one attempt so the database stays the same size.
  const one = attempts[attempts.length - 1];
  if (!one) throw new Error("no attempts");
  const upload = () => {
    const form = new FormData();
    form.set("repo", one.repo);
    form.set("branch", one.branch);
    form.set("commitSha", one.commitSha);
    form.set("runId", one.runId);
    form.set("attempt", String(one.attempt));
    form.set("startedAt", `${one.startedAt.toISOString().slice(0, 19)}Z`);
    form.set("report", new Blob([toJUnitXml(one)]), "report.xml");
    return fetch(`${api}/api/v1/results`, { method: "POST", body: form });
  };
  results.push(check("POST /api/v1/results (150 tests)", await sample(upload), 200));

  console.log(formatReport(results));
  const over = results.filter((r) => r.over).length;
  console.log(over === 0 ? "bench: every target met" : `bench: ${over} target(s) missed`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
