// Configuration from environment variables (SPEC §13.2, REQ-NFR-06, REQ-RET-02).
// The only module that reads these variables; everything else receives a Config.
import { z } from "zod";
import { parseIsoDateTime } from "./clock.js";

export interface Config {
  port: number;
  databasePath: string;
  quarantineThreshold: number;
  quarantineMinCommits: number;
  brokenMinCommits: number;
  retentionDays: number;
  maxUploadMb: number;
  /** `undefined` when UPLOAD_TOKEN is unset or empty. */
  uploadToken: string | undefined;
}

/** An invalid configuration value; `variable` names it (REQ-NFR-06). */
export class ConfigError extends Error {
  constructor(
    readonly variable: string,
    message: string,
  ) {
    super(message);
  }
}

/** A plain decimal number, e.g. "10", "0.5", "-1". No exponents, spaces, or hex. */
const decimal = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "must be a number")
  .transform(Number);

const integer = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  decimal.pipe(z.number().int("must be a whole number").min(min).max(max));

/** Each §13.2 variable, in table order, with its default and rule. */
const VARIABLES = {
  PORT: { default: "4000", schema: integer(1, 65535) },
  QUARANTINE_THRESHOLD: {
    default: "0.10",
    schema: decimal.pipe(z.number().gt(0, "must be above 0").lte(1, "must be at most 1")),
  },
  QUARANTINE_MIN_COMMITS: { default: "20", schema: integer(1) },
  BROKEN_MIN_COMMITS: { default: "3", schema: integer(2) },
  RETENTION_DAYS: { default: "90", schema: integer(37) }, // REQ-RET-02: 30-day trend + 7 days
  MAX_UPLOAD_MB: { default: "10", schema: decimal.pipe(z.number().gt(0, "must be above 0")) },
} as const;

type NumericVariable = keyof typeof VARIABLES;

/**
 * Validates every §13.2 variable and returns the configuration, using the defaults for unset
 * or empty values. Throws `ConfigError` naming the first invalid variable. FLAKEWATCH_NOW is
 * validated here too, though the clock module reads it.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const read = (name: string): string | undefined => {
    const value = env[name];
    return value === undefined || value === "" ? undefined : value;
  };

  const numeric = (name: NumericVariable): number => {
    const { default: fallback, schema } = VARIABLES[name];
    const raw = read(name) ?? fallback;
    const result = schema.safeParse(raw);
    if (!result.success) {
      const reason = result.error.issues[0]?.message ?? "is invalid";
      throw new ConfigError(name, `${name}="${raw}" is invalid: ${reason}`);
    }
    return result.data;
  };

  const config: Config = {
    port: numeric("PORT"),
    databasePath: read("DATABASE_PATH") ?? "./data/flakewatch.db",
    quarantineThreshold: numeric("QUARANTINE_THRESHOLD"),
    quarantineMinCommits: numeric("QUARANTINE_MIN_COMMITS"),
    brokenMinCommits: numeric("BROKEN_MIN_COMMITS"),
    retentionDays: numeric("RETENTION_DAYS"),
    maxUploadMb: numeric("MAX_UPLOAD_MB"),
    uploadToken: read("UPLOAD_TOKEN"),
  };

  const now = read("FLAKEWATCH_NOW");
  if (now !== undefined && !parseIsoDateTime(now)) {
    throw new ConfigError(
      "FLAKEWATCH_NOW",
      `FLAKEWATCH_NOW="${now}" is invalid: must be an ISO 8601 date-time with a time zone`,
    );
  }

  return config;
}
