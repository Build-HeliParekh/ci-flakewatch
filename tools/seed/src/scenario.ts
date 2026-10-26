// The ShopLite scenario (REQ-SEED-03, SEED-04, SEED-05). Pure and deterministic: the same
// options always give the same attempts (REQ-SEED-01).
import { catalog, PLANTED, type CatalogEntry } from "./catalog.js";
import { createRng, roundHalfUp, type Rng } from "./rng.js";

export interface SeedOptions {
  seed: number;
  days: number;
  /** A UTC midnight; every attempt starts before it. */
  end: Date;
}

export const DEFAULT_OPTIONS: SeedOptions = {
  seed: 42,
  days: 60,
  end: new Date(Date.UTC(2026, 9, 24)),
};

export const REPO = "demo/shoplite";
export const FEATURE_BRANCHES = [
  "feature/avatar-v2",
  "feature/new-checkout",
  "fix/search-performance",
] as const;

export type ResultStatus = "passed" | "failed" | "skipped";

export interface GeneratedCase {
  module: string;
  file: string;
  classname: string;
  name: string;
  status: ResultStatus;
  durationMs: number;
  message: string | null;
}

export interface GeneratedAttempt {
  repo: string;
  branch: string;
  commitSha: string;
  runId: string;
  attempt: number;
  startedAt: Date;
  cases: GeneratedCase[];
}

export type Segment = "S1" | "S2" | "S3";

export interface GeneratedCommit {
  index: number;
  sha: string;
  runId: string;
  branch: string;
  /** attempt 1's start */
  startedAt: Date;
  /** How many days before `end` its date is: 1 for the last day. */
  daysBeforeEnd: number;
  segment: Segment;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const FEATURE_SHARE = 0.15;

/** A planted flaky test case: proportion `p` of its eligible commits in each segment. */
interface FlakyPlant {
  name: string;
  p: number;
  eligible(commit: GeneratedCommit, options: SeedOptions): boolean;
  messages: readonly string[];
}

const startOfDayBefore = (options: SeedOptions, days: number) =>
  options.end.getTime() - days * DAY_MS;

const FLAKY: readonly FlakyPlant[] = [
  {
    name: PLANTED.sso,
    p: 0.4,
    eligible: () => true,
    messages: [
      'TimeoutError: Waiting for navigation to "/account" exceeded 5000ms',
      "AssertionError: expected url to contain /account but got /login?sso=pending",
    ],
  },
  {
    name: PLANTED.cartTotal,
    p: 0.15,
    eligible: () => true,
    messages: ["AssertionError: expected total 59.97 but got 39.98 (stale price cache)"],
  },
  {
    name: PLANTED.paginate,
    p: 0.05,
    eligible: () => true,
    messages: ['TimeoutError: Waiting for selector ".results-page-2" exceeded 5000ms'],
  },
  {
    name: PLANTED.avatar,
    p: 0.3,
    eligible: (commit) => commit.branch === "feature/avatar-v2",
    messages: ["Error: upload to storage failed: socket hang up (ECONNRESET)"],
  },
  {
    name: PLANTED.csv,
    p: 0.3,
    // "Until day −10": attempt 1 starts before 00:00 on that date.
    eligible: (commit, options) => commit.startedAt.getTime() < startOfDayBefore(options, 10),
    messages: [
      'TimeoutError: Waiting for selector ".order-row" exceeded 5000ms',
      "Error: ENOENT: no such file or directory, open '/tmp/exports/orders.csv'",
    ],
  },
];

const BROKEN_MESSAGE =
  "AssertionError: expected refund status 'partially_refunded' but got 'failed'";

/** The commits: 8 per weekday and 2 per weekend day, 08:00–20:00 UTC, with branches. */
export function generateCommits(options: SeedOptions, rng: Rng): GeneratedCommit[] {
  const commits: GeneratedCommit[] = [];
  for (let daysBeforeEnd = options.days; daysBeforeEnd >= 1; daysBeforeEnd--) {
    const dayStart = startOfDayBefore(options, daysBeforeEnd);
    const weekday = new Date(dayStart).getUTCDay();
    const count = weekday === 0 || weekday === 6 ? 2 : 8;
    const times = Array.from(
      { length: count },
      () => dayStart + 8 * HOUR_MS + rng.int(0, 12 * 3600 - 1) * 1000,
    ).sort((a, b) => a - b);
    for (const time of times) {
      commits.push({
        index: commits.length + 1,
        sha: rng.hex(40),
        runId: `shoplite-${commits.length + 1}`,
        branch: "main",
        startedAt: new Date(time),
        daysBeforeEnd,
        segment: daysBeforeEnd <= 7 ? "S1" : daysBeforeEnd <= 30 ? "S2" : "S3",
      });
    }
  }

  // Exactly round(0.15 × n) commits per feature branch in each segment, chosen at random.
  for (const segment of ["S1", "S2", "S3"] as const) {
    const inSegment = rng.shuffle(commits.filter((commit) => commit.segment === segment));
    const share = roundHalfUp(FEATURE_SHARE * inSegment.length);
    FEATURE_BRANCHES.forEach((branch, b) => {
      for (const commit of inSegment.slice(b * share, (b + 1) * share)) commit.branch = branch;
    });
  }
  return commits;
}

/** For each planted flaky test, the commit indexes on which it fails attempt 1 (REQ-SEED-04). */
export function plantFlakiness(
  commits: readonly GeneratedCommit[],
  options: SeedOptions,
  rng: Rng,
): Map<string, Set<number>> {
  const picked = new Map<string, Set<number>>();
  for (const plant of FLAKY) {
    const chosen = new Set<number>();
    for (const segment of ["S1", "S2", "S3"] as const) {
      const eligible = commits.filter(
        (commit) => commit.segment === segment && plant.eligible(commit, options),
      );
      const count = roundHalfUp(plant.p * eligible.length);
      for (const commit of rng.shuffle(eligible).slice(0, count)) chosen.add(commit.index);
    }
    picked.set(plant.name, chosen);
  }
  return picked;
}

/** Every attempt in upload order: by startedAt, then runId, then attempt (REQ-SEED-02). */
export function generateScenario(options: SeedOptions = DEFAULT_OPTIONS): GeneratedAttempt[] {
  const rng = createRng(options.seed);
  const entries = catalog();
  const baseDurations = new Map(entries.map((entry) => [entry.name, rng.int(50, 3000)]));
  const commits = generateCommits(options, rng);
  const flaky = plantFlakiness(commits, options, rng);
  const messageOf = new Map(FLAKY.map((plant) => [plant.name, plant.messages]));
  const brokenFrom = startOfDayBefore(options, 15);
  const renamedFrom = startOfDayBefore(options, 20);

  const attempts: GeneratedAttempt[] = [];
  for (const commit of commits) {
    const broken = commit.startedAt.getTime() >= brokenFrom;
    const renamed = commit.startedAt.getTime() >= renamedFrom;
    const nameOf = (entry: CatalogEntry) =>
      entry.name === PLANTED.stock && renamed ? PLANTED.stockRenamed : entry.name;

    const run = (attempt: number, startedAt: Date): GeneratedAttempt => ({
      repo: REPO,
      branch: commit.branch,
      commitSha: commit.sha,
      runId: commit.runId,
      attempt,
      startedAt,
      cases: entries.map((entry): GeneratedCase => {
        let message: string | null = null;
        if (entry.name === PLANTED.refund && broken) message = BROKEN_MESSAGE;
        else if (attempt === 1 && flaky.get(entry.name)?.has(commit.index)) {
          const options = messageOf.get(entry.name) ?? ["Error: failed"];
          message = options[rng.int(0, options.length - 1)] ?? "Error: failed";
        }
        const base = baseDurations.get(entry.name) ?? 100;
        return {
          module: entry.module,
          file: entry.file,
          classname: entry.classname,
          name: nameOf(entry),
          status: message === null ? "passed" : "failed",
          durationMs: Math.max(1, roundHalfUp(base * rng.float(0.8, 1.2))),
          message,
        };
      }),
    });

    const first = run(1, commit.startedAt);
    attempts.push(first);
    // A failed attempt 1 is re-run 5–20 minutes later, with every test case (REQ-SEED-03).
    if (first.cases.some((testCase) => testCase.status === "failed")) {
      const later = new Date(commit.startedAt.getTime() + rng.int(5 * 60, 20 * 60) * 1000);
      attempts.push(run(2, later));
    }
  }

  return attempts.sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() ||
      (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0) ||
      a.attempt - b.attempt,
  );
}
