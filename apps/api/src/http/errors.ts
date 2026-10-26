// The error type routes throw, and the API timestamp format (REQ-API-01).
import type { ErrorCode } from "@flakewatch/shared";

/** An error with an API error code; the app maps it to its HTTP status and the error body. */
export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** ISO 8601 UTC to the second with `Z`, fractional seconds truncated (decision D-17). */
export function toApiTimestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}
