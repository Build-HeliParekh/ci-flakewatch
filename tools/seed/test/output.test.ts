import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { XMLParser } from "fast-xml-parser";
import { parseJUnit } from "../../../apps/api/src/ingest/junit.js";
import { createTestApp } from "../../../apps/api/test/helpers/app.js";
import {
  DEFAULT_OPTIONS,
  generateScenario,
  parseArgs,
  toJUnitXml,
  uploadAll,
  writeOutput,
  type ManifestEntry,
} from "../src/index.js";

const tmp = () => mkdtempSync(path.join(tmpdir(), "flakewatch-seed-"));
const checksums = (dir: string) =>
  Object.fromEntries(
    readdirSync(dir)
      .sort()
      .map((f) => [
        f,
        createHash("sha256")
          .update(readFileSync(path.join(dir, f)))
          .digest("hex"),
      ]),
  );

describe("output", () => {
  it("REQ-SEED-01: two --out runs with seed 42 give byte-identical files, manifest included", () => {
    const one = tmp();
    const two = tmp();
    writeOutput(one, generateScenario({ ...DEFAULT_OPTIONS, seed: 42 }));
    writeOutput(two, generateScenario({ ...DEFAULT_OPTIONS, seed: 42 }));
    const a = checksums(one);
    expect(Object.keys(a)).toContain("manifest.json");
    expect(checksums(two)).toEqual(a);
  });

  it("REQ-SEED-01: a different seed gives different output", () => {
    const [other] = generateScenario({ ...DEFAULT_OPTIONS, seed: 7 });
    const [usual] = generateScenario();
    if (!other || !usual) throw new Error("no attempts");
    expect(toJUnitXml(other)).not.toBe(toJUnitXml(usual));
  });

  it("REQ-SEED-02: --out writes <NNNN>-<runId>-attempt<k>.xml files and a manifest in upload order", () => {
    const dir = tmp();
    const attempts = generateScenario();
    expect(writeOutput(dir, attempts)).toBe(attempts.length);
    const manifest = JSON.parse(
      readFileSync(path.join(dir, "manifest.json"), "utf8"),
    ) as ManifestEntry[];
    expect(manifest).toHaveLength(attempts.length);
    expect(readdirSync(dir).filter((f) => f.endsWith(".xml"))).toHaveLength(attempts.length);
    expect(manifest[0]).toEqual({
      file: `0001-${attempts[0]?.runId}-attempt1.xml`,
      repo: "demo/shoplite",
      branch: attempts[0]?.branch,
      commitSha: attempts[0]?.commitSha,
      runId: attempts[0]?.runId,
      attempt: 1,
      startedAt: `${attempts[0]?.startedAt.toISOString().slice(0, 19)}Z`,
    });
    for (const [i, entry] of manifest.entries()) {
      expect(entry.file).toMatch(
        new RegExp(
          `^${String(i + 1).padStart(4, "0")}-${entry.runId}-attempt${entry.attempt}\\.xml$`,
        ),
      );
    }
  });

  it("REQ-SEED-02: options default to seed 42, 60 days, end 2026-10-24, the local API, and UPLOAD_TOKEN", () => {
    const today = () => new Date("2026-11-03T15:20:00Z");
    expect(parseArgs([], { UPLOAD_TOKEN: "abc" }, today)).toEqual({
      seed: 42,
      days: 60,
      end: new Date("2026-10-24T00:00:00Z"),
      out: undefined,
      api: "http://localhost:4000",
      token: "abc",
    });
    expect(parseArgs(["--end", "today"], {}, today).end).toEqual(new Date("2026-11-03T00:00:00Z"));
    const custom = parseArgs(
      [
        "--seed",
        "7",
        "--days",
        "30",
        "--end",
        "2026-01-01T00:00:00Z",
        "--out",
        "x",
        "--api",
        "http://h:1",
        "--token",
        "t",
      ],
      {},
      today,
    );
    expect(custom).toMatchObject({ seed: 7, days: 30, out: "x", api: "http://h:1", token: "t" });
    expect(() => parseArgs(["--end", "2026-01-01T05:00:00Z"], {}, today)).toThrow(/--end/);
    expect(() => parseArgs(["--seed"], {}, today)).toThrow();
    expect(() => parseArgs(["--bogus", "1"], {}, today)).toThrow(/unknown/);
  });

  it("REQ-SEED-02: with UPLOAD_TOKEN=abc on the server and in the generator's environment, seeding succeeds", async () => {
    const { app } = createTestApp({ env: { UPLOAD_TOKEN: "abc" } });
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as { port: number };
    try {
      const attempts = generateScenario({ ...DEFAULT_OPTIONS, days: 3 });
      const options = parseArgs(
        ["--api", `http://127.0.0.1:${port}`],
        { UPLOAD_TOKEN: "abc" },
        () => DEFAULT_OPTIONS.end,
      );
      const report = await uploadAll(attempts, { api: options.api, token: options.token });
      expect(report).toMatchObject({ attempts: attempts.length, results: attempts.length * 150 });
      await expect(
        uploadAll(attempts.slice(0, 1), { api: options.api, token: "wrong" }),
      ).rejects.toThrow(/401/);
    } finally {
      server.close();
    }
  });

  it("REQ-SEED-06: every generated file passes the real parser, and suite counts match their test cases", () => {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      isArray: (name) => name === "testsuite" || name === "testcase",
    });
    for (const attempt of generateScenario()) {
      const xml = toJUnitXml(attempt);
      const parsed = parseJUnit(xml);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.cases.map((c) => [c.name, c.status])).toEqual(
        attempt.cases.map((c) => [c.name, c.status]),
      );
      expect(parsed.cases.map((c) => c.durationMs)).toEqual(attempt.cases.map((c) => c.durationMs));
      const doc = parser.parse(xml) as {
        testsuites: Record<string, string> & {
          testsuite: (Record<string, string> & {
            testcase: { failure?: unknown; time: string }[];
          })[];
        };
      };
      const root = doc.testsuites;
      expect(Number(root.tests)).toBe(150);
      for (const suite of root.testsuite) {
        expect(suite.file).toBe(`tests/${suite.name}.test.ts`);
        expect(Number(suite.tests)).toBe(suite.testcase.length);
        expect(Number(suite.failures)).toBe(
          suite.testcase.filter((c) => c.failure !== undefined).length,
        );
        expect(Number(suite.errors)).toBe(0);
        expect(Number(suite.skipped)).toBe(0);
        const sum = suite.testcase.reduce(
          (total, c) => total + Math.round(Number(c.time) * 1000),
          0,
        );
        expect(Math.round(Number(suite.time) * 1000)).toBe(sum);
      }
    }
  });
});
