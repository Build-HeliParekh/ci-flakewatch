// The write token (REQ-ING-10). Read endpoints never use this.
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import type { Config } from "../config.js";
import { HttpError } from "./errors.js";

/** Requires `Authorization: Bearer <UPLOAD_TOKEN>` when UPLOAD_TOKEN is set; else does nothing. */
export function requireWriteToken(config: Config): RequestHandler {
  const expected = config.uploadToken;
  return (req, _res, next) => {
    if (expected === undefined) return next();
    const header = req.headers.authorization ?? "";
    const match = /^Bearer (.+)$/.exec(header);
    if (!match?.[1] || !sameText(match[1], expected)) {
      return next(new HttpError("UNAUTHORIZED", "A valid write token is required"));
    }
    next();
  };
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
