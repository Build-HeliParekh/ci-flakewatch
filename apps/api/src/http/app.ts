// The Express app: JSON, errors, logging, CORS, and one `now` per request (PLAN §3.4).
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
  type Response,
  type Router,
} from "express";
import { ERROR_HTTP_STATUS, type ApiErrorBody, type ErrorCode } from "@flakewatch/shared";
import type { Clock } from "../clock.js";
import type { Config } from "../config.js";
import type { Db } from "../db/open.js";
import type { Logger } from "../logger.js";
import { HttpError } from "./errors.js";
import { healthRoutes } from "./routes/health.js";

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
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);

  app.use(requestLogging(deps.logger));
  app.use(cors(deps.config.corsOrigins));
  app.use((_req, res, next) => {
    res.locals["clock"] = deps.clock;
    next();
  });
  app.use(express.json({ limit: "1mb" }));

  const api = express.Router();
  api.use(healthRoutes(deps.db));
  for (const router of options.extraRoutes ?? []) api.use(router);
  app.use("/api/v1", api);

  app.use((_req, _res, next) => next(new HttpError("NOT_FOUND", "No such route")));
  app.use(errorHandler(deps.logger));
  return app;
}

/**
 * The request's `now`: read from the clock on first use and reused for the rest of the request
 * (REQ-STA-06). Requests that never ask for it never read the clock, so an invalid
 * FLAKEWATCH_NOW only fails requests that need the time (REQ-NFR-06).
 */
export function requestNow(res: Response): Date {
  const cached = res.locals["now"] as Date | undefined;
  if (cached) return new Date(cached.getTime());
  const clock = res.locals["clock"] as Clock;
  const now = clock.now();
  res.locals["now"] = now;
  return new Date(now.getTime());
}

function requestLogging(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.request({
        method: req.method,
        // The original URL without its query string, which may carry user data (REQ-NFR-03).
        path: req.originalUrl.split("?")[0] ?? "/",
        status: res.statusCode,
        durationMs: Math.round(durationMs * 1000) / 1000,
      });
    });
    next();
  };
}

const ALLOW_METHODS = "GET, POST, DELETE";
const ALLOW_HEADERS = "Authorization, Content-Type";

function cors(allowed: readonly string[]): RequestHandler {
  const origins = new Set(allowed);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || !origins.has(origin)) return next();
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
      res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
      res.setHeader("Access-Control-Max-Age", "600");
      res.status(204).end();
      return;
    }
    next();
  };
}

function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, next) => {
    if (res.headersSent) return next(error);
    let code: ErrorCode;
    let message: string;
    if (error instanceof HttpError) {
      code = error.code;
      message = error.message;
    } else if (isBodyParseError(error)) {
      code = error.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR";
      message =
        code === "PAYLOAD_TOO_LARGE"
          ? "Request body is too large"
          : "Request body is not valid JSON";
    } else {
      code = "INTERNAL_ERROR";
      message = "Internal server error";
      logger.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
    const body: ApiErrorBody = { error: { code, message } };
    res.status(ERROR_HTTP_STATUS[code]).json(body);
  };
}

function isBodyParseError(error: unknown): error is { type: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    (error.type === "entity.parse.failed" || error.type === "entity.too.large")
  );
}
