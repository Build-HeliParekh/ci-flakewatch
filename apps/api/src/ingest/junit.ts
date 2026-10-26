// Parses a JUnit XML report into test case results (SPEC REQ-ING-02 to ING-06, ING-08).
// Pure: no I/O and no clock, so the rules can be unit-tested directly.
// Stubs: implemented in the G1 implementer stage.
import type { ResultStatus } from "@flakewatch/shared";

export interface ParsedTestCase {
  /** 1-based position of the `<testcase>` in the whole report, in document order (PQ-19). */
  position: number;
  file: string;
  classname: string;
  name: string;
  status: ResultStatus;
  durationMs: number;
  /** The first `<failure>`/`<error>` message for failed results; otherwise null (PQ-12d). */
  message: string | null;
}

export type ParseResult = { ok: true; cases: ParsedTestCase[] } | { ok: false; message: string };

/** Longest stored error message, in code points (REQ-ING-05, SPEC §2 conventions). */
export const MAX_MESSAGE_CODE_POINTS = 2000;

export function parseJUnit(xml: string): ParseResult {
  void xml;
  throw new Error("not implemented (G1b)");
}

/** Seconds as written in `time` → whole milliseconds, rounded half up; 0 if missing or invalid. */
export function durationMsFromTime(time: string | undefined): number {
  void time;
  throw new Error("not implemented (G1b)");
}

/** The first `maxCodePoints` code points of `message`. */
export function truncateMessage(message: string, maxCodePoints = MAX_MESSAGE_CODE_POINTS): string {
  void message;
  void maxCodePoints;
  throw new Error("not implemented (G1b)");
}
