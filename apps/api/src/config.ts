// Configuration from environment variables (SPEC §13.2, REQ-NFR-06, REQ-RET-02).
// The only module that reads these variables; everything else receives a Config.

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

/**
 * Validates every §13.2 variable and returns the configuration, using the defaults for unset
 * or empty values. Throws `ConfigError` naming the first invalid variable. FLAKEWATCH_NOW is
 * validated here too, though the clock module reads it.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  throw new Error(
    `loadConfig is not implemented yet (T-05b); ${Object.keys(env).length} variable(s)`,
  );
}
