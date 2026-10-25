// GET /api/v1/tests (REQ-API-03).
import type {
  BranchScope,
  QuarantineSource,
  SortField,
  SortOrder,
  Status,
  Window,
} from "./constants.js";
import type { ScopeStats, TestIdentity } from "./stats.js";

export interface TestsQuery {
  repo?: string;
  branch?: BranchScope;
  window?: Window;
  status?: Status[];
  q?: string;
  sort?: SortField;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
}

export interface TestListItem extends TestIdentity, ScopeStats {
  status: Status;
  quarantineSource: QuarantineSource | null;
}

export interface TestsResponse {
  items: TestListItem[];
  page: number;
  pageSize: number;
  total: number;
  /** The `now` the statistics were computed at. */
  asOf: string;
}
