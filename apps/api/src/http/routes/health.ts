// GET /api/v1/health (REQ-API-07).
import { Router } from "express";
import type { HealthResponse } from "@flakewatch/shared";
import type { Db } from "../../db/open.js";

export function healthRoutes(db: Db): Router {
  const router = Router();
  router.get("/health", (_req, res) => {
    try {
      db.prepare("SELECT 1").get();
      const body: HealthResponse = { status: "ok" };
      res.json(body);
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  return router;
}
