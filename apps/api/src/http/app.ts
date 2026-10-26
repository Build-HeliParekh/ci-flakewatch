// The Express app: JSON, errors, logging, CORS, and one `now` per request (PLAN §3.4).
import type { Express, Response, Router } from "express";
import type { Clock } from "../clock.js";
import type { Config } from "../config.js";
import type { Db } from "../db/open.js";
import type { Logger } from "../logger.js";

export interface AppDeps {
  db: Db;
  config: Config;
  clock: Clock;
  logger: Logger;
}

export interface AppOptions {
  /** Extra routers mounted under /api/v1 before the 404 handler (for tests). */
  extraRoutes?: readonly Router[];
}

/**
 * Creates the app. Every response is JSON (except 204). Unknown routes give `404 NOT_FOUND`,
 * `HttpError`s give their code and status, and anything else gives `500 INTERNAL_ERROR`
 * without a stack trace (REQ-API-01). Logs one line per request (REQ-NFR-03) and answers
 * allowed cross-origin requests (REQ-API-08).
 */
export function createApp(deps: AppDeps, options: AppOptions = {}): Express {
  throw new Error(
    `createApp is not implemented yet (T-07b); ${Object.keys(deps).length} deps, ${options.extraRoutes?.length ?? 0} extra route(s)`,
  );
}

/**
 * The request's `now`: read from the clock on first use and reused for the rest of the request
 * (REQ-STA-06). Requests that never ask for it never read the clock, so an invalid
 * FLAKEWATCH_NOW only fails requests that need the time (REQ-NFR-06).
 */
export function requestNow(res: Response): Date {
  throw new Error(`requestNow is not implemented yet (T-07b); ${res.statusCode}`);
}
