import { describe, expect, it } from "vitest";
import { checkTraceability, exitCode } from "../../tools/spec-check/src/index.js";

const SPEC = `
#### REQ-DET-01
Text.

#### REQ-DET-02
Text.

#### REQ-DET-03 (Withdrawn)
Text.
`;

const file = (path: string, ...lines: string[]) => ({
  path,
  source: `import { it } from "vitest";\n${lines.join("\n")}\n`,
});

describe("checkTraceability", () => {
  it("REQ-NFR-05: fails and names an ID that a test uses but the spec doesn't define", () => {
    const result = checkTraceability(SPEC, [
      file(
        "a.test.ts",
        'it("REQ-DET-01: x", () => {});',
        'it("REQ-DET-02: y", () => {});',
        'it("REQ-DET-99: z", () => {});',
      ),
    ]);
    expect(result.unknown).toEqual([{ id: "REQ-DET-99", file: "a.test.ts", line: 4 }]);
    expect(exitCode(result, false)).toBe(1);
  });

  it("REQ-NFR-05: fails and names a spec ID with no test of any kind", () => {
    const result = checkTraceability(SPEC, [file("a.test.ts", 'it("REQ-DET-01: x", () => {});')]);
    expect(result.missing).toEqual(["REQ-DET-02"]);
    expect(exitCode(result, false)).toBe(1);
  });

  it("REQ-NFR-05: lists an ID covered only by it.todo as pending; exit 0, but --strict fails", () => {
    const result = checkTraceability(SPEC, [
      file("a.test.ts", 'it("REQ-DET-01: x", () => {});', 'it.todo("REQ-DET-02: pending");'),
    ]);
    expect(result.pending).toEqual(["REQ-DET-02"]);
    expect(result.missing).toEqual([]);
    expect(exitCode(result, false)).toBe(0);
    expect(exitCode(result, true)).toBe(1);
  });

  it("REQ-NFR-05: does not count a skipped test as a reference", () => {
    const result = checkTraceability(SPEC, [
      file("a.test.ts", 'it("REQ-DET-01: x", () => {});', 'it.skip("REQ-DET-02: y", () => {});'),
    ]);
    expect(result.missing).toEqual(["REQ-DET-02"]);
  });

  it("REQ-NFR-05: a real test wins over a placeholder for the same ID", () => {
    const result = checkTraceability(SPEC, [
      file("a.test.ts", 'it("REQ-DET-01: x", () => {});', 'it("REQ-DET-02: y", () => {});'),
      file("pending.test.ts", 'it.todo("REQ-DET-02: pending");'),
    ]);
    expect(result.pending).toEqual([]);
    expect(result.covered.get("REQ-DET-02")).toEqual(["a.test.ts"]);
  });

  it("REQ-NFR-05: doesn't require Withdrawn IDs, and doesn't treat them as unknown", () => {
    const result = checkTraceability(SPEC, [
      file(
        "a.test.ts",
        'it("REQ-DET-01, REQ-DET-02: both", () => {});',
        'it("REQ-DET-03: old behavior", () => {});',
      ),
    ]);
    expect(result.missing).toEqual([]);
    expect(result.unknown).toEqual([]);
    expect(result.activeCount).toBe(2);
    expect(exitCode(result, true)).toBe(0);
  });

  it("REQ-NFR-05: an unknown ID anywhere in a title is reported, not only at the start", () => {
    const result = checkTraceability(SPEC, [
      file(
        "a.test.ts",
        'it("REQ-DET-01: also see REQ-XYZ-01", () => {});',
        'it("REQ-DET-02: y", () => {});',
      ),
    ]);
    expect(result.unknown.map((u) => u.id)).toEqual(["REQ-XYZ-01"]);
  });
});
