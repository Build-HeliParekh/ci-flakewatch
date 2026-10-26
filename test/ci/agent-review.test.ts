// REQ-CI-06: the optional agent review workflow. Adding .github/workflows/agent-review.yml is the
// owner's choice; if it exists, it must pass these checks. The checks are also proven against
// sample workflows, so they mean something even while the file is absent.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/** Problems with an agent review workflow, or [] if it meets REQ-CI-06. */
export function agentReviewProblems(text: string): string[] {
  const workflow = parse(text) as {
    on?: { pull_request?: { types?: string[] } };
    permissions?: Record<string, string>;
    jobs?: Record<
      string,
      {
        if?: string;
        permissions?: Record<string, string>;
        steps?: { run?: string; uses?: string; with?: Record<string, unknown> }[];
      }
    >;
  };
  const problems: string[] = [];
  const types = workflow.on?.pull_request?.types ?? [];
  if (!types.includes("opened") || !types.includes("synchronize"))
    problems.push("must run on pull_request opened and synchronize");
  const allowed: Record<string, string> = { contents: "read", "pull-requests": "write" };
  const checkPermissions = (permissions: Record<string, string> | undefined, where: string) => {
    for (const [scope, level] of Object.entries(permissions ?? {})) {
      if (allowed[scope] !== level && !(scope in allowed && level === "read"))
        problems.push(`${where} permission ${scope}: ${level} is not allowed`);
    }
  };
  if (!workflow.permissions) problems.push("must declare permissions");
  checkPermissions(workflow.permissions, "workflow");
  for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
    checkPermissions(job.permissions, `job ${name}`);
    if (
      !/ANTHROPIC_API_KEY/.test(job.if ?? "") &&
      !/ANTHROPIC_API_KEY/.test(JSON.stringify(workflow.on ?? {}))
    ) {
      problems.push(`job ${name} must run only when ANTHROPIC_API_KEY is set`);
    }
    for (const step of job.steps ?? []) {
      const text = `${step.run ?? ""} ${step.uses ?? ""} ${JSON.stringify(step.with ?? {})}`;
      if (/git push|gh pr merge|merge|--approve|APPROVE|REQUEST_CHANGES/.test(text))
        problems.push(`job ${name} has a push, merge, or approval step`);
    }
  }
  return problems;
}

const GOOD = `
name: agent-review
on:
  pull_request:
    types: [opened, synchronize]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    if: \${{ secrets.ANTHROPIC_API_KEY != '' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: echo "review against docs/SPEC.md and AGENTS.md, comments only"
`;

describe("agent review workflow", () => {
  it("REQ-CI-06: a workflow with read and comment permissions, conditioned on the key, passes", () => {
    expect(agentReviewProblems(GOOD)).toEqual([]);
  });

  it("REQ-CI-06: extra permissions, no key condition, or a merge or push step are rejected", () => {
    expect(agentReviewProblems(GOOD.replace("contents: read", "contents: write"))).toContain(
      "workflow permission contents: write is not allowed",
    );
    expect(
      agentReviewProblems(GOOD.replace("    if: ${{ secrets.ANTHROPIC_API_KEY != '' }}\n", "")),
    ).toContain("job review must run only when ANTHROPIC_API_KEY is set");
    expect(agentReviewProblems(`${GOOD}      - run: gh pr merge --auto\n`)).toContain(
      "job review has a push, merge, or approval step",
    );
    expect(agentReviewProblems(`${GOOD}      - run: git push origin HEAD\n`)).toContain(
      "job review has a push, merge, or approval step",
    );
    expect(agentReviewProblems(GOOD.replace("[opened, synchronize]", "[closed]"))).toContain(
      "must run on pull_request opened and synchronize",
    );
  });

  it("REQ-CI-06: if .github/workflows/agent-review.yml exists, it meets the rules", () => {
    const file = new URL("../../.github/workflows/agent-review.yml", import.meta.url);
    if (!existsSync(file)) return;
    expect(agentReviewProblems(readFileSync(file, "utf8"))).toEqual([]);
  });
});
