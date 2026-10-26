// The 30-day flake-rate trend (REQ-STA-05). Pure function.
import type { TrendPoint } from "@flakewatch/shared";
import type { ResultFact } from "./types.js";

/**
 * 30 daily points for one test case, for the UTC dates `date(now) − 30 … date(now) − 1`.
 * Point D covers attempts with `startedAt` in `(D + 1 day − 7 days, min(D + 1 day, now)]`,
 * and its `flakeRate` follows REQ-STA-02 over that range, or is `null` when that range has no
 * commits. `branchFacts` are already narrowed to the branch (or all branches for `*`); the
 * trend doesn't depend on the `window` parameter.
 */
export function trendSeries(branchFacts: readonly ResultFact[], now: Date): TrendPoint[] {
  throw new Error(
    `trendSeries is not implemented yet (T-15b); called with ${branchFacts.length} fact(s) at ${now.toISOString()}`,
  );
}
