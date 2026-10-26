// The only module that reads the time (REQ-NFR-04, AGENTS.md §6).

export interface Clock {
  now(): Date;
}

/** Thrown when FLAKEWATCH_NOW is set but isn't an ISO 8601 date-time with a time zone. */
export class ClockError extends Error {
  readonly variable = "FLAKEWATCH_NOW";
}

/**
 * A clock that, on **every call**, returns `FLAKEWATCH_NOW` from `env` if it is set (and not
 * empty), and the system time otherwise. Throws `ClockError` if the value is invalid
 * (REQ-NFR-06). `systemNow` exists so tests never read the real clock.
 */
export function envClock(
  env: Record<string, string | undefined> = process.env,
  systemNow: () => Date = () => new Date(),
): Clock {
  return notImplemented("envClock", env, systemNow);
}

/** A clock that always returns `iso` (for tests). */
export function fixedClock(iso: string): Clock {
  return notImplemented("fixedClock", iso);
}

/** Parses an ISO 8601 date-time with a time zone (`Z` or `±hh:mm`); `null` if invalid. */
export function parseIsoDateTime(value: string): Date | null {
  return notImplemented("parseIsoDateTime", value);
}

function notImplemented(name: string, ...args: unknown[]): never {
  throw new Error(`${name} is not implemented yet (T-05b); called with ${args.length} argument(s)`);
}
