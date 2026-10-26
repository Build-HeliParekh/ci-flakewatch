// Statistics as of a given `now`, read from the database (PLAN §3.4, REQ-STA-03, REQ-STA-06).
// Every method takes `now` and never reads the clock, so one request uses one `now`.
import {
  ALL_BRANCHES,
  STATUSES,
  type BranchScope,
  type HistoryCommit,
  type HistoryResponse,
  type QuarantineListItem,
  type RepoItem,
  type Scope,
  type SummaryResponse,
  type TestDetailResponse,
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
import {
  loadBranchesWithResults,
  loadFacts,
  loadHistoryRows,
  loadLastSeen,
  loadRecentErrors,
  loadRepos,
} from "../db/repos/read.js";
import { getManual, listManualIds } from "../db/repos/quarantine.js";
import { compareCodePoints } from "../domain/detector.js";
import { trendSeries } from "../domain/trend.js";
import type { Db } from "../db/open.js";
import { toApiTimestamp } from "../http/errors.js";

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

  /** Overview card counts for a scope (REQ-API-04), without `asOf`. */
  summary(params: ListScopeParams, now: Date): Omit<SummaryResponse, "asOf">;

  /** GET /tests/:id (REQ-API-05); `null` if the test case doesn't exist. */
  testDetail(testCaseId: number, now: Date): TestDetailResponse | null;

  /** GET /tests/:id/history (REQ-API-06); `null` if the test case doesn't exist. */
  history(testCaseId: number, scope: Scope, now: Date): HistoryResponse | null;

  /** GET /quarantine (REQ-QUA-05): 30d/* quarantined plus every manual one, never broken. */
  quarantineList(repo: string, now: Date): QuarantineListItem[];

  /** GET /repos (REQ-API-02). */
  repos(): RepoItem[];
}

/** REQ-API-06: at most this many commits, newest first. */
const HISTORY_COMMITS = 100;
/** REQ-API-05: the most recent failure messages. */
const RECENT_ERRORS = 5;

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

  const service: StatsService = {
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

    summary(params, now) {
      const items = service.listScope(params, now);
      const count = (status: Status) => items.filter((item) => item.status === status).length;
      const counts = Object.fromEntries(
        STATUSES.map((status) => [status, count(status)]),
      ) as Record<Status, number>;
      return {
        ...counts,
        failedAttemptsFromFlakes: items
          .filter((item) => item.status === "flaky" || item.status === "quarantined")
          .reduce((sum, item) => sum + item.failedAttempts, 0),
      };
    },

    testDetail(testCaseId, now) {
      const identity = db
        .prepare<[number], TestIdentity>(
          "SELECT id, repo, file, classname, name FROM test_cases WHERE id = ?",
        )
        .get(testCaseId);
      if (!identity) return null;
      return {
        ...identity,
        manualQuarantine: getManual(db, testCaseId),
        scopes: service.scopes(testCaseId, now) ?? [],
        recentErrors: loadRecentErrors(db, testCaseId, RECENT_ERRORS).map((row) => ({
          commitSha: row.commitSha,
          branch: row.branch,
          attempt: row.attempt,
          startedAt: toApiTimestamp(new Date(row.startedAtMs)),
          message: row.message,
        })),
      };
    },

    history(testCaseId, scope, now) {
      const exists = db
        .prepare<[number], { id: number }>("SELECT id FROM test_cases WHERE id = ?")
        .get(testCaseId);
      if (!exists) return null;

      const rows = loadHistoryRows(db, testCaseId, scope.branch);
      const branchFacts: ResultFact[] = rows.map((row) => ({ ...row, testCaseId, repo: "" }));
      const range = windowRange(scope.window, now);
      const inScope = rows.filter(
        (row) =>
          row.startedAtMs > range.startExclusiveMs && row.startedAtMs <= range.endInclusiveMs,
      );
      const scopeFacts = selectScopeFacts(branchFacts, scope.branch, range);
      const rowsByCommit = groupBy(inScope, (row) => row.commitSha);

      // Commits with only skipped results are left out (decision PQ-08).
      const commits = summarizeCommits(scopeFacts)
        .reverse()
        .slice(0, HISTORY_COMMITS)
        .map((summary): HistoryCommit => ({
          commitSha: summary.commitSha,
          branches: summary.branches,
          firstStartedAt: toApiTimestamp(new Date(summary.firstStartedAtMs)),
          outcome: summary.outcome,
          rerun: summary.decisiveResults > 1,
          // One entry per result, so an in-run retry shows twice (decision PQ-07).
          attempts: (rowsByCommit.get(summary.commitSha) ?? []).map((row) => ({
            attempt: row.attempt,
            startedAt: toApiTimestamp(new Date(row.startedAtMs)),
            status: row.status,
            durationMs: row.durationMs,
          })),
        }));
      return { commits, trend: trendSeries(branchFacts, now) };
    },

    quarantineList(repo, now) {
      const scoped = new Map(
        service
          .listScope({ repo, branch: ALL_BRANCHES, window: "30d" }, now)
          .map((item) => [item.id, item]),
      );
      const manualIds = new Set(listManualIds(db, repo));
      const identities = testCasesById(repo);
      const items: QuarantineListItem[] = [];
      for (const [id, identity] of identities) {
        const item = scoped.get(id);
        // Broken is never listed, even when manually quarantined (decision PQ-09).
        if (item?.status === "broken") continue;
        if (item?.status !== "quarantined" && !manualIds.has(id)) continue;
        items.push({
          id,
          file: identity.file,
          classname: identity.classname,
          name: identity.name,
          quarantineSource: item ? item.quarantineSource : "manual",
        });
      }
      return items.sort(
        (a, b) =>
          compareCodePoints(a.name, b.name) || compareCodePoints(a.file, b.file) || a.id - b.id,
      );
    },

    repos() {
      return loadRepos(db);
    },
  };
  return service;
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

/** ISO 8601 UTC to the second (REQ-API-01, decision D-17). */
function toIso(ms: number | null): string | null {
  return ms === null ? null : toApiTimestamp(new Date(ms));
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
