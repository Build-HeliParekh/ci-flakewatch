// The only module that reads the time (REQ-NFR-04, AGENTS.md §6).

export interface Clock {
  now(): Date;
}

/** Thrown when FLAKEWATCH_NOW is set but isn't an ISO 8601 date-time with a time zone. */
export class ClockError extends Error {
  readonly variable = "FLAKEWATCH_NOW";
}

// YYYY-MM-DDTHH:MM:SS, optional fraction, then Z or ±HH:MM. A zone is required.
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/** Parses an ISO 8601 date-time with a time zone (`Z` or `±hh:mm`); `null` if invalid. */
export function parseIsoDateTime(value: string): Date | null {
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
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
  return {
    now() {
      const value = env["FLAKEWATCH_NOW"];
      if (value === undefined || value === "") return systemNow();
      const parsed = parseIsoDateTime(value);
      if (!parsed) {
        throw new ClockError(
          `FLAKEWATCH_NOW is not an ISO 8601 date-time with a time zone: "${value}"`,
        );
      }
      return parsed;
    },
  };
}

/** A clock that always returns `iso` (for tests). */
export function fixedClock(iso: string): Clock {
  const parsed = parseIsoDateTime(iso);
  if (!parsed)
    throw new ClockError(`fixedClock needs an ISO 8601 date-time with a time zone: "${iso}"`);
  const ms = parsed.getTime();
  return { now: () => new Date(ms) };
}
