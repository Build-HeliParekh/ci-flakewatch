// Manual quarantine and the CI quarantine list (REQ-QUA-01, QUA-02, QUA-05).
// Check order for writes (decision PQ-10): 401 token → 400 id → 404 unknown → 400 body / 409.
import type { QuarantineListResponse, QuarantineResponse } from "@flakewatch/shared";
import express, { type Router } from "express";
import type { Config } from "../../config.js";
import { deleteManual, upsertManual } from "../../db/repos/quarantine.js";
import type { Db } from "../../db/open.js";
import type { StatsService } from "../../services/stats-service.js";
import { requestNow } from "../app.js";
import { requireWriteToken } from "../auth.js";
import { HttpError, toApiTimestamp } from "../errors.js";
import { parseId, QueryParams } from "../validation.js";

export function quarantineRoutes(deps: { db: Db; config: Config; stats: StatsService }): Router {
  const router = express.Router();
  const writeToken = requireWriteToken(deps.config);

  const requireTestCase = (id: number) => {
    const row = deps.db
      .prepare<[number], { id: number }>("SELECT id FROM test_cases WHERE id = ?")
      .get(id);
    if (!row) throw new HttpError("NOT_FOUND", `No test case with id ${id}`);
  };

  router.post("/tests/:id/quarantine", writeToken, (req, res) => {
    const id = parseId(req.params["id"]);
    requireTestCase(id);
    const reason = readReason(req.body as unknown);
    const { created, value } = upsertManual(deps.db, id, reason, requestNow(res));
    const body: QuarantineResponse = { manualQuarantine: value };
    res.status(created ? 201 : 200).json(body);
  });

  router.delete("/tests/:id/quarantine", writeToken, (req, res) => {
    const id = parseId(req.params["id"]);
    requireTestCase(id);
    if (!deleteManual(deps.db, id)) {
      throw new HttpError("NOT_QUARANTINED", `Test case ${id} is not manually quarantined`);
    }
    res.status(204).end();
  });

  router.get("/quarantine", (req, res) => {
    const repo = new QueryParams(req).repo();
    if (repo === undefined) throw new HttpError("VALIDATION_ERROR", "repo is required");
    const now = requestNow(res);
    const body: QuarantineListResponse = {
      repo,
      asOf: toApiTimestamp(now),
      items: deps.stats.quarantineList(repo, now),
    };
    res.json(body);
  });

  return router;
}

/** `reason`: 1–500 characters after trimming surrounding whitespace, stored trimmed (PQ-10b). */
function readReason(body: unknown): string {
  const reason =
    typeof body === "object" && body !== null && "reason" in body
      ? (body as { reason: unknown }).reason
      : undefined;
  if (typeof reason !== "string") throw new HttpError("VALIDATION_ERROR", "reason is required");
  const trimmed = reason.trim();
  const length = Array.from(trimmed).length;
  if (length < 1 || length > 500)
    throw new HttpError("VALIDATION_ERROR", "reason must be 1–500 characters");
  return trimmed;
}
