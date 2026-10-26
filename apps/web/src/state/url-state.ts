// Overview filters live in the URL, so a view can be shared as a link (REQ-UI-03). Query keys
// are the API's parameter names.
import {
  ALL_BRANCHES,
  DEFAULT_WINDOW,
  SORT_FIELDS,
  STATUSES,
  WINDOWS,
  type BranchScope,
  type SortField,
  type SortOrder,
  type Status,
  type Window,
} from "@flakewatch/shared";

export interface OverviewState {
  /** `undefined` means "the first repo" (REQ-UI-02). */
  repo?: string;
  branch: BranchScope;
  window: Window;
  status: Status[];
  q?: string;
  sort: SortField;
  order: SortOrder;
  page: number;
}

/** The default order for a sort field: worst first, or A to Z for names. */
export function defaultOrder(sort: SortField): SortOrder {
  return sort === "name" ? "asc" : "desc";
}

export const DEFAULT_STATE: OverviewState = {
  branch: ALL_BRANCHES,
  window: DEFAULT_WINDOW,
  status: [],
  sort: "flakeRate",
  order: "desc",
  page: 1,
};

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | undefined =>
  values.find((candidate) => candidate === value);

/** Reads the overview state from a query string. Invalid values fall back to the defaults. */
export function parseOverviewState(search: URLSearchParams): OverviewState {
  const repo = search.get("repo")?.trim();
  const branch = search.get("branch")?.trim();
  const q = search.get("q")?.trim();
  const sort = oneOf(SORT_FIELDS, search.get("sort")) ?? DEFAULT_STATE.sort;
  const order = oneOf(["asc", "desc"] as const, search.get("order")) ?? defaultOrder(sort);
  const page = Number(search.get("page"));
  const status = [
    ...new Set(
      (search.get("status") ?? "")
        .split(",")
        .map((value) => oneOf(STATUSES, value.trim()))
        .filter((value): value is Status => value !== undefined),
    ),
  ];
  // Keep the status order of SPEC §7 so the same filter always gives the same URL.
  status.sort((a, b) => STATUSES.indexOf(a) - STATUSES.indexOf(b));

  return {
    ...(repo ? { repo } : {}),
    branch: branch ? branch : DEFAULT_STATE.branch,
    window: oneOf(WINDOWS, search.get("window")) ?? DEFAULT_STATE.window,
    status,
    ...(q ? { q } : {}),
    sort,
    order,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Writes the state as query parameters, leaving out defaults. */
export function serializeOverviewState(state: OverviewState): URLSearchParams {
  const search = new URLSearchParams();
  if (state.repo) search.set("repo", state.repo);
  if (state.branch !== DEFAULT_STATE.branch) search.set("branch", state.branch);
  if (state.window !== DEFAULT_STATE.window) search.set("window", state.window);
  if (state.status.length > 0) search.set("status", state.status.join(","));
  if (state.q) search.set("q", state.q);
  if (state.sort !== DEFAULT_STATE.sort) search.set("sort", state.sort);
  if (state.order !== defaultOrder(state.sort)) search.set("order", state.order);
  if (state.page !== 1) search.set("page", String(state.page));
  return search;
}
