// Display formatting (REQ-STA-04, REQ-UI-04). Stubs: implemented in the G8 implementer stage.

/** The flake rate as a percentage with one decimal place (REQ-STA-04). "—" when there are no commits. */
export function formatFlakeRate(_flakyCommits: number, _commitsRun: number): string {
  void _flakyCommits;
  void _commitsRun;
  throw new Error("not implemented (G8b)");
}

/** "1 unconfirmed failure", "96 unconfirmed failures" (REQ-UI-04, decision PQ-18). */
export function unconfirmedLabel(_count: number): string {
  void _count;
  throw new Error("not implemented (G8b)");
}

/** Thousands separators for counts, e.g. 1,234. */
export function formatCount(_value: number): string {
  void _value;
  throw new Error("not implemented (G8b)");
}
