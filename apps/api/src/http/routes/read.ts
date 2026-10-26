// Read endpoints: repos, summary, ranked list, detail, history (REQ-API-02 to API-06).
// Read endpoints never need the write token (REQ-ING-10).
import type {
  HistoryResponse,
  ReposResponse,
  SummaryResponse,
  TestDetailResponse,
  TestsResponse,
} from "@flakewatch/shared";
import express, { type Router } from "express";
import { filterItems, pageOf, sortItems } from "../../domain/ranking.js";
import type { StatsService } from "../../services/stats-service.js";
import { requestNow } from "../app.js";
import { HttpError, toApiTimestamp } from "../errors.js";
import { parseId, QueryParams } from "../validation.js";

export function readRoutes(stats: StatsService): Router {
  const router = express.Router();

  router.get("/repos", (_req, res) => {
    const body: ReposResponse = { items: stats.repos() };
    res.json(body);
  });

  router.get("/summary", (req, res) => {
    const query = new QueryParams(req);
    const scope = {
      ...optional("repo", query.repo()),
      branch: query.branch(),
      window: query.window(),
    };
    const now = requestNow(res);
    const body: SummaryResponse = { asOf: toApiTimestamp(now), ...stats.summary(scope, now) };
    res.json(body);
  });

  router.get("/tests", (req, res) => {
    const query = new QueryParams(req);
    const scope = {
      ...optional("repo", query.repo()),
      branch: query.branch(),
      window: query.window(),
    };
    const status = query.statuses();
    const q = query.q();
    const sort = query.sort();
    const order = query.order(sort);
    const page = query.page();
    const pageSize = query.pageSize();

    const now = requestNow(res);
    const matching = filterItems(stats.listScope(scope, now), {
      ...optional("status", status),
      ...optional("q", q),
    });
    const ranked = sortItems(matching, sort, order);
    const body: TestsResponse = {
      items: pageOf(ranked, page, pageSize),
      page,
      pageSize,
      total: ranked.length,
      asOf: toApiTimestamp(now),
    };
    res.json(body);
  });

  router.get("/tests/:id", (req, res) => {
    const id = parseId(req.params["id"]);
    const body: TestDetailResponse | null = stats.testDetail(id, requestNow(res));
    if (!body) throw new HttpError("NOT_FOUND", `No test case with id ${id}`);
    res.json(body);
  });

  router.get("/tests/:id/history", (req, res) => {
    const id = parseId(req.params["id"]);
    const query = new QueryParams(req);
    const scope = { branch: query.branch(), window: query.window() };
    const body: HistoryResponse | null = stats.history(id, scope, requestNow(res));
    if (!body) throw new HttpError("NOT_FOUND", `No test case with id ${id}`);
    res.json(body);
  });

  return router;
}

/** `{ [key]: value }` when value is defined, else `{}` (exactOptionalPropertyTypes). */
function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]: V });
}
