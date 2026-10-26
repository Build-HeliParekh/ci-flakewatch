// Upload mode: POST each attempt to /api/v1/results in upload order (REQ-SEED-02).
import { performance } from "node:perf_hooks";
import { toJUnitXml } from "./junit-writer.js";
import { fileNameOf, isoSeconds } from "./output.js";
import type { GeneratedAttempt } from "./scenario.js";

export interface UploadReport {
  attempts: number;
  results: number;
  elapsedMs: number;
}

export async function uploadAll(
  attempts: readonly GeneratedAttempt[],
  opts: { api: string; token?: string | undefined; fetch?: typeof fetch },
): Promise<UploadReport> {
  const send = opts.fetch ?? fetch;
  const url = `${opts.api.replace(/\/+$/, "")}/api/v1/results`;
  const started = performance.now();
  let results = 0;
  for (const [i, attempt] of attempts.entries()) {
    const form = new FormData();
    form.set("repo", attempt.repo);
    form.set("branch", attempt.branch);
    form.set("commitSha", attempt.commitSha);
    form.set("runId", attempt.runId);
    form.set("attempt", String(attempt.attempt));
    form.set("startedAt", isoSeconds(attempt.startedAt));
    form.set(
      "report",
      new Blob([toJUnitXml(attempt)], { type: "application/xml" }),
      fileNameOf(attempt, i + 1),
    );
    const response = await send(url, {
      method: "POST",
      body: form,
      ...(opts.token ? { headers: { Authorization: `Bearer ${opts.token}` } } : {}),
    });
    if (!response.ok) {
      throw new Error(
        `upload ${i + 1} (${attempt.runId} attempt ${attempt.attempt}) failed: ${response.status} ${await response.text()}`,
      );
    }
    results += attempt.cases.length;
  }
  return { attempts: attempts.length, results, elapsedMs: performance.now() - started };
}
