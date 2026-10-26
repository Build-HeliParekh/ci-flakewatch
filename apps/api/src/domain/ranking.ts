// Filtering, sorting, and paging the ranked list (REQ-API-03). Pure functions.
import type { SortField, SortOrder, Status, TestListItem } from "@flakewatch/shared";
import { compareCodePoints } from "./detector.js";

export interface RankOptions {
  status?: readonly Status[];
  q?: string;
  sort: SortField;
  order: SortOrder;
}

/** Items matching `status` and `q` (case-insensitive substring of `name` or `file`). */
export function filterItems(
  items: readonly TestListItem[],
  options: Pick<RankOptions, "status" | "q">,
): TestListItem[] {
  const q = options.q?.toLowerCase();
  return items.filter(
    (item) =>
      (!options.status || options.status.length === 0 || options.status.includes(item.status)) &&
      (q === undefined ||
        item.name.toLowerCase().includes(q) ||
        item.file.toLowerCase().includes(q)),
  );
}

/**
 * Sorts by `sort` in `order`, then by fixed tie-breakers that never flip with `order`:
 * flakeRate → failedAttempts desc, name asc, id asc; failedAttempts → flakeRate desc, name asc,
 * id asc; name → file asc, id asc. Text uses code-point order.
 */
export function sortItems(
  items: readonly TestListItem[],
  sort: SortField,
  order: SortOrder,
): TestListItem[] {
  const direction = order === "asc" ? 1 : -1;
  const primary = (a: TestListItem, b: TestListItem): number =>
    sort === "name" ? compareCodePoints(a.name, b.name) : compareNumbers(a[sort], b[sort]);
  const ties = (a: TestListItem, b: TestListItem): number => {
    if (sort === "flakeRate") {
      return (
        compareNumbers(b.failedAttempts, a.failedAttempts) ||
        compareCodePoints(a.name, b.name) ||
        a.id - b.id
      );
    }
    if (sort === "failedAttempts") {
      return (
        compareNumbers(b.flakeRate, a.flakeRate) || compareCodePoints(a.name, b.name) || a.id - b.id
      );
    }
    return compareCodePoints(a.file, b.file) || a.id - b.id;
  };
  return [...items].sort((a, b) => primary(a, b) * direction || ties(a, b));
}

/** One page; a page beyond the end is empty. */
export function pageOf<T>(items: readonly T[], page: number, pageSize: number): T[] {
  return items.slice((page - 1) * pageSize, page * pageSize);
}

function compareNumbers(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
