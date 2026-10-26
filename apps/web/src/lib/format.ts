// Display formatting (REQ-STA-04, REQ-UI-04).

/**
 * The flake rate as a percentage with one decimal place, computed from the integer counts as
 * round(flakyCommits × 1000 / commitsRun) / 10, so the API's floating-point rate never decides
 * the rounding (REQ-STA-04). "—" when there are no commits.
 */
export function formatFlakeRate(flakyCommits: number, commitsRun: number): string {
  if (commitsRun <= 0) return "—";
  const tenths = Math.floor((flakyCommits * 1000) / commitsRun + 0.5);
  return `${(tenths / 10).toFixed(1)}%`;
}

/** "1 unconfirmed failure", "96 unconfirmed failures" (REQ-UI-04, decision PQ-18). */
export function unconfirmedLabel(count: number): string {
  return `${count} unconfirmed ${count === 1 ? "failure" : "failures"}`;
}

/** Thousands separators for counts, e.g. 1,234. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}
