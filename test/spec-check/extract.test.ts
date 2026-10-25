import { describe, expect, it } from "vitest";
import { extractSpecIds, extractTestTitles, leadingIds } from "../../tools/spec-check/src/index.js";

const SPEC = `# Spec

#### REQ-DET-01
**The flake rule.** ...

#### REQ-DET-02 (Withdrawn)
Replaced by REQ-DET-01.

#### REQ-DET-03

**Withdrawn.** No longer needed.

#### REQ-API-01
Text mentioning REQ-API-99 in the body does not create a requirement.

#### REQ-NFR-05
**Traceability.** Every ID in this document that is not **Withdrawn** MUST be tested.
`;

describe("extractSpecIds", () => {
  it("REQ-NFR-05: collects active IDs from #### headings", () => {
    expect(extractSpecIds(SPEC).active).toEqual(["REQ-DET-01", "REQ-API-01", "REQ-NFR-05"]);
  });

  it("REQ-NFR-05: marks a requirement withdrawn from its heading or first body line", () => {
    expect(extractSpecIds(SPEC).withdrawn).toEqual(["REQ-DET-02", "REQ-DET-03"]);
  });

  it("REQ-NFR-05: doesn't treat a body that only mentions the word Withdrawn as withdrawn", () => {
    expect(extractSpecIds(SPEC).active).toContain("REQ-NFR-05");
  });
});

describe("leadingIds", () => {
  it("REQ-NFR-05: reads one or more comma-separated IDs before the first colon", () => {
    expect(leadingIds("REQ-DET-01: marks fail-then-pass as flaky")).toEqual(["REQ-DET-01"]);
    expect(leadingIds("REQ-DET-01, REQ-DET-02: ignores skipped")).toEqual([
      "REQ-DET-01",
      "REQ-DET-02",
    ]);
  });

  it("REQ-NFR-05: ignores IDs that are not at the start of the title", () => {
    expect(leadingIds("marks flaky commits (REQ-DET-01)")).toEqual([]);
    expect(leadingIds("REQ-DET-01 without a colon")).toEqual([]);
  });
});

describe("extractTestTitles", () => {
  const source = `
import { bench, describe, it, test } from "vitest";
describe("REQ-DET-01: describe names don't count", () => {
  it("REQ-DET-01: plain", () => {});
  test("REQ-DET-02: test()", () => {});
  it.concurrent("REQ-DET-03: concurrent", () => {});
  it.skip("REQ-DET-04: skipped", () => {});
  it.todo("REQ-DET-05: pending");
  it.each([1, 2])("REQ-DET-06: each %s", () => {});
  it(\`REQ-DET-07: template literal\`, () => {});
  const name = "REQ-DET-08: variable";
  it(name, () => {});
  it(\`REQ-DET-09: \${name}\`, () => {});
  bench("REQ-NFR-01: benchmark", () => {});
});
`;
  const titles = extractTestTitles(source, "example.test.ts");

  it("REQ-NFR-05: reads it, test, bench, and chained forms with their kind", () => {
    expect(titles.map((t) => [t.title.split(":")[0], t.kind])).toEqual([
      ["REQ-DET-01", "test"],
      ["REQ-DET-02", "test"],
      ["REQ-DET-03", "test"],
      ["REQ-DET-04", "skip"],
      ["REQ-DET-05", "todo"],
      ["REQ-DET-06", "test"],
      ["REQ-DET-07", "test"],
      ["REQ-NFR-01", "test"],
    ]);
  });

  it("REQ-NFR-05: reports the 1-based line of each test", () => {
    expect(titles[0]?.line).toBe(4);
  });

  it("REQ-NFR-05: parses .tsx files", () => {
    const tsx = `import { it } from "vitest";\nit("REQ-UI-06: renders", () => <span />);\n`;
    expect(extractTestTitles(tsx, "badge.test.tsx").map((t) => t.title)).toEqual([
      "REQ-UI-06: renders",
    ]);
  });
});
