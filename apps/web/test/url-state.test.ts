import { describe, expect, it } from "vitest";
import {
  parseOverviewState,
  serializeOverviewState,
  DEFAULT_STATE,
} from "../src/state/url-state.js";

const parse = (query: string) => parseOverviewState(new URLSearchParams(query));

describe("overview state in the URL", () => {
  it("REQ-UI-03: an empty query gives the defaults: all branches, 30 days, all statuses, flake rate worst first, page 1", () => {
    expect(parse("")).toEqual(DEFAULT_STATE);
    expect(DEFAULT_STATE).toEqual({
      branch: "*",
      window: "30d",
      status: [],
      sort: "flakeRate",
      order: "desc",
      page: 1,
    });
  });

  it("REQ-UI-03: reads every filter, sort, search, and page value, using the API's parameter names", () => {
    expect(
      parse(
        "repo=demo/shoplite&branch=main&window=7d&status=flaky,quarantined&q=cart&sort=failedAttempts&order=asc&page=3",
      ),
    ).toEqual({
      repo: "demo/shoplite",
      branch: "main",
      window: "7d",
      status: ["quarantined", "flaky"],
      q: "cart",
      sort: "failedAttempts",
      order: "asc",
      page: 3,
    });
  });

  it("REQ-UI-03: writing and reading the state gives the same state back", () => {
    const state = parse(
      "repo=demo/shoplite&branch=feature/avatar-v2&window=7d&status=broken&q=pay&page=2",
    );
    expect(parseOverviewState(serializeOverviewState(state))).toEqual(state);
  });

  it("REQ-UI-03: leaves defaults out of the URL", () => {
    expect(serializeOverviewState(DEFAULT_STATE).toString()).toBe("");
    expect(serializeOverviewState({ ...DEFAULT_STATE, window: "7d" }).toString()).toBe("window=7d");
  });

  it("REQ-UI-03: writes statuses in a fixed order, so the same filter always gives the same URL", () => {
    const a = serializeOverviewState(parse("status=stable,broken")).toString();
    const b = serializeOverviewState(parse("status=broken,stable")).toString();
    expect(a).toBe(b);
    expect(a).toBe("status=broken%2Cstable");
  });

  it("REQ-UI-03: falls back to the defaults for invalid values", () => {
    expect(parse("window=14d&sort=bogus&order=up&page=-2&status=nope")).toEqual(DEFAULT_STATE);
    expect(parse("page=1.5").page).toBe(1);
    expect(parse("q=%20%20").q).toBeUndefined();
  });

  it("REQ-UI-03: the default order is worst first for numbers and A to Z for names", () => {
    expect(parse("sort=name").order).toBe("asc");
    expect(parse("sort=failedAttempts").order).toBe("desc");
  });
});
