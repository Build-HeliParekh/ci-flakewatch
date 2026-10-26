// A fake ApiClient with ShopLite-shaped data (SPEC REQ-SEED-05), for dashboard tests. It
// filters, sorts, and pages like the real API (REQ-API-03), and records every call.
import {
  STATUSES,
  type HistoryQuery,
  type HistoryResponse,
  type TestDetailResponse,
  type ReposResponse,
  type Status,
  type SummaryQuery,
  type SummaryResponse,
  type TestListItem,
  type TestsQuery,
  type TestsResponse,
} from "@flakewatch/shared";
import { ApiClientError, type ApiClient } from "../../src/api/client.js";

const AS_OF = "2026-10-24T00:00:00Z";

function item(
  id: number,
  name: string,
  status: Status,
  flakyCommits: number,
  commitsRun: number,
  extra: Partial<TestListItem> = {},
): TestListItem {
  const module = name.split(" > ")[0] ?? "misc";
  return {
    id,
    repo: "demo/shoplite",
    file: `tests/${module}.test.ts`,
    classname: module,
    name,
    status,
    quarantineSource: status === "quarantined" ? "auto" : null,
    flakeRate: commitsRun === 0 ? 0 : flakyCommits / commitsRun,
    flakyCommits,
    commitsRun,
    failedAttempts: flakyCommits,
    unconfirmedFailures: 0,
    skippedResults: 0,
    lastSeenAt: "2026-10-23T17:42:00Z",
    ...extra,
  };
}

/** The planted ShopLite tests plus stable filler, 151 in total for 30d / all branches. */
export function shopliteItems(): TestListItem[] {
  const planted = [
    item(17, "auth > redirects after sso", "quarantined", 77, 192),
    item(18, "orders > exports csv", "quarantined", 37, 192),
    item(19, "cart > updates total", "quarantined", 29, 192),
    item(20, "profile > uploads avatar", "flaky", 9, 192),
    item(21, "search > paginates results", "flaky", 9, 192),
    item(22, "payments > refunds partial", "broken", 0, 192, {
      failedAttempts: 192,
      unconfirmedFailures: 96,
    }),
    item(23, "checkout > validates address", "stable", 0, 192, {
      failedAttempts: 1,
      unconfirmedFailures: 1,
    }),
  ];
  const modules = [
    "auth",
    "catalog",
    "search",
    "cart",
    "checkout",
    "payments",
    "orders",
    "profile",
  ];
  const filler = Array.from({ length: 151 - planted.length }, (_, i) =>
    item(
      100 + i,
      `${modules[i % modules.length]} > stable behavior ${String(i + 1).padStart(3, "0")}`,
      "stable",
      0,
      192,
    ),
  );
  return [...planted, ...filler];
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface FakeClient extends ApiClient {
  calls: { method: string; args: unknown }[];
  /** Calls of one method, e.g. `callsOf("tests")`. */
  callsOf(method: string): unknown[];
  /** Make the next calls fail like an unreachable API (status null) until cleared. */
  failing: boolean;
  /** Hold every response until `resume()` is called (for loading states). */
  hold: boolean;
  resume(): void;
}

export interface FakeOptions {
  repos?: ReposResponse;
  items?: TestListItem[];
  /** Detail responses by id; quarantine and release update them. */
  details?: Record<number, TestDetailResponse>;
  /** History by id and scope. */
  history?: (id: number, query: HistoryQuery) => HistoryResponse;
  /** When set, quarantine and release need this token (REQ-ING-10). */
  requireToken?: string;
}

export function createFakeClient(options: FakeOptions = {}): FakeClient {
  const repos: ReposResponse = options.repos ?? {
    items: [
      {
        name: "demo/shoplite",
        branches: ["feature/avatar-v2", "feature/new-checkout", "fix/search-performance", "main"],
      },
      { name: "zeta/other", branches: ["develop", "main"] },
    ],
  };
  const all = options.items ?? shopliteItems();
  const waiting: (() => void)[] = [];

  const fake: FakeClient = {
    calls: [],
    callsOf: (method) =>
      fake.calls.filter((call) => call.method === method).map((call) => call.args),
    failing: false,
    hold: false,
    resume() {
      fake.hold = false;
      waiting.splice(0).forEach((resume) => resume());
    },

    repos: () => respond("repos", undefined, () => repos),

    summary: (query: SummaryQuery) =>
      respond("summary", query, (): SummaryResponse => {
        const scoped = all.filter((test) => !query.repo || test.repo === query.repo);
        const count = (status: Status) => scoped.filter((test) => test.status === status).length;
        return {
          asOf: AS_OF,
          broken: count("broken"),
          quarantined: count("quarantined"),
          flaky: count("flaky"),
          stable: count("stable"),
          failedAttemptsFromFlakes: scoped
            .filter((test) => test.status === "flaky" || test.status === "quarantined")
            .reduce((sum, test) => sum + test.failedAttempts, 0),
        };
      }),

    tests: (query: TestsQuery) =>
      respond("tests", query, (): TestsResponse => {
        const q = query.q?.toLowerCase();
        const sort = query.sort ?? "flakeRate";
        const order = query.order ?? (sort === "name" ? "asc" : "desc");
        const direction = order === "asc" ? 1 : -1;
        const filtered = all
          .filter((test) => !query.repo || test.repo === query.repo)
          .filter(
            (test) =>
              !query.status || query.status.length === 0 || query.status.includes(test.status),
          )
          .filter(
            (test) =>
              !q || test.name.toLowerCase().includes(q) || test.file.toLowerCase().includes(q),
          )
          .sort((a, b) => {
            const primary = sort === "name" ? compare(a.name, b.name) : a[sort] - b[sort] || 0;
            if (primary !== 0) return primary * direction;
            if (sort === "flakeRate")
              return b.failedAttempts - a.failedAttempts || compare(a.name, b.name) || a.id - b.id;
            if (sort === "failedAttempts")
              return b.flakeRate - a.flakeRate || compare(a.name, b.name) || a.id - b.id;
            return compare(a.file, b.file) || a.id - b.id;
          });
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 25;
        return {
          items: filtered.slice((page - 1) * pageSize, page * pageSize),
          page,
          pageSize,
          total: filtered.length,
          asOf: AS_OF,
        };
      }),

    test: (id) =>
      respond("test", id, () => {
        const detail = options.details?.[id];
        if (!detail) return Promise.reject(new ApiClientError(404, "NOT_FOUND", `No test ${id}`));
        return structuredClone(detail);
      }),
    history: (id, query) =>
      respond("history", { id, ...query }, () => {
        if (!options.history)
          return Promise.reject(new ApiClientError(404, "NOT_FOUND", "No history"));
        return options.history(id, query);
      }),
    quarantine: (id, body, token) =>
      respond("quarantine", { id, ...body, token }, () => {
        checkToken(token);
        const detail = options.details?.[id];
        const manualQuarantine = { reason: body.reason, at: AS_OF };
        if (detail) {
          detail.manualQuarantine = manualQuarantine;
          for (const scope of detail.scopes) {
            if (scope.status === null) continue;
            if (scope.status !== "broken") scope.status = "quarantined";
            scope.quarantineSource = scope.quarantineSource === "auto" ? "both" : "manual";
          }
        }
        return { manualQuarantine };
      }),
    release: (id, token) =>
      respond("release", { id, token }, () => {
        checkToken(token);
        const detail = options.details?.[id];
        if (detail) {
          detail.manualQuarantine = null;
          for (const scope of detail.scopes) {
            if (scope.status === "quarantined" && scope.quarantineSource === "manual")
              scope.status = scope.flakyCommits > 0 ? "flaky" : "stable";
            scope.quarantineSource = scope.quarantineSource === "both" ? "auto" : null;
          }
        }
        return undefined;
      }),
  };

  function checkToken(token: string | undefined) {
    if (options.requireToken !== undefined && token !== options.requireToken) {
      throw new ApiClientError(401, "UNAUTHORIZED", "A valid write token is required");
    }
  }

  async function respond<T>(
    method: string,
    args: unknown,
    produce: () => T | Promise<T>,
  ): Promise<T> {
    fake.calls.push({ method, args });
    if (fake.hold) await new Promise<void>((resume) => waiting.push(resume));
    if (fake.failing) throw new ApiClientError(null, null, "The flakewatch API can't be reached.");
    return produce();
  }

  return fake;
}

export { STATUSES };
