// POST /api/v1/results (REQ-ING-01 to ING-14). Checks run in the order 401 → 413 → 400 → 422
// (REQ-ING-14): token, size, metadata, report contents. Report contents are never logged.
import busboy from "busboy";
import express, { type Request, type Router } from "express";
import type { Config } from "../../config.js";
import type { Db } from "../../db/open.js";
import { parseJUnit } from "../../ingest/junit.js";
import { parseUploadMetadata } from "../../ingest/metadata.js";
import { ingestUpload, RunConflictError, type IngestHooks } from "../../ingest/service.js";
import { requireWriteToken } from "../auth.js";
import { HttpError } from "../errors.js";

const BYTES_PER_MB = 1_048_576;

interface Multipart {
  fields: Record<string, string | undefined>;
  /** Field names given more than once. */
  repeated: Set<string>;
  report: Buffer | null;
  reportFiles: number;
  tooLarge: boolean;
}

export function resultsRoutes(deps: { db: Db; config: Config; hooks?: IngestHooks }): Router {
  const router = express.Router();
  const maxBytes = Math.floor(deps.config.maxUploadMb * BYTES_PER_MB);

  router.post("/results", requireWriteToken(deps.config), async (req, res, next) => {
    try {
      const upload = await readMultipart(req, maxBytes);
      if (upload.tooLarge) {
        throw new HttpError(
          "PAYLOAD_TOO_LARGE",
          `report is larger than ${deps.config.maxUploadMb} MB`,
        );
      }
      if (upload.reportFiles > 1)
        throw new HttpError("VALIDATION_ERROR", "report must be sent once");
      if (!upload.report) throw new HttpError("VALIDATION_ERROR", "report is required");
      for (const field of upload.repeated) {
        throw new HttpError("VALIDATION_ERROR", `${field} must be sent once`);
      }
      const meta = parseUploadMetadata(upload.fields);
      if (!meta.ok) throw new HttpError("VALIDATION_ERROR", meta.message);

      const parsed = parseJUnit(upload.report.toString("utf8"));
      if (!parsed.ok) throw new HttpError("INVALID_REPORT", parsed.message);

      let outcome;
      try {
        outcome = ingestUpload(deps.db, meta.value, parsed.cases, deps.hooks);
      } catch (error) {
        if (error instanceof RunConflictError)
          throw new HttpError("VALIDATION_ERROR", error.message);
        throw error;
      }
      res.status(outcome.created ? 201 : 200).json(outcome.summary);
    } catch (error) {
      next(error);
    }
  });
  return router;
}

/** Reads the whole multipart body. A report over `maxBytes` is drained and flagged, not kept. */
function readMultipart(req: Request, maxBytes: number): Promise<Multipart> {
  return new Promise((resolve, reject) => {
    const result: Multipart = {
      fields: {},
      repeated: new Set(),
      report: null,
      reportFiles: 0,
      tooLarge: false,
    };
    let parser: busboy.Busboy;
    try {
      // One byte over the limit is enough to know the report is too large.
      parser = busboy({ headers: req.headers, limits: { fileSize: maxBytes + 1 } });
    } catch {
      // Not multipart/form-data: there is no report. Drain the body unless it was already read.
      if (req.readableEnded) return resolve(result);
      req.resume();
      req.on("end", () => resolve(result));
      return;
    }

    parser.on("field", (name, value) => {
      if (name in result.fields) result.repeated.add(name);
      result.fields[name] = value;
    });
    parser.on("file", (name, stream) => {
      if (name !== "report") {
        stream.resume();
        return;
      }
      result.reportFiles++;
      const chunks: Buffer[] = [];
      let bytes = 0;
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) result.tooLarge = true;
        else chunks.push(chunk);
      });
      stream.on("end", () => {
        if (!result.tooLarge && result.reportFiles === 1) result.report = Buffer.concat(chunks);
      });
    });
    parser.on("close", () => resolve(result));
    parser.on("error", () =>
      reject(new HttpError("VALIDATION_ERROR", "the multipart body is malformed")),
    );
    req.pipe(parser);
  });
}
