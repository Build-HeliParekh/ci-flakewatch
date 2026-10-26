// JUnit XML in the <testsuites> form, one <testsuite> per module (REQ-SEED-06).
import type { GeneratedAttempt, GeneratedCase } from "./scenario.js";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const seconds = (ms: number) => (ms / 1000).toFixed(3);

export function toJUnitXml(attempt: GeneratedAttempt): string {
  const modules = new Map<string, GeneratedCase[]>();
  for (const testCase of attempt.cases) {
    const group = modules.get(testCase.module) ?? [];
    group.push(testCase);
    modules.set(testCase.module, group);
  }
  const timestamp = `${attempt.startedAt.toISOString().slice(0, 19)}Z`;
  const failures = attempt.cases.filter((testCase) => testCase.status === "failed").length;
  const total = attempt.cases.reduce((sum, testCase) => sum + testCase.durationMs, 0);

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="shoplite" tests="${attempt.cases.length}" failures="${failures}" errors="0" skipped="0" time="${seconds(total)}">`,
  ];
  for (const [module, cases] of modules) {
    const suiteFailures = cases.filter((testCase) => testCase.status === "failed").length;
    const suiteTime = cases.reduce((sum, testCase) => sum + testCase.durationMs, 0);
    const file = cases[0]?.file ?? "";
    lines.push(
      `  <testsuite name="${escape(module)}" file="${escape(file)}" tests="${cases.length}" failures="${suiteFailures}" errors="0" skipped="0" time="${seconds(suiteTime)}" timestamp="${timestamp}">`,
    );
    for (const testCase of cases) {
      const attrs = `name="${escape(testCase.name)}" classname="${escape(testCase.classname)}" file="${escape(testCase.file)}" time="${seconds(testCase.durationMs)}"`;
      if (testCase.status === "failed") {
        const message = escape(testCase.message ?? "");
        lines.push(`    <testcase ${attrs}>`);
        lines.push(
          `      <failure message="${message}" type="AssertionError">${message}</failure>`,
        );
        lines.push("    </testcase>");
      } else if (testCase.status === "skipped") {
        lines.push(`    <testcase ${attrs}><skipped/></testcase>`);
      } else {
        lines.push(`    <testcase ${attrs}/>`);
      }
    }
    lines.push("  </testsuite>");
  }
  lines.push("</testsuites>", "");
  return lines.join("\n");
}
