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
  throw new Error(`toApiTimestamp is not implemented yet (T-07b); ${date.getTime()}`);
}
