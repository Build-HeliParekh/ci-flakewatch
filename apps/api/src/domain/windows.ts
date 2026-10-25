// Statistics windows (REQ-STA-01, REQ-DET-06).
import type { Window } from "@flakewatch/shared";
import { notImplemented } from "./not-implemented.js";
import type { TimeRange } from "./types.js";

/** `7d` = (now − 7×24h, now], `30d` = (now − 30×24h, now]. */
export function windowRange(window: Window, now: Date): TimeRange {
  return notImplemented("windowRange", window, now);
}

/** Whether an attempt that started at `startedAtMs` is inside `range`. */
export function inRange(startedAtMs: number, range: TimeRange): boolean {
  return notImplemented("inRange", startedAtMs, range);
}
