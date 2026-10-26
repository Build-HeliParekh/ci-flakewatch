// Detail and history fixtures shaped like the ShopLite scenario (SPEC §12).
import type {
  HistoryCommit,
  HistoryQuery,
  HistoryResponse,
  TestDetailResponse,
  TestScope,
} from "@flakewatch/shared";

const scope = (window: "7d" | "30d", branch: string, extra: Partial<TestScope>): TestScope => ({
  window,
  branch,
  status: "stable",
  quarantineSource: null,
  commitsRun: 0,
  flakyCommits: 0,
  flakeRate: 0,
  failedAttempts: 0,
  unconfirmedFailures: 0,
  skippedResults: 0,
  lastSeenAt: "2026-10-23T17:42:00Z",
  ...extra,
});

/** orders > exports csv: quarantined over 30 days, stable over 7, never on feature branches. */
export function ordersDetail(): TestDetailResponse {
  return {
    id: 18,
    repo: "demo/shoplite",
    file: "tests/orders.test.ts",
    classname: "orders",
    name: "orders > exports csv",
    manualQuarantine: null,
    scopes: [
      scope("7d", "*", { commitsRun: 44 }),
      scope("7d", "main", { commitsRun: 23 }),
      scope("30d", "*", {
        status: "quarantined",
        quarantineSource: "auto",
        commitsRun: 192,
        flakyCommits: 37,
        flakeRate: 37 / 192,
        failedAttempts: 37,
      }),
      scope("30d", "main", {
        status: "quarantined",
        quarantineSource: "auto",
        commitsRun: 105,
        flakyCommits: 20,
        flakeRate: 20 / 105,
        failedAttempts: 20,
      }),
    ],
    recentErrors: Array.from({ length: 5 }, (_, i) => ({
      commitSha: `${i}`.repeat(40),
      branch: "main",
      attempt: 1,
      startedAt: `2026-10-1${3 - Math.min(i, 3)}T1${i}:00:00Z`,
      message:
        i === 0 ? 'TimeoutError: Waiting for selector ".order-row" exceeded 5000ms' : `Error ${i}`,
    })),
  };
}

/** checkout > validates address: stable, with one failure that was never re-run. */
export function stableDetail(): TestDetailResponse {
  return {
    id: 23,
    repo: "demo/shoplite",
    file: "tests/checkout.test.ts",
    classname: "checkout",
    name: "checkout > validates address",
    manualQuarantine: null,
    scopes: [
      scope("7d", "*", { commitsRun: 44, unconfirmedFailures: 1, failedAttempts: 1 }),
      scope("7d", "feature/x", { status: null, commitsRun: 0 }),
      scope("30d", "*", { commitsRun: 192, unconfirmedFailures: 1, failedAttempts: 1 }),
      scope("30d", "feature/x", { commitsRun: 3 }),
    ],
    recentErrors: [],
  };
}

const commit = (
  sha: string,
  outcome: HistoryCommit["outcome"],
  rerun: boolean,
  at: string,
): HistoryCommit => ({
  commitSha: sha.repeat(40).slice(0, 40),
  branches: ["main"],
  firstStartedAt: at,
  outcome,
  rerun,
  attempts: [],
});

/** History: the orders trend is 0 for the last four days (SPEC REQ-UI-07). */
export function fakeHistory(_id: number, query: HistoryQuery): HistoryResponse {
  const trend = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 8, 24 + i)).toISOString().slice(0, 10);
    return { date, flakeRate: i >= 26 ? 0 : i === 10 ? null : 0.3 };
  });
  const commits =
    query.window === "7d"
      ? [commit("a", "passed", false, "2026-10-23T10:00:00Z")]
      : [
          commit("a", "passed", false, "2026-10-23T10:00:00Z"),
          commit("b", "flaky", true, "2026-10-12T10:00:00Z"),
          commit("c", "failed", false, "2026-10-11T10:00:00Z"),
          commit("d", "failed", true, "2026-10-10T10:00:00Z"),
        ];
  return { commits, trend };
}
