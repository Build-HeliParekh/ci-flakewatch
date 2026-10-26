// Query parameter rules shared by the read endpoints (REQ-API-01, decision D-18): a documented
// parameter that is invalid, repeated, or empty gives 400; undocumented names are ignored.
import {
  ALL_BRANCHES,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  SORT_FIELDS,
  SORT_ORDERS,
  STATUSES,
  WINDOWS,
  type BranchScope,
  type SortField,
  type SortOrder,
  type Status,
  type Window,
} from "@flakewatch/shared";
import type { Request } from "express";
import { HttpError } from "./errors.js";

/** The query string as raw values, so repeats are visible (Express merges them). */
export class QueryParams {
  private readonly search: URLSearchParams;

  constructor(req: Request) {
    const index = req.originalUrl.indexOf("?");
    this.search = new URLSearchParams(index === -1 ? "" : req.originalUrl.slice(index + 1));
  }

  /** The single value of a documented parameter, or undefined if absent. */
  get(name: string): string | undefined {
    const values = this.search.getAll(name);
    if (values.length === 0) return undefined;
    if (values.length > 1) throw invalid(`${name} must be given once`);
    const [value] = values;
    if (value === undefined || value === "") throw invalid(`${name} must not be empty`);
    return value;
  }

  repo(): string | undefined {
    return this.get("repo");
  }

  branch(): BranchScope {
    return this.get("branch") ?? ALL_BRANCHES;
  }

  window(): Window {
    return oneOf("window", this.get("window"), WINDOWS) ?? "30d";
  }

  statuses(): Status[] | undefined {
    const value = this.get("status");
    if (value === undefined) return undefined;
    const parts = value.split(",");
    for (const part of parts) {
      if (!(STATUSES as readonly string[]).includes(part)) {
        throw invalid("status must be a comma-separated subset of broken,quarantined,flaky,stable");
      }
    }
    return STATUSES.filter((status) => parts.includes(status));
  }

  q(): string | undefined {
    const value = this.get("q");
    if (value !== undefined && Array.from(value).length > 200) {
      throw invalid("q must be 1–200 characters");
    }
    return value;
  }

  sort(): SortField {
    return oneOf("sort", this.get("sort"), SORT_FIELDS) ?? "flakeRate";
  }

  order(sort: SortField): SortOrder {
    return oneOf("order", this.get("order"), SORT_ORDERS) ?? (sort === "name" ? "asc" : "desc");
  }

  page(): number {
    return integer("page", this.get("page"), 1, Number.MAX_SAFE_INTEGER) ?? 1;
  }

  pageSize(): number {
    return integer("pageSize", this.get("pageSize"), 1, PAGE_SIZE_MAX) ?? PAGE_SIZE_DEFAULT;
  }
}

/** A path ID: a positive integer, else 400 (REQ-API-01). */
export function parseId(value: string | undefined): number {
  if (value === undefined || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw invalid("id must be a positive integer");
  }
  return Number(value);
}

function oneOf<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw invalid(`${name} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function integer(
  name: string,
  value: string | undefined,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  const ok = /^[0-9]+$/.test(value) && Number(value) >= min && Number(value) <= max;
  if (!ok)
    throw invalid(
      `${name} must be an integer from ${min}${max === Number.MAX_SAFE_INTEGER ? " up" : ` to ${max}`}`,
    );
  return Number(value);
}

function invalid(message: string): HttpError {
  return new HttpError("VALIDATION_ERROR", message);
}
