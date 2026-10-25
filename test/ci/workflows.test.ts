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

  it("REQ-CI-02: required checks reference no secrets", () => {
    expect(raw).not.toMatch(/secrets\./);
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
