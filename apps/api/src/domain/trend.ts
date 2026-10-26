// The 30-day flake-rate trend (REQ-STA-05). Pure function.
import type { TrendPoint } from "@flakewatch/shared";
import { computeScopeCounts } from "./stats.js";
import type { ResultFact } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;
const TREND_WINDOW_DAYS = 7;

/**
 * 30 daily points for one test case, for the UTC dates `date(now) − 30 … date(now) − 1`.
 * Point D covers attempts with `startedAt` in `(D + 1 day − 7 days, min(D + 1 day, now)]`,
 * and its `flakeRate` follows REQ-STA-02 over that range, or is `null` when that range has no
 * commits. `branchFacts` are already narrowed to the branch (or all branches for `*`); the
 * trend doesn't depend on the `window` parameter.
 */
export function trendSeries(branchFacts: readonly ResultFact[], now: Date): TrendPoint[] {
  const nowMs = now.getTime();
  const todayStartMs = Math.floor(nowMs / DAY_MS) * DAY_MS;
  const points: TrendPoint[] = [];

  for (let daysBack = TREND_DAYS; daysBack >= 1; daysBack--) {
    const dayStartMs = todayStartMs - daysBack * DAY_MS;
    const endInclusiveMs = Math.min(dayStartMs + DAY_MS, nowMs);
    const startExclusiveMs = dayStartMs + DAY_MS - TREND_WINDOW_DAYS * DAY_MS;
    const inRange = branchFacts.filter(
      (fact) => fact.startedAtMs > startExclusiveMs && fact.startedAtMs <= endInclusiveMs,
    );
    const counts = computeScopeCounts(inRange);
    points.push({
      date: new Date(dayStartMs).toISOString().slice(0, 10),
      flakeRate: counts.commitsRun === 0 ? null : counts.flakeRate,
    });
  }

  return points;
}
