// Statistics as of a given `now`, read from the database (PLAN §3.4, REQ-STA-03, REQ-STA-06).
// Every method takes `now` and never reads the clock, so one request uses one `now`.
import type { BranchScope, TestListItem, TestScope, Window } from "@flakewatch/shared";
import type { StatusRules } from "../domain/status.js";
import type { Db } from "../db/open.js";

export interface ListScopeParams {
  repo?: string;
  branch: BranchScope;
  window: Window;
}

export interface StatsService {
  /**
   * Every test case with `commitsRun ≥ 1` in the scope (REQ-CLS-05), with its statistics,
   * status, and quarantine source, ordered by test case id. Ranking and paging are separate.
   */
  listScope(params: ListScopeParams, now: Date): TestListItem[];

  /**
   * A test case's statistics for every scope in REQ-STA-03: {7d, 30d} × (branches with any
   * retained result ∪ {*}), in `scopesFor` order, including scopes with no data
   * (`status: null`). `null` if the test case doesn't exist. (Used by T-19's detail endpoint.)
   */
  scopes(testCaseId: number, now: Date): TestScope[] | null;

  // Added by later tasks: testDetail (T-19), history (T-20), quarantineList (T-22), repos (T-17).
}

export function createStatsService(db: Db, rules: StatusRules): StatsService {
  const notImplemented = (name: string): never => {
    throw new Error(`${name} is not implemented yet (T-16b); rules: ${JSON.stringify(rules)}`);
  };
  void db;
  return {
    listScope: () => notImplemented("listScope"),
    scopes: () => notImplemented("scopes"),
  };
}
