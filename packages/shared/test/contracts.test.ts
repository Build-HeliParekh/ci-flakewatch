import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, ERROR_HTTP_STATUS } from "../src/index.js";

/** Rows of the error table in SPEC §9 (REQ-API-01): | `CODE` | 400 | When |. */
function specErrorTable(): Record<string, number> {
  const spec = readFileSync(new URL("../../../docs/SPEC.md", import.meta.url), "utf8");
  const section = spec.slice(spec.indexOf("#### REQ-API-01"), spec.indexOf("#### REQ-API-02"));
  const rows = [...section.matchAll(/^\| `([A-Z_]+)` \| (\d{3}) \|/gm)];
  return Object.fromEntries(rows.map((row) => [row[1], Number(row[2])]));
}

describe("error codes", () => {
  it("REQ-API-01: maps every error code to its HTTP status", () => {
    const table = specErrorTable();
    expect(Object.keys(table).length).toBeGreaterThan(0);
    expect(ERROR_HTTP_STATUS).toEqual(table);
    expect([...ERROR_CODES].sort()).toEqual(Object.keys(table).sort());
  });
});
