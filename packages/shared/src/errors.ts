// Error codes and their HTTP statuses (REQ-API-01).

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "NOT_QUARANTINED"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_REPORT"
  | "INTERNAL_ERROR";

export type ErrorHttpStatus = 400 | 401 | 404 | 409 | 413 | 422 | 500;

export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, ErrorHttpStatus>> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  NOT_QUARANTINED: 409,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_REPORT: 422,
  INTERNAL_ERROR: 500,
};

export const ERROR_CODES = Object.keys(ERROR_HTTP_STATUS) as readonly ErrorCode[];

/** The body of every error response. */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}
