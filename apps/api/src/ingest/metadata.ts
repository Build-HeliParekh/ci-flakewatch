// Upload metadata validation (REQ-ING-01, decision PQ-14). Errors name the field.
import type { UploadMetadata } from "@flakewatch/shared";
import { parseIsoDateTime } from "../clock.js";
import { toApiTimestamp } from "../http/errors.js";

export type MetadataResult =
  { ok: true; value: UploadMetadata } | { ok: false; field: string; message: string };

/** The metadata fields, in the order they are checked (REQ-ING-01 table order). */
export const METADATA_FIELDS = [
  "repo",
  "branch",
  "commitSha",
  "runId",
  "attempt",
  "startedAt",
] as const;

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[0-9a-fA-F]{40}$/;
/** A positive integer written plainly: no sign, leading zeros, spaces, or decimals (PQ-14). */
const ATTEMPT = /^[1-9][0-9]*$/;

const fail = (field: string, message: string): MetadataResult => ({ ok: false, field, message });

/**
 * Checks the multipart text fields. Lower-cases `commitSha` and normalises `startedAt` to UTC
 * with second precision (REQ-API-01, D-17). Returns the first problem, in table order.
 */
export function parseUploadMetadata(fields: Record<string, string | undefined>): MetadataResult {
  for (const field of METADATA_FIELDS) {
    const value = fields[field];
    if (value === undefined || value === "") return fail(field, `${field} is required`);
  }
  const { repo, branch, commitSha, runId, attempt, startedAt } = fields as Record<
    (typeof METADATA_FIELDS)[number],
    string
  >;

  if (!REPO.test(repo)) return fail("repo", "repo must look like owner/name");
  const branchLength = Array.from(branch).length;
  if (branchLength > 255) return fail("branch", "branch must be 1–255 characters");
  if (branch === "*") return fail("branch", 'branch must not be "*"');
  if (!SHA.test(commitSha)) return fail("commitSha", "commitSha must be 40 hexadecimal characters");
  if (Array.from(runId).length > 100) return fail("runId", "runId must be 1–100 characters");
  if (!ATTEMPT.test(attempt) || !Number.isSafeInteger(Number(attempt))) {
    return fail("attempt", "attempt must be an integer ≥ 1");
  }
  const started = parseIsoDateTime(startedAt);
  if (!started) {
    return fail("startedAt", "startedAt must be an ISO 8601 date-time with a time zone");
  }

  return {
    ok: true,
    value: {
      repo,
      branch,
      commitSha: commitSha.toLowerCase(),
      runId,
      attempt: Number(attempt),
      startedAt: toApiTimestamp(started),
    },
  };
}
