// Statistics windows (REQ-STA-01, REQ-DET-06).
import type { Window } from "@flakewatch/shared";
import type { TimeRange } from "./types.js";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_HOURS: Readonly<Record<Window, number>> = { "7d": 7 * 24, "30d": 30 * 24 };

/** `7d` = (now − 7×24h, now], `30d` = (now − 30×24h, now]. */
export function windowRange(window: Window, now: Date): TimeRange {
  const endInclusiveMs = now.getTime();
  return { startExclusiveMs: endInclusiveMs - WINDOW_HOURS[window] * HOUR_MS, endInclusiveMs };
}

/** Whether an attempt that started at `startedAtMs` is inside `range`. */
export function inRange(startedAtMs: number, range: TimeRange): boolean {
  return startedAtMs > range.startExclusiveMs && startedAtMs <= range.endInclusiveMs;
}
