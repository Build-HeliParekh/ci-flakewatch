// Percentiles and target checks for the benchmarks (REQ-NFR-01).

/** The p-th percentile (nearest rank) of `samples`, in the same unit. */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) throw new Error("percentile of no samples");
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] as number;
}

export interface BenchResult {
  name: string;
  p95Ms: number;
  targetMs: number;
  over: boolean;
}

/** p95 of the samples against the target; `over` flags a miss (SHOULD-level, never fails). */
export function check(name: string, samplesMs: readonly number[], targetMs: number): BenchResult {
  const p95Ms = percentile(samplesMs, 95);
  return { name, p95Ms, targetMs, over: p95Ms > targetMs };
}

/** One line per result, with OVER TARGET marked. */
export function formatReport(results: readonly BenchResult[]): string {
  return results
    .map(
      (r) =>
        `${r.over ? "OVER TARGET" : "ok         "}  ${r.name.padEnd(36)} p95 ${r.p95Ms.toFixed(1).padStart(8)} ms   target ${r.targetMs} ms`,
    )
    .join("\n");
}
