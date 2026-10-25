import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../../tools/spec-check/src/index.js";

const SPEC = "#### REQ-DET-01\nText.\n\n#### REQ-DET-02\nText.\n";

let root: string;
let output: string[];
const run = (...args: string[]) =>
  runCli(["--root", root, ...args], (text) => {
    output.push(text);
  });

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "spec-check-"));
  output = [];
  await mkdir(path.join(root, "docs"));
  await writeFile(path.join(root, "docs", "SPEC.md"), SPEC);
  await mkdir(path.join(root, "test"));
  await writeFile(
    path.join(root, "test", "a.test.ts"),
    'import { it } from "vitest";\nit("REQ-DET-01: x", () => {});\nit.todo("REQ-DET-02: pending");\n',
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("spec:check CLI", () => {
  it("REQ-NFR-05: exits 0 and lists pending IDs", async () => {
    expect(await run()).toBe(0);
    expect(output.join("\n")).toContain("1 pending");
    expect(output.join("\n")).toContain("REQ-DET-02");
  });

  it("REQ-NFR-05: exits non-zero with --strict when an ID is pending, and names it", async () => {
    expect(await run("--strict")).toBe(1);
    expect(output.join("\n")).toMatch(/Pending \(not allowed with --strict\):\s+REQ-DET-02/);
  });

  it("REQ-NFR-05: exits non-zero and names an unknown ID", async () => {
    await writeFile(
      path.join(root, "test", "b.test.ts"),
      'import { it } from "vitest";\nit("REQ-DET-99: ...", () => {});\n',
    );
    expect(await run()).toBe(1);
    expect(output.join("\n")).toContain("REQ-DET-99  test/b.test.ts:2");
  });

  it("REQ-NFR-05: ignores files inside node_modules and dist", async () => {
    for (const dir of ["node_modules/pkg", "dist"]) {
      await mkdir(path.join(root, dir), { recursive: true });
      await writeFile(path.join(root, dir, "x.test.ts"), 'it("REQ-NOPE-01: x", () => {});\n');
    }
    expect(await run()).toBe(0);
  });

  it("REQ-NFR-05: --write-pending adds a placeholder for each missing ID", async () => {
    await writeFile(path.join(root, "test", "a.test.ts"), "// no tests yet\n");
    expect(await run("--write-pending")).toBe(0);
    const written = await readFile(
      path.join(root, "test", "traceability", "pending", "REQ-DET-01.test.ts"),
      "utf8",
    );
    expect(written).toContain('it.todo("REQ-DET-01: pending");');
    expect(output.join("\n")).toContain("2 pending");
  });

  it("REQ-NFR-05: rejects an unknown option with exit code 2", async () => {
    expect(await run("--nope")).toBe(2);
  });
});
