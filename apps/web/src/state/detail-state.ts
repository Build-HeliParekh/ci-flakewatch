// The detail page's scope lives in the URL next to the overview's filters (REQ-UI-03, UI-07).
// Its own keys are separate, so "Back to all tests" restores the overview exactly.
import { ALL_BRANCHES, WINDOWS, type BranchScope, type Window } from "@flakewatch/shared";
import { parseOverviewState } from "./url-state.js";

export const DETAIL_KEYS = { window: "scopeWindow", branch: "scopeBranch" } as const;

export interface DetailScope {
  window: Window;
  branch: BranchScope;
}

/** The selected scope: the detail page's own choice, else the overview's filters. */
export function parseDetailScope(search: URLSearchParams): DetailScope {
  const overview = parseOverviewState(search);
  const window = search.get(DETAIL_KEYS.window);
  const branch = search.get(DETAIL_KEYS.branch);
  return {
    window: (WINDOWS as readonly string[]).includes(window ?? "")
      ? (window as Window)
      : overview.window,
    branch: branch ? branch : overview.branch,
  };
}

/** The URL with a new detail scope, keeping the overview's filters. */
export function withDetailScope(search: URLSearchParams, scope: DetailScope): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set(DETAIL_KEYS.window, scope.window);
  next.set(DETAIL_KEYS.branch, scope.branch);
  return next;
}

/** The overview's query string, without the detail page's keys. */
export function overviewSearch(search: URLSearchParams): string {
  const next = new URLSearchParams(search);
  next.delete(DETAIL_KEYS.window);
  next.delete(DETAIL_KEYS.branch);
  const text = next.toString();
  return text === "" ? "" : `?${text}`;
}

export { ALL_BRANCHES };
