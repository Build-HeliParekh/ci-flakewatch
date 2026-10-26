// --out mode: one XML file per attempt plus manifest.json, in upload order (REQ-SEED-02).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { toJUnitXml } from "./junit-writer.js";
import type { GeneratedAttempt } from "./scenario.js";

export interface ManifestEntry {
  file: string;
  repo: string;
  branch: string;
  commitSha: string;
  runId: string;
  attempt: number;
  startedAt: string;
}

export const fileNameOf = (attempt: GeneratedAttempt, order: number) =>
  `${String(order).padStart(4, "0")}-${attempt.runId}-attempt${attempt.attempt}.xml`;

export const isoSeconds = (date: Date) => `${date.toISOString().slice(0, 19)}Z`;

export function manifestOf(attempts: readonly GeneratedAttempt[]): ManifestEntry[] {
  return attempts.map((attempt, i) => ({
    file: fileNameOf(attempt, i + 1),
    repo: attempt.repo,
    branch: attempt.branch,
    commitSha: attempt.commitSha,
    runId: attempt.runId,
    attempt: attempt.attempt,
    startedAt: isoSeconds(attempt.startedAt),
  }));
}

/** Writes every file into `dir` (created if missing). Returns the number of XML files. */
export function writeOutput(dir: string, attempts: readonly GeneratedAttempt[]): number {
  mkdirSync(dir, { recursive: true });
  const manifest = manifestOf(attempts);
  attempts.forEach((attempt, i) => {
    writeFileSync(
      path.join(dir, manifest[i]?.file ?? fileNameOf(attempt, i + 1)),
      toJUnitXml(attempt),
    );
  });
  writeFileSync(path.join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return attempts.length;
}
