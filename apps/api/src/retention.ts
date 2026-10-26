// Retention cleanup (REQ-RET-01, RET-03). Uses the clock module's `now` (decision PQ-22).
import type { Clock } from "./clock.js";
import type { Config } from "./config.js";
import type { Db } from "./db/open.js";
import { deleteAttemptsBefore, type RetentionCounts } from "./db/repos/retention.js";
import type { Logger } from "./logger.js";

export type RetentionResult = RetentionCounts;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Deletes attempts whose `startedAt` is more than `retentionDays × 24h` before `now`. */
export function runRetention(db: Db, now: Date, retentionDays: number): RetentionResult {
  return deleteAttemptsBefore(db, now.getTime() - retentionDays * 24 * HOUR_MS);
}

/** Runs cleanup now and then every `intervalMs` (default 24 h). Errors are logged, not thrown. */
export function scheduleRetention(
  deps: { db: Db; clock: Clock; config: Config; logger: Logger },
  intervalMs: number = DAY_MS,
): { stop(): void } {
  const run = () => {
    try {
      runRetention(deps.db, deps.clock.now(), deps.config.retentionDays);
    } catch (error) {
      deps.logger.error(
        `retention failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
