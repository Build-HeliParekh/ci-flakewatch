// Statistics as of a given `now`, read from the database (PLAN §3.4, REQ-STA-03, REQ-STA-06).
// Every method takes `now` and never reads the clock, so one request uses one `now`.
import {
  ALL_BRANCHES,
  type BranchScope,
  type QuarantineSource,
  type ScopeStats,
  type Status,
  type TestIdentity,
  type TestListItem,
  type TestScope,
  type Window,
} from "@flakewatch/shared";
import { selectScopeFacts, summarizeCommits } from "../domain/detector.js";
import { computeScopeCounts } from "../domain/stats.js";
import { resolveStatus, scopesFor, type StatusRules } from "../domain/status.js";
import type { ResultFact } from "../domain/types.js";
import { windowRange } from "../domain/windows.js";
import { loadBranchesWithResults, loadFacts, loadLastSeen } from "../db/repos/read.js";
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

type ScopeResult = ScopeStats & {
  status: Status | null;
  quarantineSource: QuarantineSource | null;
};

export function createStatsService(db: Db, rules: StatusRules): StatsService {
  const testCasesById = (repo: string | undefined): Map<number, TestIdentity> => {
    const rows = db
      .prepare<unknown[], TestIdentity>(
        `SELECT id, repo, file, classname, name FROM test_cases
         ${repo === undefined ? "" : "WHERE repo = ?"} ORDER BY id`,
      )
      .all(...(repo === undefined ? [] : [repo]));
    return new Map(rows.map((row) => [row.id, row]));
  };

  const manuallyQuarantined = (): Set<number> =>
    new Set(
      db
        .prepare<[], { id: number }>("SELECT test_case_id AS id FROM manual_quarantines")
        .all()
        .map((row) => row.id),
    );

  /** Statistics for one test case in one scope; `scopeFacts` are already in the scope. */
  const scopeResult = (
    scopeFacts: readonly ResultFact[],
    lastSeenMs: number | null,
    manual: boolean,
  ): ScopeResult => {
    const counts = computeScopeCounts(scopeFacts);
    const { status, quarantineSource } = resolveStatus({
      counts,
      commits: summarizeCommits(scopeFacts),
      manual,
      rules,
    });
    return { ...counts, lastSeenAt: toIso(lastSeenMs), status, quarantineSource };
  };

  return {
    listScope(params, now) {
      const range = windowRange(params.window, now);
      // Three queries per call: facts in the scope, last-seen times, and manual quarantines.
      const facts = loadFacts(db, {
        ...(params.repo === undefined ? {} : { repo: params.repo }),
        branch: params.branch,
        startedAfterMs: range.startExclusiveMs,
        startedAtOrBeforeMs: range.endInclusiveMs,
      });
      const factsByTestCase = groupBy(facts, (fact) => fact.testCaseId);
      const lastSeen = loadLastSeen(db, params.repo === undefined ? {} : { repo: params.repo });
      const manual = manuallyQuarantined();
      const identities = testCasesById(params.repo);

      const items: TestListItem[] = [];
      for (const [id, identity] of identities) {
        const scopeFacts = factsByTestCase.get(id);
        if (!scopeFacts) continue;
        const result = scopeResult(
          scopeFacts,
          lastSeenFor(lastSeen.get(id), params.branch),
          manual.has(id),
        );
        // CLS-05: no decisive results in the scope means no status, so not listed.
        if (result.status === null) continue;
        items.push({ ...identity, ...result, status: result.status });
      }
      return items;
    },

    scopes(testCaseId, now) {
      const identity = db
        .prepare<[number], { id: number }>("SELECT id FROM test_cases WHERE id = ?")
        .get(testCaseId);
      if (!identity) return null;

      const facts = loadFacts(db, { testCaseIds: [testCaseId] });
      const lastSeen = loadLastSeen(db, { testCaseIds: [testCaseId] }).get(testCaseId);
      const manual = manuallyQuarantined().has(testCaseId);

      return scopesFor(loadBranchesWithResults(db, testCaseId)).map((scope): TestScope => {
        const scopeFacts = selectScopeFacts(facts, scope.branch, windowRange(scope.window, now));
        return {
          ...scope,
          ...scopeResult(scopeFacts, lastSeenFor(lastSeen, scope.branch), manual),
        };
      });
    },
  };
}

/** The last-seen time for a branch, or the latest over all branches for `*`. */
function lastSeenFor(
  byBranch: Map<string, number> | undefined,
  branch: BranchScope,
): number | null {
  if (!byBranch) return null;
  if (branch !== ALL_BRANCHES) return byBranch.get(branch) ?? null;
  let latest: number | null = null;
  for (const ms of byBranch.values()) if (latest === null || ms > latest) latest = ms;
  return latest;
}

/** ISO 8601 UTC. The exact precision is still open (PLAN PQ-06). */
function toIso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
