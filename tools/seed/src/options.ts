// Command-line options (REQ-SEED-02). `today` is resolved by the caller, which owns the clock.
import { DEFAULT_OPTIONS, type SeedOptions } from "./scenario.js";

export interface CliOptions extends SeedOptions {
  out: string | undefined;
  api: string;
  token: string | undefined;
}

const MIDNIGHT = /^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z$/;

/** Parses argv; `today` is the current UTC date at 00:00 from `today()`. Throws on bad input. */
export function parseArgs(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  today: () => Date,
): CliOptions {
  const options: CliOptions = {
    ...DEFAULT_OPTIONS,
    out: undefined,
    api: "http://localhost:4000",
    token: env["UPLOAD_TOKEN"] || undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    i++;
    switch (flag) {
      case "--seed":
        if (!/^\d+$/.test(value)) throw new Error("--seed must be a whole number");
        options.seed = Number(value);
        break;
      case "--days":
        if (!/^[1-9]\d*$/.test(value)) throw new Error("--days must be a whole number ≥ 1");
        options.days = Number(value);
        break;
      case "--end":
        if (value === "today") {
          const now = today();
          options.end = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
          );
        } else if (MIDNIGHT.test(value)) {
          options.end = new Date(Date.parse(value));
        } else {
          throw new Error('--end must be a UTC midnight like 2026-10-24T00:00:00Z, or "today"');
        }
        break;
      case "--out":
        options.out = value;
        break;
      case "--api":
        options.api = value;
        break;
      case "--token":
        options.token = value;
        break;
      default:
        throw new Error(`unknown option ${flag}`);
    }
  }
  return options;
}
