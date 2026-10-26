// Overview filters live in the URL, so a view can be shared as a link (REQ-UI-03). Query keys
// are the API's parameter names.
import {
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
export function defaultOrder(_sort: SortField): SortOrder {
  void _sort;
  throw new Error("not implemented (G8b)");
}

/** The state with no filters: all branches, 30 days, all statuses, flake rate worst first, page 1. */
export const DEFAULT_STATE: OverviewState = {
  branch: "*",
  window: "30d",
  status: [],
  sort: "flakeRate",
  order: "desc",
  page: 1,
};

/** Reads the state from the URL; invalid values fall back to the defaults. */
export function parseOverviewState(_search: URLSearchParams): OverviewState {
  void _search;
  throw new Error("not implemented (G8b)");
}

/** Writes the state to the URL, leaving out defaults. */
export function serializeOverviewState(_state: OverviewState): URLSearchParams {
  void _state;
  throw new Error("not implemented (G8b)");
}
