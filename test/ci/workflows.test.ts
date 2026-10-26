// Checks .github/workflows/ci.yml against SPEC §13.3. Criteria marked (manual) in the spec are
// checked on GitHub by a person and noted in the PR.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
  "continue-on-error"?: boolean;
}

interface Workflow {
  name: string;
  on: {
    pull_request?: { branches?: string[] };
    push?: { branches?: string[] };
  };
  jobs: Record<string, { "runs-on": string; steps: Step[] }>;
}

const raw = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const workflow = parse(raw) as Workflow;
const job = workflow.jobs["ci"];
const steps = job?.steps ?? [];
const runs = steps.map((step) => step.run?.trim()).filter((run): run is string => Boolean(run));
const stepUsing = (action: string) => steps.find((step) => step.uses?.startsWith(`${action}@`));

describe("ci.yml", () => {
  it("REQ-CI-01: is named ci and triggers on pull requests to main and pushes to main", () => {
    expect(workflow.name).toBe("ci");
    expect(workflow.on.pull_request?.branches).toEqual(["main"]);
    expect(workflow.on.push?.branches).toEqual(["main"]);
  });

  it("REQ-CI-01: runs on ubuntu-latest with Node.js 22", () => {
    expect(job?.["runs-on"]).toBe("ubuntu-latest");
    expect(stepUsing("actions/setup-node")?.with?.["node-version"]).toBe(22);
  });

  it("REQ-CI-01: runs the six required commands in order", () => {
    const required = [
      "npm ci",
      "npm run lint",
      "npm run build",
      "npm test",
      "npm run spec:check",
      "npm run test:e2e",
    ];
    const positions = required.map((command) => runs.indexOf(command));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("REQ-CI-02: no step before the optional flakewatch upload references secrets", () => {
    const uploadIndex = steps.findIndex(
      (step) => step.name === "Upload test results to flakewatch",
    );
    const before = uploadIndex === -1 ? steps : steps.slice(0, uploadIndex);
    for (const step of before) expect(JSON.stringify(step), step.name).not.toMatch(/secrets\./);
    // The workflow may read a secret only in that step.
    const withSecrets = steps.filter((step) => /secrets\./.test(JSON.stringify(step)));
    expect(withSecrets.map((step) => step.name)).toEqual(
      uploadIndex === -1 ? [] : ["Upload test results to flakewatch"],
    );
  });

  it("REQ-CI-04: the upload runs only when vars.FLAKEWATCH_URL is set, never fails the build, and sends the run's identity", () => {
    const upload = steps.find((step) => step.name === "Upload test results to flakewatch");
    expect(upload).toBeDefined();
    expect(upload?.if).toContain("vars.FLAKEWATCH_URL != ''");
    expect(upload?.["continue-on-error"]).toBe(true);
    const env = upload?.env ?? {};
    expect(env["FLAKEWATCH_TOKEN"]).toBe("${{ secrets.FLAKEWATCH_TOKEN }}");
    expect(env["COMMIT_SHA"]).toBe("${{ github.sha }}");
    expect(env["RUN_ID"]).toBe("${{ github.run_id }}");
    expect(env["RUN_ATTEMPT"]).toBe("${{ github.run_attempt }}");
    const run = upload?.run ?? "";
    for (const field of [
      "report=@reports/junit/junit.xml",
      "repo=",
      "branch=",
      "commitSha=",
      "runId=",
      "attempt=",
      "startedAt=",
    ]) {
      expect(run).toContain(field);
    }
    expect(run).toContain("$FLAKEWATCH_URL/api/v1/results");
    expect(run).toContain("::warning::");
    // It comes after the test-results artifact, so a failed upload can't hide the reports.
    const artifact = steps.findIndex((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(steps.indexOf(upload as Step)).toBeGreaterThan(artifact);
  });

  it("REQ-CI-04: the start time is recorded before the tests run", () => {
    const record = steps.findIndex((step) => step.run?.includes("FLAKEWATCH_STARTED_AT="));
    expect(record).toBeGreaterThanOrEqual(0);
    expect(record).toBeLessThan(steps.findIndex((step) => step.run?.trim() === "npm test"));
  });

  it("REQ-CI-03: uploads reports/junit/ as the test-results artifact for 30 days, always", () => {
    const upload = stepUsing("actions/upload-artifact");
    expect(upload?.if).toBe("always()");
    expect(upload?.with?.["name"]).toBe("test-results");
    expect(upload?.with?.["path"]).toBe("reports/junit/");
    expect(upload?.with?.["retention-days"]).toBe(30);
  });

  it("REQ-CI-03: npm test writes the JUnit report to reports/junit/", () => {
    const vitestConfig = readFileSync(new URL("../../vitest.config.ts", import.meta.url), "utf8");
    expect(vitestConfig).toContain('outputFile: { junit: "reports/junit/junit.xml" }');
  });

  it("REQ-CI-05: caches npm dependencies and Playwright browsers", () => {
    expect(stepUsing("actions/setup-node")?.with?.["cache"]).toBe("npm");
    const cache = stepUsing("actions/cache");
    expect(cache?.with?.["path"]).toBe("~/.cache/ms-playwright");
    expect(String(cache?.with?.["key"])).toContain("hashFiles('package-lock.json')");
  });
});
