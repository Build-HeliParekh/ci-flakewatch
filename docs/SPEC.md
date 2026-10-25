# flakewatch: Specification

| | |
|---|---|
| **Spec version** | 0.1 (draft) |
| **Status** | In review |
| **Owner** | Heli Parekh |
| **Last updated** | 2026-10-25 |

This document is the **source of truth** for flakewatch's behavior. Code, tests, and the README follow it. When they disagree with it, they are wrong, or this spec needs a change (see [§14 Change process](#14-change-process)).

---

## Contents

1. [Overview](#1-overview)
2. [Conventions](#2-conventions)
3. [Glossary](#3-glossary)
4. [Ingestion (ING)](#4-ingestion-ing)
5. [Detection (DET)](#5-detection-det)
6. [Statistics (STA)](#6-statistics-sta)
7. [Statuses (CLS)](#7-statuses-cls)
8. [Quarantine (QUA)](#8-quarantine-qua)
9. [API (API)](#9-api-api)
10. [Dashboard (UI)](#10-dashboard-ui)
11. [Retention (RET)](#11-retention-ret)
12. [Synthetic data (SEED)](#12-synthetic-data-seed)
13. [Non-functional (NFR)](#13-non-functional-nfr)
14. [Change process](#14-change-process)
15. [Open questions](#15-open-questions)
16. [Changelog](#16-changelog)

---

## 1. Overview

### 1.1 Problem

Flaky tests pass and fail on the same code. Teams re-run failing pipelines until they go green, so the failures are never recorded, time and CI minutes are wasted, and trust in CI erodes. CI tools show single runs, not a test's history, so nobody can see which tests are flaky or how much they cost.

### 1.2 Goal

Make flakiness visible and measurable: ingest test results from CI, detect flaky tests with one precise rule, rank them, and show them in a dashboard.

### 1.3 Success measure

> A developer opens the dashboard and, **within 30 seconds**, can name the five flakiest tests in their repo and how many failed runs each one caused in the last 30 days.

### 1.4 In scope (v1)

- JUnit XML ingestion through a REST API
- Flake detection, statistics, statuses, and quarantine flags
- A dashboard with ranking, filters, and a per-test detail view
- Retention cleanup
- A deterministic synthetic data generator (the **ShopLite** scenario)

### 1.5 Out of scope (v1)

- User accounts, login, and per-user permissions (one optional shared upload token only)
- Report formats other than JUnit XML (TRX, xUnit, NUnit, and CTRF are planned as later spec changes)
- Skipping or re-running tests in CI (flakewatch only *reports* quarantine; CI decides what to do with it)
- Real-time push updates (the dashboard reads on load and on filter change)
- Multi-tenant hosting

---

## 2. Conventions

- **Requirement IDs** have the form `REQ-<AREA>-<NN>`, for example `REQ-DET-01`. IDs are never reused or renumbered. A removed requirement is marked **Withdrawn** and keeps its ID.
- **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are used as in RFC 2119.
- **Acceptance criteria** are written as *Given / When / Then*. Each requirement has at least one, and each acceptance criterion is covered by at least one automated test.
- **Test naming:** every automated test that covers a requirement starts its name with the ID, for example `it("REQ-DET-01: marks fail-then-pass on the same commit as flaky")`. One test may cover several IDs.
- **Configuration values** are written in `UPPER_CASE` and defined in [§13.2](#132-configuration).

---

## 3. Glossary

| Term | Definition |
|---|---|
| **Repo** | A source repository, identified by `owner/name`, e.g. `demo/shoplite`. |
| **Branch** | The branch name a run was executed for, as sent in the upload. |
| **Commit** | A specific version of the code, identified by `(repo, commitSha)`. |
| **Run** | One CI pipeline execution, identified by `(repo, runId)`. |
| **Attempt** | One execution of a run. The first attempt is `1`, and each re-run adds 1. Identified by `(repo, runId, attempt)`. |
| **Upload** | One JUnit XML report plus metadata for one attempt. |
| **Test case** | A distinct test, identified by `(repo, file, classname, name)`. |
| **Result** | One outcome of one test case in one upload: `passed`, `failed`, or `skipped`. |
| **Decisive result** | A `passed` or `failed` result. `skipped` results are not decisive. |
| **Flaky commit** | A commit on which a test case has at least one `failed` and at least one `passed` result ([REQ-DET-01](#req-det-01)). |
| **Window** | A time range for statistics: `7d` or `30d` ([REQ-STA-01](#req-sta-01)). |
| **As-of time (`now`)** | The reference time windows are measured back from. The system clock by default, overridable for tests ([REQ-NFR-04](#req-nfr-04)). |
| **Scope** | A `(window, branch)` pair that statistics are computed for. `branch` is a specific branch or `*` (all branches). |

---

## 4. Ingestion (ING)

#### REQ-ING-01
**Upload endpoint.** The system MUST accept an upload at `POST /api/v1/results` as `multipart/form-data` with:

| Field | Type | Rules |
|---|---|---|
| `report` | file | JUnit XML, required |
| `repo` | string | Required. Matches `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$` |
| `branch` | string | Required. 1–255 characters |
| `commitSha` | string | Required. 7–40 hexadecimal characters, stored lower-case |
| `runId` | string | Required. 1–100 characters |
| `attempt` | integer | Required. ≥ 1 |
| `startedAt` | string | Required. ISO 8601 date-time with time zone, stored as UTC |

*Acceptance:*
- Given a valid report and valid metadata, when it is uploaded, then the response is `201` and the results are stored.
- Given any required field is missing or invalid, when it is uploaded, then the response is `400` with error code `VALIDATION_ERROR` and a message naming the field, and nothing is stored.

#### REQ-ING-02
**Result mapping.** Each `<testcase>` element in the report MUST become one result:

| `<testcase>` contains | Result status |
|---|---|
| `<failure>` or `<error>` | `failed` |
| `<skipped>` | `skipped` |
| none of the above | `passed` |

If a `<testcase>` contains both `<skipped>` and `<failure>`/`<error>`, it is `failed`.

*Acceptance:*
- Given a report with one passing, one `<failure>`, one `<error>`, and one `<skipped>` test case, when it is uploaded, then the stored statuses are `passed`, `failed`, `failed`, and `skipped`.

#### REQ-ING-03
**Report structure.** The system MUST accept both a `<testsuites>` root containing `<testsuite>` elements and a single `<testsuite>` root. Nested `<testsuite>` elements MUST be traversed.

*Acceptance:*
- Given the same test cases in a `<testsuites>` report and in a single `<testsuite>` report, when each is uploaded to a separate empty database, then the stored results are identical.

#### REQ-ING-04
**Test case identity.** A test case MUST be identified by `(repo, file, classname, name)` taken from the `<testcase>` attributes. A missing `file` or `classname` is stored as an empty string. A `<testcase>` without a `name` MUST cause the whole upload to be rejected with `422`.

*Acceptance:*
- Given two uploads that contain a test case with the same repo, file, classname, and name, when both are stored, then they refer to the same test case.
- Given two test cases that differ only in `name`, when stored, then they are different test cases.

#### REQ-ING-05
**Recorded details.** For each result the system MUST store the duration in milliseconds (from the `time` attribute in seconds, rounded to the nearest millisecond, `0` if missing) and, for failed results, the `message` attribute of `<failure>`/`<error>`, or its text if there is no `message`, truncated to 2,000 characters.

*Acceptance:*
- Given `time="2.3456"` and `<failure message="Timeout after 5000ms">`, when stored, then the duration is `2346` and the error message is `Timeout after 5000ms`.

#### REQ-ING-06
**Repeated test cases in one report.** If the same test case appears more than once in a single report (for example, a framework's in-run retry), each occurrence MUST be stored as a separate result for that attempt.

*Acceptance:*
- Given a report in which `cart > updates total` appears twice, first with `<failure>` and then passing, when stored, then that attempt has two results for the test case, `failed` and `passed`.

#### REQ-ING-07
**Idempotent re-upload.** An upload with the same `(repo, runId, attempt)` as an existing one MUST replace that attempt's metadata and results entirely, and never add to them.

*Acceptance:*
- Given an attempt was uploaded with 150 results, when the same `(repo, runId, attempt)` is uploaded again with 150 results, then the attempt has 150 results, not 300, and the response is `200` instead of `201`.

#### REQ-ING-08
**Invalid reports.** A report that is not well-formed XML, or has no `<testsuite>`/`<testsuites>` root, MUST be rejected with `422` and error code `INVALID_REPORT`. Nothing from the upload is stored.

*Acceptance:*
- Given a truncated XML file, when it is uploaded, then the response is `422` with `INVALID_REPORT` and the database is unchanged.

#### REQ-ING-09
**Size limit.** Reports larger than `MAX_UPLOAD_MB` MUST be rejected with `413` and error code `PAYLOAD_TOO_LARGE`.

*Acceptance:*
- Given `MAX_UPLOAD_MB=1` and a 1.5 MB report, when it is uploaded, then the response is `413`.

#### REQ-ING-10
**Upload token.** If `UPLOAD_TOKEN` is set, uploads MUST include `Authorization: Bearer <UPLOAD_TOKEN>`, or they are rejected with `401` and error code `UNAUTHORIZED`. If it is not set, no header is required. Read endpoints never require the token.

*Acceptance:*
- Given `UPLOAD_TOKEN=abc`, when an upload has no header or a wrong token, then the response is `401`; when it sends `Bearer abc`, then it is accepted.

#### REQ-ING-11
**Atomic upload.** An upload MUST be stored all-or-nothing. When the response is `2xx`, the statistics already reflect the upload ([REQ-STA-06](#req-sta-06)).

*Acceptance:*
- Given an upload whose second test case fails to store, when it is processed, then no results from that upload are stored and the response is `500`.

#### REQ-ING-12
**Upload summary.** A successful upload MUST return:

```json
{ "attemptId": 42, "tests": 150, "passed": 146, "failed": 3, "skipped": 1, "newFlakyCommits": 1 }
```

`tests` counts results (including repeated test cases), and `newFlakyCommits` counts test cases for which this upload turned the commit into a flaky commit for the first time.

*Acceptance:*
- Given attempt 1 of commit `b2` has `cart > updates total` failed, when attempt 2 is uploaded with it passing, then attempt 2's summary has `newFlakyCommits: 1`; when attempt 2 is uploaded again unchanged, then `newFlakyCommits: 0`.

---

## 5. Detection (DET)

#### REQ-DET-01
**The flake rule.** A test case is **flaky on a commit** when, among its results for that `(repo, commitSha)` within the scope being computed, there is at least one `failed` result and at least one `passed` result. The order of the results does not matter.

*Acceptance:*
- Given attempt 1 `failed` and attempt 2 `passed` on commit `b2`, then `b2` is a flaky commit for that test case.
- Given attempt 1 `passed` and attempt 2 `failed`, then `b2` is a flaky commit.
- Given attempts 1 and 2 both `failed`, then `b2` is **not** a flaky commit.
- Given a single attempt with a `failed` and a `passed` result for the same test case ([REQ-ING-06](#req-ing-06)), then the commit is a flaky commit.

#### REQ-DET-02
**Skipped results are ignored.** `skipped` results MUST NOT count toward or against flakiness.

*Acceptance:*
- Given results `skipped`, `failed`, `failed` on one commit, then it is not a flaky commit.
- Given results `skipped`, `failed`, `passed`, then it is a flaky commit.

#### REQ-DET-03
**Across runs.** Results from different runs and attempts on the same commit MUST be combined for detection.

*Acceptance:*
- Given run `100` attempt 1 `failed` and a different run `200` attempt 1 `passed`, both for commit `b2`, then `b2` is a flaky commit.

#### REQ-DET-04
**Branch scope.** For a specific-branch scope, only results from runs uploaded with that branch MUST be considered. For the `*` scope, all branches are combined, and the same `commitSha` on different branches counts as **one** commit.

*Acceptance:*
- Given commit `c9` with `failed` on `feature/x` and `passed` on `main`, then `c9` is flaky in the `*` scope and not flaky in the `main` or `feature/x` scopes.

#### REQ-DET-05
**Renames.** A renamed test is a new test case ([REQ-ING-04](#req-ing-04)). The system MUST NOT attempt to link renamed test cases in v1.

*Acceptance:*
- Given `catalog > syncs stock` stops appearing and `catalog > syncs stock levels` starts appearing, then they are two test cases with separate statistics.

---

## 6. Statistics (STA)

#### REQ-STA-01
**Windows.** Statistics MUST be available for two rolling windows measured back from the as-of time: `7d` = `(now − 7×24h, now]` and `30d` = `(now − 30×24h, now]`. A result is in a window if its attempt's `startedAt` is in that range.

*Acceptance:*
- Given `now = 2026-10-24T00:00:00Z`, an attempt started at `2026-10-17T00:00:01Z` is in `7d`, and one started at `2026-10-17T00:00:00Z` is not.

#### REQ-STA-02
**Metrics.** For each test case and each scope, the system MUST compute:

| Metric | Definition |
|---|---|
| `commitsRun` | Distinct commits in the scope with at least one decisive result for the test case |
| `flakyCommits` | Commits counted in `commitsRun` that are flaky commits ([REQ-DET-01](#req-det-01)) |
| `flakeRate` | `flakyCommits / commitsRun`, or `0` when `commitsRun = 0`. Stored unrounded |
| `failedRuns` | Distinct attempts in the scope with at least one `failed` result for the test case |
| `skippedResults` | Number of `skipped` results in the scope |
| `lastSeenAt` | Latest `startedAt` of any attempt with a result for the test case, in any window |

*Acceptance:*
- Given five commits in the window where `b2` and `d4` are flaky and the others passed, then `commitsRun = 5`, `flakyCommits = 2`, and `flakeRate = 0.4`.
- Given commit `b2` was attempted five times as `failed, failed, failed, failed, passed`, then it contributes `1` to `flakyCommits` and `4` to `failedRuns`.

#### REQ-STA-03
**Scopes.** Statistics MUST be computed for every combination of window (`7d`, `30d`) and branch (each branch the test case has results on, plus `*`).

*Acceptance:*
- Given a test case with results on `main` and `feature/avatar-v2`, then six scopes exist: `{7d, 30d} × {main, feature/avatar-v2, *}`.

#### REQ-STA-04
**Rounding for display.** The API MUST return `flakeRate` as a number from 0 to 1 with at least four decimal places of precision. The dashboard MUST display it as a percentage with one decimal place (e.g. `40.0%`).

*Acceptance:*
- Given `flakyCommits = 1` and `commitsRun = 3`, then the API returns `0.3333` or more precise, and the dashboard shows `33.3%`.

#### REQ-STA-05
**Trend series.** For a test case and branch, the system MUST provide a daily trend for the last 30 days: one point per UTC day, where each point is the flake rate over the 7 days ending at the end of that day. Days with `commitsRun = 0` have a `null` rate.

*Acceptance:*
- Given the ShopLite scenario, then the trend for `orders > exports csv` is about 0.30 at day −20 and 0.0 at day −1 ([REQ-SEED-05](#req-seed-05)).

#### REQ-STA-06
**Freshness.** Statistics for every test case affected by an upload MUST be recomputed before the upload responds. Statistics MUST also be recomputed at least once every hour, so windows move forward as time passes, even without uploads.

*Acceptance:*
- Given an upload responds `201`, when `GET /api/v1/tests` is called immediately afterwards, then the results of that upload are reflected.

---

## 7. Statuses (CLS)

Each test case has one **status** per scope. They are evaluated **in this order**, and the first match wins:

| Order | Status | Rule |
|---|---|---|
| 1 | `broken` | [REQ-CLS-01](#req-cls-01) |
| 2 | `quarantined` | [REQ-CLS-02](#req-cls-02) |
| 3 | `flaky` | [REQ-CLS-03](#req-cls-03) |
| 4 | `stable` | [REQ-CLS-04](#req-cls-04) |

#### REQ-CLS-01
**Broken.** A test case is `broken` in a scope when, among the commits in that scope with decisive results for it, ordered by each commit's earliest `startedAt`, the most recent `BROKEN_MIN_COMMITS` commits all have only `failed` decisive results. It takes precedence over every other status, so a real regression is never shown as merely flaky or quarantined.

*Acceptance:*
- Given `BROKEN_MIN_COMMITS = 3` and the last three commits show `❌❌`, `❌❌`, `❌`, then the status is `broken`.
- Given the last three commits show `❌❌`, `❌✅`, `❌❌`, then the status is **not** `broken`.
- Given only two commits in the scope, both all-failing, then the status is **not** `broken`.
- Given a test case that is `broken` and also manually quarantined, then its status is `broken` and `manualQuarantine` is still reported ([REQ-QUA-03](#req-qua-03)).

#### REQ-CLS-02
**Quarantined.** A test case that is not `broken` is `quarantined` in a scope when either:
- **Automatic:** `flakeRate ≥ QUARANTINE_THRESHOLD` **and** `commitsRun ≥ QUARANTINE_MIN_COMMITS` in that scope, or
- **Manual:** it is manually quarantined ([REQ-QUA-01](#req-qua-01)), which applies to every scope.

*Acceptance:*
- Given threshold `0.10`, minimum `20`, `commitsRun = 25`, and `flakyCommits = 3` (12%), then the status is `quarantined`.
- Given `commitsRun = 10` and `flakyCommits = 5` (50%), then the status is **not** automatically quarantined (not enough data), so it is `flaky`.
- Given exactly 10.0% with `commitsRun = 20`, then the status is `quarantined` (threshold is inclusive).

#### REQ-CLS-03
**Flaky.** A test case that is neither `broken` nor `quarantined` is `flaky` when `flakyCommits ≥ 1`.

*Acceptance:*
- Given `commitsRun = 40` and `flakyCommits = 2` (5%), then the status is `flaky`.

#### REQ-CLS-04
**Stable.** Any other test case with `commitsRun ≥ 1` is `stable`. A `stable` test case MAY have failed results that were not confirmed flaky (for example, one failure with no re-run). These still count in `failedRuns`. See [Q-03](#15-open-questions).

*Acceptance:*
- Given 30 commits all passing, then the status is `stable` with `failedRuns = 0`.
- Given 30 commits where one has a single `failed` attempt and no re-run, then the status is `stable` with `failedRuns = 1`.

#### REQ-CLS-05
**No data.** A test case with `commitsRun = 0` in a scope has no status in that scope and MUST NOT appear in that scope's ranked list ([REQ-API-03](#req-api-03)).

*Acceptance:*
- Given a test case whose last result was 12 days ago, then it appears in the `30d` list and not in the `7d` list.
- Given a test case that only ever has `skipped` results, then it appears in neither list.

---

## 8. Quarantine (QUA)

#### REQ-QUA-01
**Manual quarantine.** `POST /api/v1/tests/:id/quarantine` with body `{ "reason": string }` (1–500 characters, required) MUST mark the test case as manually quarantined and record the reason and the time. Quarantining an already manually quarantined test case MUST update the reason and return `200`.

*Acceptance:*
- Given a `stable` test case, when it is quarantined with reason `"Times out on CI runners"`, then its status in every scope is `quarantined` (unless `broken`) and `GET /tests/:id` returns the reason and time.
- Given an empty reason, then the response is `400` with `VALIDATION_ERROR`.

#### REQ-QUA-02
**Release.** `DELETE /api/v1/tests/:id/quarantine` MUST remove a manual quarantine and return `204`. If the test case is not manually quarantined, it MUST return `409` with error code `NOT_QUARANTINED`. Releasing a manual quarantine does **not** override automatic quarantine. If the numbers still meet [REQ-CLS-02](#req-cls-02), the test case stays `quarantined`.

*Acceptance:*
- Given a test case manually quarantined at 0% flake rate, when it is released, then its status returns to `stable`.
- Given a test case manually quarantined and also at 40% over 30 commits, when it is released, then its status is still `quarantined` and `quarantineSource` is `auto`.

#### REQ-QUA-03
**Reporting the source.** For each scope, the API MUST report `quarantineSource` as `auto`, `manual`, `both`, or `null`, and separately `manualQuarantine: { reason, at } | null`.

*Acceptance:*
- Given a manually quarantined test case that also meets the automatic rule, then `quarantineSource = "both"`.

#### REQ-QUA-04
**Automatic release.** Automatic quarantine MUST be lifted as soon as the numbers no longer meet [REQ-CLS-02](#req-cls-02). There is no hysteresis in v1. See [Q-02](#15-open-questions).

*Acceptance:*
- Given a test case at 12% that becomes 9% after new passing commits, then it is no longer automatically quarantined.

#### REQ-QUA-05
**Quarantine list for CI.** The list a CI pipeline should use to decide what not to block on is the set of test cases with status `quarantined` in the **`30d`, `*` scope**, available as `GET /api/v1/tests?window=30d&status=quarantined`.

*Acceptance:*
- Given the ShopLite scenario, then that list contains `auth > redirects after sso`, `cart > updates total`, and `orders > exports csv`, and does not contain `payments > refunds partial`.

---

## 9. API (API)

#### REQ-API-01
**General.** All endpoints are under `/api/v1` and return JSON with `Content-Type: application/json`, except `204` responses. Errors MUST use:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "attempt must be an integer ≥ 1" } }
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid parameters or body |
| `UNAUTHORIZED` | 401 | Missing or wrong upload token |
| `NOT_FOUND` | 404 | Unknown test case ID or route |
| `NOT_QUARANTINED` | 409 | Release without a manual quarantine |
| `PAYLOAD_TOO_LARGE` | 413 | Report too large |
| `INVALID_REPORT` | 422 | Unparseable or invalid report |
| `INTERNAL_ERROR` | 500 | Anything unexpected; no stack traces in the response |

*Acceptance:*
- Given `GET /api/v1/tests/999999` for an unknown ID, then the response is `404` with `NOT_FOUND` in the format above.

#### REQ-API-02
**List repos.** `GET /api/v1/repos` MUST return every repo with its branches, sorted by name:

```json
{ "items": [ { "name": "demo/shoplite", "branches": ["feature/avatar-v2", "feature/new-checkout", "fix/search-performance", "main"] } ] }
```

*Acceptance:*
- Given the ShopLite scenario, then exactly one repo with four branches is returned, branches sorted alphabetically.

#### REQ-API-03
**Ranked list.** `GET /api/v1/tests` MUST return test cases with their statistics for one scope.

| Parameter | Default | Rules |
|---|---|---|
| `repo` | all repos | Exact repo name |
| `branch` | `*` | A branch name or `*` |
| `window` | `30d` | `7d` or `30d` |
| `status` | all | Comma-separated subset of `broken,quarantined,flaky,stable` |
| `q` | none | Case-insensitive substring match on name or file |
| `sort` | `flakeRate` | `flakeRate`, `failedRuns`, or `name` |
| `order` | `desc` (`asc` for `name`) | `asc` or `desc` |
| `page` | `1` | Integer ≥ 1 |
| `pageSize` | `25` | Integer 1–100 |

Ties MUST be broken by `failedRuns` descending, then `name` ascending, then `id` ascending, so the order is always deterministic. Only test cases with `commitsRun ≥ 1` in the scope are included ([REQ-CLS-05](#req-cls-05)). Unknown `repo` or `branch` values return an empty list, not an error.

Each item:

```json
{
  "id": 17, "repo": "demo/shoplite", "name": "auth > redirects after sso",
  "file": "tests/auth.test.ts", "classname": "auth",
  "status": "quarantined", "quarantineSource": "auto",
  "flakeRate": 0.4123, "flakyCommits": 82, "commitsRun": 199,
  "failedRuns": 82, "skippedResults": 0, "lastSeenAt": "2026-10-23T22:14:00Z"
}
```

The response also includes `page`, `pageSize`, and `total`.

*Acceptance:*
- Given the ShopLite scenario and default parameters, then item 1 is `auth > redirects after sso`.
- Given `window=7d&status=flaky,quarantined`, then every item has one of those two statuses.
- Given `pageSize=101`, then the response is `400`.

#### REQ-API-04
**Summary.** `GET /api/v1/summary` with the same `repo`, `branch`, and `window` parameters MUST return the counts for the overview cards:

```json
{ "flaky": 2, "quarantined": 3, "broken": 1, "stable": 145, "failedRunsFromFlakes": 169 }
```

(Example values for the ShopLite `30d`, `*` scope. There are 151 test cases, because the renamed test counts twice. `failedRunsFromFlakes` varies with the seed.)

`failedRunsFromFlakes` is the sum of `failedRuns` over test cases with status `flaky` or `quarantined`.

*Acceptance:*
- Given the ShopLite scenario, then `quarantined = 3` and `broken = 1` in the `30d`, `*` scope.

#### REQ-API-05
**Test detail.** `GET /api/v1/tests/:id` MUST return the test case's identity, `manualQuarantine`, and its statistics and status for every scope it has ([REQ-STA-03](#req-sta-03)), plus the 5 most recent error messages, each with its `commitSha`, `branch`, and `startedAt`.

*Acceptance:*
- Given `profile > uploads avatar`, then the detail shows status `quarantined` or `flaky` for `feature/avatar-v2` and `stable` for `main`.

#### REQ-API-06
**Test history.** `GET /api/v1/tests/:id/history?branch=&window=` MUST return:
- `commits`: the most recent 100 commits in the scope, newest first, each with `commitSha`, `branch`, `firstStartedAt`, `outcome` (`passed`, `failed`, or `flaky`), and its attempts' results and durations
- `trend`: the series from [REQ-STA-05](#req-sta-05) as `[{ "date": "2026-10-01", "flakeRate": 0.25 | null, "medianDurationMs": 1840 | null }]`

*Acceptance:*
- Given a commit with `failed` then `passed`, then its `outcome` is `flaky`. Given only `failed` results, then it is `failed`.

#### REQ-API-07
**Health.** `GET /api/v1/health` MUST return `200` with `{ "status": "ok" }` when the database is reachable, and `503` otherwise.

*Acceptance:*
- Given the server is running with a valid database, then the response is `200`.

---

## 10. Dashboard (UI)

#### REQ-UI-01
**Overview page.** The home page MUST show overview cards from [REQ-API-04](#req-api-04) (flaky, quarantined, broken, and failed runs from flakes), and below them the ranked table.

*Acceptance:*
- Given the ShopLite scenario, when the dashboard opens, then the cards show the summary counts for `30d`, all branches.

#### REQ-UI-02
**Filter chips.** The page MUST provide:

| Chip group | Selection | Default |
|---|---|---|
| Repo | single | first repo alphabetically |
| Branch | single, options depend on the repo | All branches (`*`) |
| Status | multiple | none selected = all statuses |
| Window | single: `7 days` / `30 days` | `30 days` |

Changing a chip MUST update the cards and the table, and reset the table to page 1.

*Acceptance:*
- Given the dashboard is open, when the `Quarantined` status chip is selected, then only quarantined test cases are listed.
- Given `feature/avatar-v2` is selected, then `profile > uploads avatar` appears with a non-zero flake rate; given `main` is selected, it does not appear as flaky.

#### REQ-UI-03
**Shareable URLs.** All filter, sort, search, and page state MUST be stored in the URL query string. Opening that URL MUST restore the same view.

*Acceptance:*
- Given a filtered view, when its URL is opened in a new tab, then the same chips are selected and the same rows are shown.

#### REQ-UI-04
**Ranked table.** Columns: rank, test name, file, status badge, flake rate, flaky commits / commits run, and failed runs. Flake rate and failed runs are sortable. The default sort matches [REQ-API-03](#req-api-03). Clicking a row opens the detail page.

*Acceptance:*
- Given the ShopLite scenario with default filters, then the first row is `auth > redirects after sso` showing about `40%`.

#### REQ-UI-05
**Search.** A search box MUST filter the table by test name or file (the API `q` parameter), applied 300 ms after typing stops.

*Acceptance:*
- Given the user types `checkout`, then only test cases whose name or file contains `checkout` are listed.

#### REQ-UI-06
**Status badges.** Each status MUST have a badge with its **text label** (`Broken`, `Quarantined`, `Flaky`, `Stable`) and a distinct color. Color MUST NOT be the only signal.

*Acceptance:*
- Given a quarantined test case, then its badge contains the text `Quarantined`.

#### REQ-UI-07
**Test detail page.** The page for one test case MUST show:
- name, file, repo, and the status for the selected scope
- a window and branch selector (defaulting to the overview's current filters)
- a flake-rate trend chart ([REQ-STA-05](#req-sta-05))
- a median duration chart
- a commit strip: one cell per recent commit, colored and labeled passed, failed, or flaky
- the 5 most recent error messages
- quarantine controls: **Quarantine** (asks for a reason) or **Release** (when manually quarantined)
- a back link to the overview that keeps the previous filters

*Acceptance:*
- Given `orders > exports csv`, then the trend chart visibly falls to 0 in the last 10 days.
- Given a stable test case, when the user quarantines it with a reason, then the badge changes to `Quarantined` without a page reload.

#### REQ-UI-08
**Loading, empty, and error states.**
- While loading: a loading indicator, with no layout jump when data arrives.
- No data at all: a message explaining how to upload results or run `npm run seed`.
- No rows match: "No tests match these filters" with a **Clear filters** action.
- API unreachable or `5xx`: an error message with a **Retry** action.

*Acceptance:*
- Given an empty database, then the empty-state message is shown instead of an empty table.
- Given the API is stopped, then the error state with Retry is shown.

#### REQ-UI-09
**Accessibility.** Chips, table rows, and controls MUST be usable with a keyboard alone, and have accessible names. Text contrast MUST meet WCAG 2.1 AA.

*Acceptance:*
- Given keyboard-only use, then the user can select a chip, open a test case, and quarantine it.

#### REQ-UI-10
**Responsive layout.** The overview MUST be usable at widths from 375 px to 1920 px with no horizontal page scroll. The table MAY scroll horizontally inside its own container on narrow screens.

*Acceptance:*
- Given a 375 px viewport, then the page has no horizontal scroll and the chips wrap onto multiple lines.

---

## 11. Retention (RET)

#### REQ-RET-01
**Cleanup.** At least once a day, the system MUST delete attempts, and their results, whose `startedAt` is older than `RETENTION_DAYS` before now. Test cases and manual quarantine records are kept. A run with no remaining attempts is deleted.

*Acceptance:*
- Given `RETENTION_DAYS = 90` and an attempt from 91 days ago, when cleanup runs, then that attempt and its results are deleted, and the test case still exists.

#### REQ-RET-02
**Minimum retention.** `RETENTION_DAYS` MUST be at least `30`, the largest window. A lower value MUST stop the server from starting, with a clear error message.

*Acceptance:*
- Given `RETENTION_DAYS = 10`, when the server starts, then it exits with an error naming `RETENTION_DAYS`.

#### REQ-RET-03
**Manual trigger.** Cleanup MUST also be runnable on demand with `npm run retention`.

*Acceptance:*
- Given old attempts, when `npm run retention` is run, then they are deleted and the number deleted is printed.

---

## 12. Synthetic data (SEED)

The generator lives in `tools/seed` and produces CI history for **ShopLite** (`demo/shoplite`), a fictional online store.

#### REQ-SEED-01
**Determinism.** Given the same `--seed`, `--days`, and `--end` values, the generator MUST produce byte-identical JUnit XML files.

*Acceptance:*
- Given two runs with `--seed 42`, then every output file has the same checksum.

#### REQ-SEED-02
**Options.**

| Option | Default | Meaning |
|---|---|---|
| `--seed` | `42` | Random seed |
| `--days` | `60` | Days of history |
| `--end` | `2026-10-24T00:00:00Z` | Scenario end time; all attempts start before it |
| `--out` | none | Write XML files to this folder instead of uploading |
| `--api` | `http://localhost:4000` | API to upload to |

When uploading, the generator MUST send files through `POST /api/v1/results` in `startedAt` order, and print a summary (attempts uploaded, results, elapsed time).

*Acceptance:*
- Given `--out ./tmp/junit`, then XML files are written and nothing is uploaded.

#### REQ-SEED-03
**Shape of the scenario.** With default options:
- **Modules and test cases:** `auth` 20, `catalog` 25, `search` 15, `cart` 20, `checkout` 25, `payments` 15, `orders` 15, `profile` 15 (150 in total). The file is `tests/<module>.test.ts`, the classname is the module, and the name is `<module> > <behavior>`.
- **Commits:** about 400 over the period, spread across the days, with times between 08:00 and 20:00 UTC on weekdays and a quarter as many on weekends.
- **Branches:** each commit belongs to one branch: `main` about 55%, and `feature/avatar-v2`, `feature/new-checkout`, and `fix/search-performance` about 15% each.
- **Runs:** each commit gets one run. If attempt 1 has any `failed` result, attempt 2 is added 5–20 minutes later, re-running all test cases.
- **Durations:** each test case has a base duration of 50–3,000 ms, with ±20% random variation per result.

*Acceptance:*
- Given default options, then there are 150 test cases across 8 modules, 350–450 commits, and exactly 4 branches.

#### REQ-SEED-04
**How flakiness is planted.** A planted flaky test case has a **per-commit flake probability** `p`. For each commit, with probability `p` the test case fails on attempt 1 (with a realistic error message such as `TimeoutError: Waiting for selector ".order-row" exceeded 5000ms`) and passes on attempt 2. Otherwise it passes on attempt 1, and on attempt 2 if there is one. Its measured flake rate is therefore close to `p`.

*Acceptance:*
- Given a test case planted with `p = 0.40`, then its `30d`, `*` flake rate is between 0.35 and 0.45.

#### REQ-SEED-05
**Planted behaviors and expected results.** In the `30d`, `*` scope unless stated otherwise:

| Test case | Planted behavior | Expected result |
|---|---|---|
| `checkout > applies discount code` | Always passes | `stable`, `flakeRate = 0` |
| `auth > redirects after sso` | `p = 0.40` | `quarantined` (auto), **rank 1**, 0.35–0.45 |
| `cart > updates total` | `p = 0.15` | `quarantined` (auto), 0.11–0.19 |
| `search > paginates results` | `p = 0.05` | `flaky`, 0.02–0.08 |
| `payments > refunds partial` | Passes until the first commit on or after day −15, then fails every attempt | `broken` in `7d` and `30d`, never `quarantined` |
| `profile > uploads avatar` | `p = 0.30` on `feature/avatar-v2` only; always passes elsewhere | On `feature/avatar-v2`: 0.20–0.40, `quarantined` or `flaky` depending on `commitsRun`; on `main`: `stable` |
| `orders > exports csv` | `p = 0.30` until day −10, then always passes | `30d`: 0.13–0.27, `quarantined`; `7d`: `flakeRate = 0`, `stable` |
| `catalog > syncs stock` | Always passes; renamed to `catalog > syncs stock levels` at day −20 | Two test cases; the old one is absent from `7d` |
| All other test cases | Always pass | `stable` |

*Acceptance:*
- Given the scenario is seeded with defaults and `now` is set to `--end`, then each row above holds.
- Given the default ranked list, then the top three are `auth > redirects after sso`, `orders > exports csv` or `cart > updates total` in either order, then the other.

#### REQ-SEED-06
**Realistic reports.** Generated files MUST be valid JUnit XML in the `<testsuites>` form, one `<testsuite>` per module, with `tests`, `failures`, `errors`, `skipped`, and `time` attributes that match their contents.

*Acceptance:*
- Given any generated file, then it passes the same parser used for real uploads, and the suite counts match the test cases inside it.

---

## 13. Non-functional (NFR)

#### REQ-NFR-01
**Performance.** With the ShopLite scenario loaded, on a typical developer laptop:
- `GET /api/v1/tests` and `GET /api/v1/summary` respond in under **300 ms** (p95)
- `GET /api/v1/tests/:id/history` responds in under **500 ms** (p95)
- an upload of a 150-test report, including recomputation, responds in under **1 s**
- seeding the full default scenario takes under **2 minutes**

*Acceptance:*
- Given the seeded database, when each endpoint is called 50 times, then the p95 times are under the limits above.

#### REQ-NFR-02
**Time to insight.** The success measure in [§1.3](#13-success-measure) MUST be checked by an end-to-end test: open the dashboard and read the top five rows without changing any filter.

*Acceptance:*
- Given the seeded dashboard, then the first five rows and their failed-run counts are visible without scrolling at 1280 × 800.

#### REQ-NFR-03
**Logging.** The API MUST log one structured JSON line per request (method, path, status, duration), and MUST NOT log report contents or the upload token.

*Acceptance:*
- Given an upload with a token, then the log line contains the path and status but not the token.

#### REQ-NFR-04
**Controllable clock.** The as-of time MUST come from one clock module. When `FLAKEWATCH_NOW` is set to an ISO date-time, that value is used instead of the system time, so tests and the seeded scenario give fixed answers.

*Acceptance:*
- Given `FLAKEWATCH_NOW=2026-10-24T00:00:00Z`, then windows are measured back from that time.

#### REQ-NFR-05
**Traceability.** Every `REQ-` ID in this document MUST be referenced by at least one automated test name, and every `REQ-` ID in a test name MUST exist in this document. A script, `npm run spec:check`, MUST report both kinds of mismatch and exit non-zero if any exist.

*Acceptance:*
- Given a test named `REQ-DET-99: ...` and no `REQ-DET-99` in this spec, then `npm run spec:check` fails and names `REQ-DET-99`.

### 13.2 Configuration

| Variable | Default | Rules |
|---|---|---|
| `PORT` | `4000` | 1–65535 |
| `DATABASE_PATH` | `./data/flakewatch.db` | Folder is created if missing |
| `QUARANTINE_THRESHOLD` | `0.10` | 0 < value ≤ 1 |
| `QUARANTINE_MIN_COMMITS` | `20` | Integer ≥ 1 |
| `BROKEN_MIN_COMMITS` | `3` | Integer ≥ 2 |
| `RETENTION_DAYS` | `90` | Integer ≥ 30 ([REQ-RET-02](#req-ret-02)) |
| `MAX_UPLOAD_MB` | `10` | Number > 0 |
| `UPLOAD_TOKEN` | *(unset)* | Optional ([REQ-ING-10](#req-ing-10)) |
| `FLAKEWATCH_NOW` | *(unset)* | Optional ISO date-time ([REQ-NFR-04](#req-nfr-04)) |
| `VITE_API_URL` | `http://localhost:4000` | Dashboard's API base URL |

An invalid value MUST stop the server from starting, with an error naming the variable.

---

## 14. Change process

1. **Propose:** open a pull request that edits this spec, with a short reason. Say whether each change adds, changes, or withdraws a requirement.
2. **Version:** bump the spec version (minor for additions, major for changed or withdrawn behavior) and add a [Changelog](#16-changelog) entry.
3. **Tests first:** update or add the tests for the affected IDs in the same pull request, or a linked one, before changing the implementation.
4. **Implement:** change the code until `npm test` and `npm run spec:check` pass.
5. **Never** change behavior in code without a matching spec change. If an agent or a person finds the spec silent or ambiguous, they raise it as an open question here instead of guessing.

---

## 15. Open questions

Decide each of these before the spec moves from **draft** to **approved**. The current answer is what the spec assumes for now.

| # | Question | Current answer | Alternatives |
|---|---|---|---|
| Q-01 | Are the quarantine defaults right? | 10% flake rate with at least 20 commits | 5% / 15%; minimum 10 or 30 commits |
| Q-02 | Should automatic quarantine have hysteresis so tests don't flip on and off? | No: lifted as soon as the rate drops below the threshold | Lift only below 5%, or only after 7 days below the threshold |
| Q-03 | What about a test case that fails once with no re-run (not flaky, not broken)? | `stable`, but counted in `failedRuns` | A separate `failing` status, or treat as a suspected flake |
| Q-04 | Are windows rolling from now, or calendar-based? | Rolling: the last 7 × 24 hours | From UTC midnight; or the user's time zone |
| Q-05 | Should broken be decided by the last N commits on each branch, or across all branches? | Per scope: each branch on its own, and `*` across all | `main` only |
| Q-06 | Should releasing a manual quarantine be able to override automatic quarantine? | No | Yes, with an "ignore until" date |
| Q-07 | Is the default window 30 days? | Yes | 7 days |

---

## 16. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-25 | First draft |
