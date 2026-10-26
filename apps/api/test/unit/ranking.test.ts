import type { TestListItem } from "@flakewatch/shared";
import { describe, expect, it } from "vitest";
import { filterItems, pageOf, sortItems } from "../../src/domain/ranking.js";

const item = (
  id: number,
  name: string,
  flakeRate: number,
  failedAttempts: number,
  extra: Partial<TestListItem> = {},
): TestListItem => ({
  id,
  repo: "demo/shoplite",
  file: `tests/${name.split(" ")[0] ?? "x"}.test.ts`,
  classname: "",
  name,
  status: flakeRate > 0 ? "flaky" : "stable",
  quarantineSource: null,
  flakeRate,
  flakyCommits: 0,
  commitsRun: 10,
  failedAttempts,
  unconfirmedFailures: 0,
  skippedResults: 0,
  lastSeenAt: null,
  ...extra,
});

const names = (items: TestListItem[]) => items.map((i) => i.name);

describe("ranking", () => {
  const items = [
    item(1, "b test", 0.2, 3),
    item(2, "a test", 0.2, 5),
    item(3, "c test", 0.5, 1),
    item(4, "a test", 0.2, 5, { file: "tests/z.test.ts" }),
    item(5, "d test", 0, 0),
  ];

  it("REQ-API-03: flakeRate desc, then failedAttempts desc, name asc, id asc", () => {
    expect(sortItems(items, "flakeRate", "desc").map((i) => i.id)).toEqual([3, 2, 4, 1, 5]);
  });

  it("REQ-API-03: with order=asc, equal flake rates still put more failedAttempts first", () => {
    expect(sortItems(items, "flakeRate", "asc").map((i) => i.id)).toEqual([5, 2, 4, 1, 3]);
  });

  it("REQ-API-03: failedAttempts sort breaks ties by flakeRate desc, name, then id", () => {
    const tied = [
      item(1, "b", 0.1, 4),
      item(2, "a", 0.3, 4),
      item(3, "c", 0.3, 4),
      item(4, "z", 0, 9),
    ];
    expect(sortItems(tied, "failedAttempts", "desc").map((i) => i.id)).toEqual([4, 2, 3, 1]);
    expect(sortItems(tied, "failedAttempts", "asc").map((i) => i.id)).toEqual([2, 3, 1, 4]);
  });

  it("REQ-API-03: name sort is code-point order, ties by file then id", () => {
    const named = [
      item(1, "b", 0, 0),
      item(2, "B", 0, 0),
      item(3, "a", 0, 0, { file: "tests/z.ts" }),
      item(4, "a", 0, 0, { file: "tests/a.ts" }),
    ];
    expect(sortItems(named, "name", "asc").map((i) => i.id)).toEqual([2, 4, 3, 1]);
    expect(sortItems(named, "name", "desc").map((i) => i.id)).toEqual([1, 4, 3, 2]);
  });

  it("REQ-API-03: status and q filters; q is a case-insensitive substring of name or file", () => {
    expect(names(filterItems(items, { status: ["stable"] }))).toEqual(["d test"]);
    expect(filterItems(items, { q: "A TE" }).map((i) => i.id)).toEqual([2, 4]);
    expect(filterItems(items, { q: "z.test" }).map((i) => i.id)).toEqual([4]);
  });

  it("REQ-API-03: a page beyond the end is empty", () => {
    expect(pageOf([1, 2, 3], 2, 2)).toEqual([3]);
    expect(pageOf([1, 2, 3], 3, 2)).toEqual([]);
  });
});
