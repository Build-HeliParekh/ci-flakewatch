// createTestApp: the real app on a fresh in-memory database, with a test clock and captured
// logs (PLAN §3.7).
//
//   const { app, db, env, logs } = createTestApp();          // now = 2026-10-24T00:00:00Z
//   const t = createTestApp({ now: "2026-10-30T00:00:00Z", env: { UPLOAD_TOKEN: "abc" } });
//   t.env["FLAKEWATCH_NOW"] = "...";                        // the next request uses the new time
//
// The clock never falls back to the real time: a test that unsets FLAKEWATCH_NOW and then needs
// the time fails loudly instead of depending on when it runs.
import type { Router } from "express";
import { envClock, type Clock } from "../../src/clock.js";
import { loadConfig } from "../../src/config.js";
import { createApp } from "../../src/http/app.js";
import { jsonLogger } from "../../src/logger.js";
import { createTestDb } from "./db.js";

export const TEST_NOW = "2026-10-24T00:00:00Z";

export interface TestAppOptions {
  /** FLAKEWATCH_NOW for the app; default TEST_NOW. */
  now?: string;
  /** Extra environment variables (validated with loadConfig, like the real server). */
  env?: Record<string, string>;
  /** Extra routers mounted under /api/v1, for testing app-wide behavior. */
  routes?: Router[];
  /** Replace the clock (e.g. to count calls). */
  clock?: Clock;
}

export function createTestApp(options: TestAppOptions = {}) {
  const env: Record<string, string | undefined> = {
    FLAKEWATCH_NOW: options.now ?? TEST_NOW,
    ...options.env,
  };
  const config = loadConfig(env);
  const db = createTestDb();
  const logs: string[] = [];
  const logger = jsonLogger((line) => logs.push(line));
  const clock =
    options.clock ??
    envClock(env, () => {
      throw new Error("createTestApp: the test needs FLAKEWATCH_NOW but it is unset");
    });
  const app = createApp({ db, config, clock, logger }, { extraRoutes: options.routes ?? [] });

  /** Parsed log entries. */
  const entries = () => logs.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { app, db, env, config, logs, entries };
}
