# flakewatch: Specification

| | |
|---|---|
| **Spec version** | 1.0 |
| **Status** | Approved. Takes effect when merged to `main` |
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
15. [Decisions](#15-decisions)
16. [Changelog](#16-changelog)

---

## 1. Overview

### 1.1 Problem

Flaky tests pass and fail on the same code. Teams re-run failing pipelines until they go green, so the failures are never recorded, time and CI minutes are wasted, and trust in CI erodes. CI tools show single runs, not a test's history, so nobody can see which tests are flaky or how much they cost.

### 1.2 Goal

Make flakiness visible and measurable: ingest test results from CI, detect flaky tests with one precise rule, rank them, and show them in a dashboard.

### 1.3 Success measure

> A developer opens the dashboard and, **within 30 seconds**, can name the five flakiest tests in their repo and how many failed attempts each one caused in the last 30 days.

### 1.4 In scope (v1)

- JUnit XML ingestion through a REST API
- Flake detection, statistics, statuses, and quarantine flags
- A dashboard with ranking, filters, and a per-test detail view
- Retention cleanup
- A deterministic synthetic data generator (the **ShopLite** scenario)

### 1.5 Out of scope (v1)

- User accounts, login, and per-user permissions (one optional shared write token only)
- Report formats other than JUnit XML (TRX, xUnit, NUnit, and CTRF are planned as later spec changes)
- Skipping or re-running tests in CI (flakewatch only *reports* quarantine; CI decides what to do with it)
- Linking renamed tests
- Duration trends and per-upload "new flake" counts (deferred, decision [D-09](#151-decision-log))
- Real-time push updates (the dashboard reads on load and on filter change)
- Multi-tenant hosting

---

## 2. Conventions

- **Requirement IDs** have the form `REQ-<AREA>-<NN>`, for example `REQ-DET-01`. IDs are never reused or renumbered. A removed requirement is marked **Withdrawn** and keeps its ID.
- **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are used as in RFC 2119.
- **Acceptance criteria** are written as *Given / When / Then*. Each requirement has at least one, and each acceptance criterion is covered by at least one automated test.
- **Test naming:** every automated test that covers a requirement starts its name with the ID, for example `it("REQ-DET-01: marks fail-then-pass on the same commit as flaky")`. One test may cover several IDs.
- **Configuration values** are written in `UPPER_CASE` and defined in [§13.2](#132-configuration).
- **Rounding:** "round" means round half up (away from zero for positive numbers). Character counts are in Unicode code points. 1 MB = 1,048,576 bytes.
- **ShopLite expectations:** every acceptance criterion that mentions the ShopLite scenario assumes it was seeded with default options and that `FLAKEWATCH_NOW` equals `--end` ([REQ-SEED-02](#req-seed-02), [REQ-NFR-04](#req-nfr-04)).

---

## 3. Glossary

| Term | Definition |
|---|---|
| **Repo** | A source repository, identified by `owner/name`, e.g. `demo/shoplite`. |
| **Branch** | The branch name a run was executed for, as sent in the upload. The value `*` is reserved and cannot be a branch name. |
| **Commit** | A specific version of the code, identified by `(repo, commitSha)`, where `commitSha` is the full 40-character SHA. |
| **Run** | One CI pipeline execution, identified by `(repo, runId)`. All attempts of a run belong to the same commit and branch. |
| **Attempt** | One execution of a run. The first attempt is `1`, and each re-run adds 1. Identified by `(repo, runId, attempt)`. |
| **Upload** | One JUnit XML report plus metadata for one attempt. |
| **Test case** | A distinct test, identified by `(repo, file, classname, name)`. |
| **Result** | One outcome of one test case in one upload: `passed`, `failed`, or `skipped`. |
| **Decisive result** | A `passed` or `failed` result. `skipped` results are not decisive. |
| **Flaky commit** | A commit on which a test case has at least one `failed` and at least one `passed` decisive result in the scope ([REQ-DET-01](#req-det-01)). |
| **Unconfirmed failure** | A commit on which a test case has only `failed` decisive results in the scope, so flakiness can't be confirmed ([REQ-STA-07](#req-sta-07)). |
| **As-of time (`now`)** | The reference time windows are measured back from, read from the clock module ([REQ-NFR-04](#req-nfr-04)). |
| **Window** | A time range for statistics: `7d` or `30d` ([REQ-STA-01](#req-sta-01)). |
| **Scope** | A `(window, branch)` pair that statistics are computed for. `branch` is a specific branch or `*` (all branches). |
| **Day −N** | In the synthetic data, the UTC date `date(--end) − N days`. A behavior "from day −N" applies to commits whose attempt 1 starts at or after `00:00:00Z` on that date. "Until day −N" means before that moment ([REQ-SEED-05](#req-seed-05)). |

---

## 4. Ingestion (ING)

#### REQ-ING-01
**Upload endpoint.** The system MUST accept an upload at `POST /api/v1/results` as `multipart/form-data` with:

| Field | Type | Rules |
|---|---|---|
| `report` | file | JUnit XML, required |
| `repo` | string | Required. Matches `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$` |
| `branch` | string | Required. 1–255 characters, not `*` |
| `commitSha` | string | Required. Exactly 40 hexadecimal characters, stored lower-case |
| `runId` | string | Required. 1–100 characters |
| `attempt` | integer | Required. ≥ 1 |
| `startedAt` | string | Required. ISO 8601 date-time with time zone, stored as UTC |

*Acceptance:*
- Given a valid report and valid metadata, when it is uploaded, then the response is `201` and the results are stored.
- Given any required field is missing or invalid (including a 7-character `commitSha` or `branch = "*"`), when it is uploaded, then the response is `400` with error code `VALIDATION_ERROR` and a message naming the field, and nothing is stored.

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
**Test case identity.** A test case MUST be identified by `(repo, file, classname, name)`:
- `name`: the `<testcase>` `name` attribute. If it is missing or empty, the whole upload MUST be rejected with `422` and `INVALID_REPORT`, with a message giving the position (1-based) of the offending `<testcase>`.
- `file`: the `<testcase>` `file` attribute; otherwise the `file` attribute of the nearest ancestor `<testsuite>`; otherwise an empty string.
- `classname`: the `<testcase>` `classname` attribute; otherwise the `name` attribute of the nearest ancestor `<testsuite>`; otherwise an empty string.

*Acceptance:*
- Given two uploads that contain a test case with the same repo, file, classname, and name, when both are stored, then they refer to the same test case.
- Given two test cases that differ only in `name`, when stored, then they are different test cases.
- Given `<testsuite name="cart" file="tests/cart.test.ts"><testcase name="cart > updates total"/></testsuite>`, then the test case's `file` is `tests/cart.test.ts` and its `classname` is `cart`.
- Given the third `<testcase>` has no `name`, then the response is `422` with `INVALID_REPORT` and a message mentioning test case 3.

#### REQ-ING-05
**Recorded details.** For each result the system MUST store:
- the duration in milliseconds: the `time` attribute (seconds) × 1000, rounded, or `0` if missing or invalid
- for failed results, the `message` attribute of `<failure>`/`<error>`, or its text content if there is no `message`, truncated to 2,000 characters

*Acceptance:*
- Given `time="2.3456"` and `<failure message="Timeout after 5000ms">`, when stored, then the duration is `2346` and the error message is `Timeout after 5000ms`.
- Given `time="0.0005"`, then the duration is `1`.

#### REQ-ING-06
**Repeated test cases in one report.** If the same test case appears more than once in a single report (for example, a framework's in-run retry), each occurrence MUST be stored as a separate result for that attempt.

*Acceptance:*
- Given a report in which `cart > updates total` appears twice, first with `<failure>` and then passing, when stored, then that attempt has two results for the test case, `failed` and `passed`.

#### REQ-ING-07
**Idempotent re-upload.** An upload with the same `(repo, runId, attempt)` as an existing one MUST replace that attempt's metadata and results entirely, and never add to them. It responds `200` instead of `201`.

*Acceptance:*
- Given an attempt was uploaded with 150 results, when the same `(repo, runId, attempt)` is uploaded again with 150 results, then the attempt has 150 results, not 300, and the response is `200`.

#### REQ-ING-08
**Invalid reports.** A report MUST be rejected with `422` and error code `INVALID_REPORT`, and nothing from the upload is stored, if it:
- is not well-formed XML,
- has no `<testsuite>` or `<testsuites>` root, or
- contains no `<testcase>` elements.

*Acceptance:*
- Given a truncated XML file, when it is uploaded, then the response is `422` with `INVALID_REPORT` and the database is unchanged.
- Given a well-formed `<testsuite>` with zero `<testcase>` elements, then the response is `422` with `INVALID_REPORT`.

#### REQ-ING-09
**Size limit.** If the `report` file is larger than `MAX_UPLOAD_MB` megabytes, the upload MUST be rejected with `413` and error code `PAYLOAD_TOO_LARGE`.

*Acceptance:*
- Given `MAX_UPLOAD_MB=1` and a 1,572,864-byte report, when it is uploaded, then the response is `413`.

#### REQ-ING-10
**Write token.** If `UPLOAD_TOKEN` is set, every **write** endpoint (`POST /results`, `POST` and `DELETE /tests/:id/quarantine`) MUST require `Authorization: Bearer <UPLOAD_TOKEN>`, or reject the request with `401` and error code `UNAUTHORIZED`. If it is not set, no header is required. Read endpoints never require the token.

*Acceptance:*
- Given `UPLOAD_TOKEN=abc`, when an upload or a quarantine request has no header or a wrong token, then the response is `401`; when it sends `Bearer abc`, then it is accepted.
- Given `UPLOAD_TOKEN=abc`, when `GET /api/v1/tests` is called without a header, then the response is `200`.

#### REQ-ING-11
**Atomic upload.** An upload MUST be stored all-or-nothing. When the response is `2xx`, every read reflects the upload.

*Acceptance:*
- Given an upload whose second test case fails to store, when it is processed, then no results from that upload are stored and the response is `500`.
- Given an upload responds `201`, when `GET /api/v1/tests` is called immediately afterwards, then the results of that upload are reflected.

#### REQ-ING-12
**Upload summary.** A successful upload MUST return:

```json
{ "attemptId": 42, "tests": 150, "passed": 146, "failed": 3, "skipped": 1 }
```

`tests` counts results, including repeated test cases ([REQ-ING-06](#req-ing-06)).

*Acceptance:*
- Given a report with 146 passing, 3 failing, and 1 skipped test case, then the summary is `tests: 150, passed: 146, failed: 3, skipped: 1`.

#### REQ-ING-13
**Consistent runs.** All attempts of a run MUST have the same `commitSha` and `branch`. An upload whose `commitSha` or `branch` differs from another stored attempt of the same `(repo, runId)` MUST be rejected with `400` and `VALIDATION_ERROR`, and nothing is stored. This applies to re-uploads too.

*Acceptance:*
- Given attempt 1 of run `100` is stored for commit `aaa…` on `main`, when attempt 2 of run `100` is uploaded for a different commit, then the response is `400`.

#### REQ-ING-14
**Order of checks.** When an upload has several problems, the response MUST be the first that applies, in this order: `401` (token) → `413` (size) → `400` (metadata) → `422` (report contents).

*Acceptance:*
- Given `UPLOAD_TOKEN` is set, and an upload has no token, an oversized report, and a missing `branch`, then the response is `401`.
- Given a valid token, an oversized report, and a missing `branch`, then the response is `413`.

---

## 5. Detection (DET)

#### REQ-DET-01
**The flake rule.** A test case is **flaky on a commit** when, among its decisive results for that `(repo, commitSha)` within the scope being computed, there is at least one `failed` result and at least one `passed` result. The order of the results does not matter.

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

#### REQ-DET-06
**Window applies per attempt.** A window filters **attempts** by their `startedAt` ([REQ-STA-01](#req-sta-01)), before the flake rule is applied. A commit whose attempts straddle the window's start is judged only on the attempts inside the window.

*Acceptance:*
- Given `now = 2026-10-24T00:00:00Z`, attempt 1 `failed` at `2026-09-23T23:55:00Z` and attempt 2 `passed` at `2026-09-24T00:10:00Z` on the same commit, then in `30d` the commit counts as passed: not flaky, contributing `0` to `failedAttempts`.

---

## 6. Statistics (STA)

#### REQ-STA-01
**Windows.** Statistics MUST be available for two rolling windows measured back from the as-of time: `7d` = `(now − 7×24h, now]` and `30d` = `(now − 30×24h, now]`. An attempt is in a window if its `startedAt` is in that range.

*Acceptance:*
- Given `now = 2026-10-24T00:00:00Z`, an attempt started at `2026-10-17T00:00:01Z` is in `7d`, and one started at `2026-10-17T00:00:00Z` is not.

#### REQ-STA-02
**Metrics.** For each test case and each scope, the system MUST compute:

| Metric | Definition |
|---|---|
| `commitsRun` | Distinct commits in the scope with at least one decisive result for the test case |
| `flakyCommits` | Commits counted in `commitsRun` that are flaky commits ([REQ-DET-01](#req-det-01)) |
| `flakeRate` | `flakyCommits / commitsRun`, or `0` when `commitsRun = 0` |
| `failedAttempts` | Distinct attempts in the scope with at least one `failed` result for the test case |
| `unconfirmedFailures` | See [REQ-STA-07](#req-sta-07) |
| `skippedResults` | Number of `skipped` results in the scope |
| `lastSeenAt` | Latest `startedAt` of any retained attempt with any result for the test case on the scope's branch (all branches for `*`), **ignoring the window** |

*Acceptance:*
- Given five commits in the window where `b2` and `d4` are flaky and the others passed, then `commitsRun = 5`, `flakyCommits = 2`, and `flakeRate = 0.4`.
- Given commit `b2` was attempted five times as `failed, failed, failed, failed, passed`, then it contributes `1` to `flakyCommits` and `4` to `failedAttempts`.

#### REQ-STA-03
**Scopes.** Scopes MUST exist for every combination of window (`7d`, `30d`) and branch, where the branches are those with **any retained result** for the test case, plus `*`. A scope with `commitsRun = 0` is still returned by the detail endpoint, with `status: null` ([REQ-CLS-05](#req-cls-05)).

*Acceptance:*
- Given a test case with results on `main` and `feature/avatar-v2`, then six scopes exist: `{7d, 30d} × {main, feature/avatar-v2, *}`.
- Given a test case whose only `feature/old` results are 40 days old, then its `30d/feature/old` scope exists with `commitsRun = 0` and `status: null`.

#### REQ-STA-04
**Precision and display.** The API MUST return `flakeRate` unrounded, as a number from 0 to 1. The dashboard MUST display it as a percentage with one decimal place, computed from the integer counts as `round(flakyCommits × 1000 / commitsRun) / 10`.

*Acceptance:*
- Given `flakyCommits = 1` and `commitsRun = 3`, then the dashboard shows `33.3%`.
- Given `flakyCommits = 77` and `commitsRun = 192`, then the dashboard shows `40.1%`.

#### REQ-STA-05
**Trend series.** For a test case and a branch (or `*`), the system MUST provide a 30-point daily trend:
- The points are the 30 UTC dates `D = date(now) − 30 … date(now) − 1`.
- Point `D` covers attempts with `startedAt` in `(D + 1 day − 7 days, min(D + 1 day, now)]`.
- Its `flakeRate` follows [REQ-STA-02](#req-sta-02) over that range, or is `null` if its `commitsRun = 0`.
- The trend does not depend on the `window` parameter.

*Acceptance:*
- Given `now = 2026-10-24T00:00:00Z`, then the first point is `2026-09-24` and the last is `2026-10-23`.
- Given the ShopLite scenario, then the `orders > exports csv` trend (`*`) has `flakeRate = 0` for days −4 to −1 and a value between 0.15 and 0.45 at day −20 ([REQ-SEED-05](#req-seed-05)).

#### REQ-STA-06
**Single as-of time per request.** All statistics returned by one request MUST be computed as of a single `now`, read from the clock module when the request starts. Statistics MAY be cached, but only if the results are indistinguishable from computing them at request time.

*Acceptance:*
- Given `FLAKEWATCH_NOW` is changed between two requests, then the second request's windows are measured from the new value.
- Given an attempt whose `startedAt` is exactly 7 days before `now`, then every test case in the same response treats it as outside `7d`.

#### REQ-STA-07
**Unconfirmed failures.** For each test case and scope, the system MUST compute `unconfirmedFailures`: the number of commits counted in `commitsRun` whose decisive results for the test case are **all** `failed`. Such a failure could be flaky or real, but there is no passing result on the same commit to tell. This covers a single failure that was never re-run, and a failure that failed again on re-run. These commits do not change the flake rate. See decision [D-03](#151-decision-log).

*Acceptance:*
- Given 30 commits where `d4` has one `failed` attempt and no re-run and the rest passed, then `unconfirmedFailures = 1`, `flakyCommits = 0`, and the status is `stable`.
- Given commit `c3` with `failed`, `failed`, then it adds `1` to `unconfirmedFailures`.
- Given commit `b2` with `failed`, `passed`, then it adds `0` to `unconfirmedFailures` and `1` to `flakyCommits`.
- Given a `broken` test case, then its all-failing commits are also counted in `unconfirmedFailures`, and its status is still `broken`.

---

## 7. Statuses (CLS)

Each test case has one **status** per scope with `commitsRun ≥ 1`. They are evaluated **in this order**, and the first match wins:

| Order | Status | Rule |
|---|---|---|
| 1 | `broken` | [REQ-CLS-01](#req-cls-01) |
| 2 | `quarantined` | [REQ-CLS-02](#req-cls-02) |
| 3 | `flaky` | [REQ-CLS-03](#req-cls-03) |
| 4 | `stable` | [REQ-CLS-04](#req-cls-04) |

#### REQ-CLS-01
**Broken.** A test case is `broken` in a scope when, among the commits in that scope with decisive results for it, ordered by each commit's earliest in-scope `startedAt` (ties broken by `commitSha` ascending), the most recent `BROKEN_MIN_COMMITS` commits all have only `failed` decisive results. It takes precedence over every other status, so a real regression is never shown as merely flaky or quarantined.

*Acceptance:*
- Given `BROKEN_MIN_COMMITS = 3` and the last three commits show `❌❌`, `❌❌`, `❌`, then the status is `broken`.
- Given the last three commits show `❌❌`, `❌✅`, `❌❌`, then the status is **not** `broken`.
- Given only two commits in the scope, both all-failing, then the status is **not** `broken`.
- Given a test case that is `broken` and also manually quarantined, then its status is `broken`, `quarantineSource` is `manual`, and `manualQuarantine` is reported ([REQ-QUA-03](#req-qua-03)).

#### REQ-CLS-02
**Quarantined.** A test case that is not `broken` is `quarantined` in a scope when either:
- **Automatic:** `flakeRate ≥ QUARANTINE_THRESHOLD` **and** `commitsRun ≥ QUARANTINE_MIN_COMMITS` in that scope, or
- **Manual:** it is manually quarantined ([REQ-QUA-01](#req-qua-01)), which applies to every scope.

*Acceptance:*
- Given threshold `0.10`, minimum `20`, `commitsRun = 25`, and `flakyCommits = 3` (12%), then the status is `quarantined`.
- Given `commitsRun = 10` and `flakyCommits = 5` (50%), then the status is **not** automatically quarantined (not enough data), so it is `flaky`.
- Given exactly 10.0% with `commitsRun = 20`, then the status is `quarantined` (the threshold is inclusive).

#### REQ-CLS-03
**Flaky.** A test case that is neither `broken` nor `quarantined` is `flaky` when `flakyCommits ≥ 1`.

*Acceptance:*
- Given `commitsRun = 40` and `flakyCommits = 2` (5%), then the status is `flaky`.

#### REQ-CLS-04
**Stable.** Any other test case with `commitsRun ≥ 1` is `stable`. A `stable` test case MAY have failed results that were not confirmed flaky. These count in `failedAttempts` and in `unconfirmedFailures` ([REQ-STA-07](#req-sta-07)). See decision [D-03](#151-decision-log).

*Acceptance:*
- Given 30 commits all passing, then the status is `stable` with `failedAttempts = 0`.
- Given 30 commits where one has a single `failed` attempt and no re-run, then the status is `stable` with `failedAttempts = 1` and `unconfirmedFailures = 1`.

#### REQ-CLS-05
**No data.** A test case with `commitsRun = 0` in a scope has `status: null` in that scope and MUST NOT appear in that scope's ranked list ([REQ-API-03](#req-api-03)).

*Acceptance:*
- Given a test case whose last result was 12 days ago, then it appears in the `30d` list and not in the `7d` list.
- Given a test case that only ever has `skipped` results, then it appears in neither list.

---

## 8. Quarantine (QUA)

#### REQ-QUA-01
**Manual quarantine.** `POST /api/v1/tests/:id/quarantine` with body `{ "reason": string }` (1–500 characters, required) MUST mark the test case as manually quarantined and record the reason and the time (`at`).
- The first quarantine returns `201` with `{ "manualQuarantine": { "reason": "...", "at": "..." } }`.
- Quarantining an already manually quarantined test case updates both `reason` and `at` and returns `200` with the same body.
- It requires the write token when `UPLOAD_TOKEN` is set ([REQ-ING-10](#req-ing-10)).

*Acceptance:*
- Given a `stable` test case, when it is quarantined with reason `"Times out on CI runners"`, then the response is `201`, its status in every scope with data is `quarantined`, and `GET /tests/:id` returns the reason and time.
- Given it is quarantined again with a new reason, then the response is `200` and both `reason` and `at` are updated.
- Given an empty reason, then the response is `400` with `VALIDATION_ERROR`.

#### REQ-QUA-02
**Release.** `DELETE /api/v1/tests/:id/quarantine` MUST remove a manual quarantine and return `204`. If the test case is not manually quarantined, it MUST return `409` with error code `NOT_QUARANTINED`. Releasing a manual quarantine does **not** override automatic quarantine. If the numbers still meet [REQ-CLS-02](#req-cls-02), the test case stays `quarantined` (decision [D-06](#151-decision-log)). It requires the write token when `UPLOAD_TOKEN` is set.

*Acceptance:*
- Given a test case manually quarantined at 0% flake rate, when it is released, then its status returns to `stable`.
- Given a test case manually quarantined and also at 40% over 30 commits, when it is released, then its status is still `quarantined` and `quarantineSource` is `auto`.

#### REQ-QUA-03
**Reporting the source.** For each scope, the API MUST report `quarantineSource`, which describes which quarantine conditions hold, **regardless of the status**:

| Automatic rule met in this scope | Manually quarantined | `quarantineSource` |
|---|---|---|
| yes | no | `auto` |
| no | yes | `manual` |
| yes | yes | `both` |
| no | no | `null` |

The API also reports `manualQuarantine: { reason, at } | null`.

*Acceptance:*
- Given a manually quarantined test case that also meets the automatic rule, then `quarantineSource = "both"`.
- Given a `broken` test case that also meets the automatic rule and is not manually quarantined, then its status is `broken` and `quarantineSource = "auto"`.

#### REQ-QUA-04
**Automatic release.** Automatic quarantine MUST be lifted as soon as the numbers no longer meet [REQ-CLS-02](#req-cls-02). There is no hysteresis in v1. See decision [D-02](#151-decision-log) and planned change [PC-01](#152-planned-changes).

*Acceptance:*
- Given a test case at 12% that becomes 9% after new passing commits, then it is no longer automatically quarantined.

#### REQ-QUA-05
**Quarantine list for CI.** `GET /api/v1/quarantine?repo=<owner/name>` MUST return the **complete, unpaginated** list a CI pipeline uses to decide what not to block on.
- `repo` is required; if it is missing, the response is `400`.
- It contains every test case in that repo with status `quarantined` in the `30d`, `*` scope, **plus** every manually quarantined test case in that repo, even one with no results in the last 30 days.
- It never contains a `broken` test case.
- Items are sorted by `name`, then `file`.

```json
{ "repo": "demo/shoplite", "asOf": "2026-10-24T00:00:00Z",
  "items": [ { "id": 17, "file": "tests/auth.test.ts", "classname": "auth",
               "name": "auth > redirects after sso", "quarantineSource": "auto" } ] }
```

*Acceptance:*
- Given the ShopLite scenario, then the list contains exactly `auth > redirects after sso`, `cart > updates total`, and `orders > exports csv`, and does not contain `payments > refunds partial`.
- Given a test case manually quarantined with no results in 30 days, then it is in the list.

---

## 9. API (API)

#### REQ-API-01
**General.** All endpoints are under `/api/v1` and return JSON with `Content-Type: application/json`, except `204` responses. Any query parameter outside its documented rules MUST return `400` with `VALIDATION_ERROR`. Errors MUST use:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "attempt must be an integer ≥ 1" } }
```

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid parameters, body, or metadata |
| `UNAUTHORIZED` | 401 | Missing or wrong write token |
| `NOT_FOUND` | 404 | Unknown test case ID or route |
| `NOT_QUARANTINED` | 409 | Release without a manual quarantine |
| `PAYLOAD_TOO_LARGE` | 413 | Report too large |
| `INVALID_REPORT` | 422 | Unparseable, empty, or invalid report |
| `INTERNAL_ERROR` | 500 | Anything unexpected; no stack traces in the response |

*Acceptance:*
- Given `GET /api/v1/tests/999999` for an unknown ID, then the response is `404` with `NOT_FOUND` in the format above.
- Given `GET /api/v1/tests?window=14d`, then the response is `400` with `VALIDATION_ERROR`.

#### REQ-API-02
**List repos.** `GET /api/v1/repos` MUST return every repo with its branches, both sorted by code point:

```json
{ "items": [ { "name": "demo/shoplite", "branches": ["feature/avatar-v2", "feature/new-checkout", "fix/search-performance", "main"] } ] }
```

*Acceptance:*
- Given the ShopLite scenario, then exactly one repo with four branches is returned, in the order shown.

#### REQ-API-03
**Ranked list.** `GET /api/v1/tests` MUST return test cases with their statistics for one scope.

| Parameter | Default | Rules |
|---|---|---|
| `repo` | all repos | Exact repo name |
| `branch` | `*` | A branch name or `*` |
| `window` | `30d` | `7d` or `30d` |
| `status` | all | Comma-separated subset of `broken,quarantined,flaky,stable` |
| `q` | none | Case-insensitive substring match on `name` or `file`, 1–200 characters |
| `sort` | `flakeRate` | `flakeRate`, `failedAttempts`, or `name` |
| `order` | `desc` (`asc` for `name`) | `asc` or `desc` |
| `page` | `1` | Integer ≥ 1 |
| `pageSize` | `25` | Integer 1–100 |

**Ordering.** `order` applies only to the `sort` field. Ties are then broken by fixed tie-breakers that never flip with `order`:

| `sort` | Tie-breakers, in order |
|---|---|
| `flakeRate` | `failedAttempts` desc, `name` asc, `id` asc |
| `failedAttempts` | `flakeRate` desc, `name` asc, `id` asc |
| `name` | `file` asc, `id` asc |

Text comparisons use code-point (binary) order.

**Contents.** Only test cases with `commitsRun ≥ 1` in the scope are included ([REQ-CLS-05](#req-cls-05)). Unknown `repo` or `branch` values return an empty list, not an error. A `page` beyond the last page returns `items: []` with the correct `total`.

Each item:

```json
{
  "id": 17, "repo": "demo/shoplite", "name": "auth > redirects after sso",
  "file": "tests/auth.test.ts", "classname": "auth",
  "status": "quarantined", "quarantineSource": "auto",
  "flakeRate": 0.4010416666666667, "flakyCommits": 77, "commitsRun": 192,
  "failedAttempts": 77, "unconfirmedFailures": 0, "skippedResults": 0,
  "lastSeenAt": "2026-10-23T17:42:00Z"
}
```

The response also includes `page`, `pageSize`, `total`, and `asOf` (the `now` used).

*Acceptance:*
- Given the ShopLite scenario and default parameters, then the first five items are, in order: `auth > redirects after sso`, `orders > exports csv`, `cart > updates total`, `profile > uploads avatar`, and `search > paginates results`.
- Given `window=7d&status=flaky,quarantined`, then every item has one of those two statuses.
- Given `pageSize=101`, then the response is `400`.
- Given `sort=flakeRate&order=asc` and two test cases with equal flake rates, then the one with more `failedAttempts` comes first.

#### REQ-API-04
**Summary.** `GET /api/v1/summary` with the same `repo`, `branch`, and `window` parameters MUST return the counts for the overview cards:

```json
{ "asOf": "2026-10-24T00:00:00Z", "broken": 1, "quarantined": 3, "flaky": 2, "stable": 145, "failedAttemptsFromFlakes": 161 }
```

- The status counts cover test cases with `commitsRun ≥ 1` in the scope.
- `failedAttemptsFromFlakes` is the **sum over test cases** with status `flaky` or `quarantined` of their `failedAttempts`. An attempt in which two such test cases failed is counted twice.

*Acceptance:*
- Given the ShopLite scenario and the `30d`, `*` scope, then the response equals the example above.
- Given the `7d`, `*` scope, then `broken = 1`, `quarantined = 2`, `flaky = 2`, and `stable = 145`.

#### REQ-API-05
**Test detail.** `GET /api/v1/tests/:id` MUST return:
- the test case's identity (`id`, `repo`, `file`, `classname`, `name`) and `manualQuarantine`
- a `scopes` array with the statistics, `status`, and `quarantineSource` for every scope in [REQ-STA-03](#req-sta-03), sorted by window (`7d` first), then branch (`*` first, then by code point)
- `recentErrors`: the 5 most recent failure messages across all retained results, each with `commitSha`, `branch`, `attempt`, `startedAt`, and `message`, newest first

*Acceptance:*
- Given `profile > uploads avatar` in the ShopLite scenario, then its `30d/feature/avatar-v2` status is `quarantined`, its `7d/feature/avatar-v2` status is `flaky`, and its `30d/main` status is `stable`.

#### REQ-API-06
**Test history.** `GET /api/v1/tests/:id/history?branch=&window=` (defaults `*` and `30d`) MUST return:
- `commits`: the most recent 100 commits in the scope, newest first by earliest in-scope `startedAt`. Each has `commitSha`, `branches` (the array of branches its in-scope attempts ran on), `firstStartedAt`, `outcome` (`passed`, `failed`, or `flaky`), `rerun` (`true` when the commit has more than one decisive result for the test case), and `attempts` (each with `attempt`, `startedAt`, `status`, `durationMs`)
- `trend`: the series from [REQ-STA-05](#req-sta-05) as `[{ "date": "2026-10-01", "flakeRate": 0.25 }]` (`flakeRate` may be `null`)

*Acceptance:*
- Given a commit with `failed` then `passed`, then its `outcome` is `flaky` and `rerun` is `true`. Given a single `failed` result, then `outcome` is `failed` and `rerun` is `false`.
- Given a single attempt containing two `failed` results for the test case (an in-run retry), then `rerun` is `true`.

#### REQ-API-07
**Health.** `GET /api/v1/health` MUST return `200` with `{ "status": "ok" }` when the database is reachable, and `503` otherwise.

*Acceptance:*
- Given the server is running with a valid database, then the response is `200`.

---

## 10. Dashboard (UI)

#### REQ-UI-01
**Overview page.** The home page MUST show overview cards from [REQ-API-04](#req-api-04) (broken, quarantined, flaky, and failed attempts from flakes), and below them the ranked table.

*Acceptance:*
- Given the ShopLite scenario, when the dashboard opens, then the cards show `1` broken, `3` quarantined, `2` flaky, and `161` failed attempts from flakes.

#### REQ-UI-02
**Filter chips.** The page MUST provide:

| Chip group | Selection | Default | Affects |
|---|---|---|---|
| Repo | single | first repo by code point | cards and table |
| Branch | single, options depend on the repo | All branches (`*`) | cards and table |
| Window | single: `7 days` / `30 days` | `30 days` | cards and table |
| Status | multiple | none selected = all statuses | table only |

Changing any chip MUST reset the table to page 1.

*Acceptance:*
- Given the dashboard is open, when the `Quarantined` status chip is selected, then only quarantined test cases are listed and the cards do not change.
- Given `feature/avatar-v2` is selected, then `profile > uploads avatar` appears with status `Quarantined`; given `main` is selected, it appears as `Stable`.

#### REQ-UI-03
**Shareable URLs.** All filter, sort, search, and page state MUST be stored in the URL query string. Opening that URL MUST restore the same view.

*Acceptance:*
- Given a filtered view, when its URL is opened in a new tab, then the same chips are selected and the same rows are shown.

#### REQ-UI-04
**Ranked table.** Columns: rank, test name, file, status badge, flake rate, flaky commits / commits run, and failed attempts. Flake rate and failed attempts are sortable. The default sort matches [REQ-API-03](#req-api-03). Clicking a row opens the detail page. When `unconfirmedFailures ≥ 1`, the status badge MUST be followed by a warning marker labelled "N unconfirmed failure(s)" (visible text, or an accessible label with a tooltip).

*Acceptance:*
- Given the ShopLite scenario with default filters, then the first row is `auth > redirects after sso` showing `40.1%`.
- Given `payments > refunds partial`, then its row shows the `Broken` badge and a marker reading `96 unconfirmed failures`.

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
- its name, file, repo, and status for the selected scope
- a window and branch selector, defaulting to the overview's current filters
- a flake-rate trend chart ([REQ-STA-05](#req-sta-05))
- a commit strip with one cell per recent commit, colored and labelled passed, failed, or flaky. A failed commit with `rerun = false` is labelled "failed (not re-run)"
- the number of unconfirmed failures in the selected scope
- the 5 most recent error messages
- quarantine controls: **Quarantine** (asks for a reason), or **Release** when manually quarantined
- a back link to the overview that keeps the previous filters

*Acceptance:*
- Given `orders > exports csv` with branch `*`, then the trend chart's points for days −4 to −1 are `0`.
- Given a stable test case, when the user quarantines it with a reason, then the badge changes to `Quarantined` without a page reload.

#### REQ-UI-08
**Loading, empty, and error states.**
- While loading: a loading indicator, with no layout jump when data arrives.
- No data at all: a message explaining how to upload results or run `npm run seed:demo`.
- No rows match: "No tests match these filters", with a **Clear filters** action.
- API unreachable or `5xx`: an error message with a **Retry** action.

*Acceptance:*
- Given an empty database, then the empty-state message is shown instead of an empty table.
- Given the API is stopped, then the error state with Retry is shown.

#### REQ-UI-09
**Accessibility.** Chips, table rows, and controls MUST be usable with a keyboard alone and have accessible names. Text contrast MUST meet WCAG 2.1 AA.

*Acceptance:*
- Given keyboard-only use, then the user can select a chip, open a test case, and quarantine it.
- Given an automated accessibility check (axe) of the overview and detail pages, then it reports no contrast or missing-name violations.

#### REQ-UI-10
**Responsive layout.** The overview MUST be usable at widths from 375 px to 1920 px with no horizontal page scroll. The table MAY scroll horizontally inside its own container on narrow screens.

*Acceptance:*
- Given a 375 px viewport, then the page has no horizontal scroll and the chips wrap onto multiple lines.

---

## 11. Retention (RET)

#### REQ-RET-01
**Cleanup.** At least once a day, the system MUST delete attempts, and their results, whose `startedAt` is more than `RETENTION_DAYS × 24h` before now. Test cases and manual quarantine records are kept. A run with no remaining attempts is deleted.

*Acceptance:*
- Given `RETENTION_DAYS = 90` and an attempt from 91 days ago, when cleanup runs, then that attempt and its results are deleted, and the test case still exists.

#### REQ-RET-02
**Minimum retention.** `RETENTION_DAYS` MUST be at least `37`: the 30-day trend plus its 7-day look-back ([REQ-STA-05](#req-sta-05)). A lower value MUST stop the server from starting, with an error naming `RETENTION_DAYS`.

*Acceptance:*
- Given `RETENTION_DAYS = 30`, when the server starts, then it exits with an error naming `RETENTION_DAYS`.

#### REQ-RET-03
**Manual trigger.** Cleanup MUST also be runnable on demand with `npm run retention`.

*Acceptance:*
- Given old attempts, when `npm run retention` is run, then they are deleted and the number deleted is printed.

---

## 12. Synthetic data (SEED)

The generator lives in `tools/seed` and produces CI history for **ShopLite** (`demo/shoplite`), a fictional online store. It plants **exact** numbers of flaky commits, so the expected results below are guaranteed rather than probable (decision [D-08](#151-decision-log)).

#### REQ-SEED-01
**Determinism.** Given the same `--seed`, `--days`, and `--end` values (with `--end` given as a date-time), the generator MUST produce byte-identical output: XML files and manifest ([REQ-SEED-02](#req-seed-02)).

*Acceptance:*
- Given two runs with `--seed 42 --out <dir>`, then every output file, including `manifest.json`, has the same checksum.

#### REQ-SEED-02
**Options and output.**

| Option | Default | Meaning |
|---|---|---|
| `--seed` | `42` | Random seed |
| `--days` | `60` | Days of history (the UTC dates `date(--end) − days … date(--end) − 1`) |
| `--end` | `2026-10-24T00:00:00Z` | A UTC midnight date-time, or `today` (the current UTC date at 00:00). All attempts start before it |
| `--out` | none | Write files to this folder instead of uploading |
| `--api` | `http://localhost:4000` | API to upload to |
| `--token` | value of `UPLOAD_TOKEN` | Write token sent with uploads |

- **Upload mode:** files are sent through `POST /api/v1/results` in upload order (by `startedAt`, then `runId`, then `attempt`), and a summary is printed: attempts uploaded, results, and elapsed time.
- **`--out` mode:** each attempt is written as `<NNNN>-<runId>-attempt<k>.xml`, where `NNNN` is the zero-padded upload order. A `manifest.json` lists, in upload order, `{ "file", "repo", "branch", "commitSha", "runId", "attempt", "startedAt" }` for each file. Nothing is uploaded.
- `npm run seed` uses the defaults (for tests). `npm run seed:demo` uses `--end today`, for viewing the dashboard on the real clock.

*Acceptance:*
- Given `--out ./tmp/junit`, then XML files and `manifest.json` are written and nothing is uploaded.
- Given `UPLOAD_TOKEN=abc` on the server and the same value in the generator's environment, then seeding succeeds.

#### REQ-SEED-03
**Shape of the scenario.**
- **Test cases:** each report contains 150 test cases across 8 modules: `auth` 20, `catalog` 25, `search` 15, `cart` 20, `checkout` 25, `payments` 15, `orders` 15, `profile` 15. The file is `tests/<module>.test.ts`, the classname is the module, and the name is `<module> > <behavior>`. Because of the rename ([REQ-SEED-05](#req-seed-05)), the database ends up with **151** test cases.
- **Commits:** exactly 8 commits on each weekday (Monday–Friday) and 2 on each weekend day, at random times between 08:00 and 20:00 UTC. Each commit has a random 40-character lower-case hex SHA and one run with `runId` `shoplite-<n>`.
- **Segments:** commits are grouped into three segments relative to `--end`: **S1** = the last 7 days, **S2** = days 8–30 before the end, and **S3** = older.
- **Branches:** within each segment of `n` commits, exactly `round(0.15 × n)` commits are assigned to each of `feature/avatar-v2`, `feature/new-checkout`, and `fix/search-performance`, chosen at random. The rest are on `main`.
- **Attempts:** if attempt 1 has any `failed` result, an attempt 2 is added 5–20 minutes later, running all test cases again.
- **Durations:** each test case has a base duration of 50–3,000 ms, with ±20% random variation per result.

With default options this gives exactly **384** commits: **44** in `7d` and **192** in `30d`.

*Acceptance:*
- Given default options, then there are 384 commits, 192 of them in `30d`, across exactly 4 branches, and 151 test cases in the database.
- Given default options, then `feature/avatar-v2` has 7 commits in S1, 22 in S2, and 29 in S3.

#### REQ-SEED-04
**How flakiness is planted.** A planted flaky test case has a flake proportion `p` and a set of **eligible commits** (for example, only commits on one branch, or only before a certain day). In each segment, the generator picks **exactly** `round(p × eligible commits in that segment)` of the eligible commits at random. On a picked commit, the test case fails attempt 1 with a realistic error message (such as `TimeoutError: Waiting for selector ".order-row" exceeded 5000ms`) and passes attempt 2. On every other commit it passes.

*Acceptance:*
- Given `p = 0.40` and 44 eligible commits in S1, then exactly 18 S1 commits are flaky for that test case.

#### REQ-SEED-05
**Planted behaviors and expected results.** These are exact values for the default options, with `now = --end`.

| Test case | Planted behavior | Expected (`30d`, `*` unless stated) |
|---|---|---|
| `checkout > applies discount code` | Always passes | `stable`, `flakeRate = 0` |
| `auth > redirects after sso` | `p = 0.40`, all commits | 77/192, `quarantined` (auto), rank 1. `7d`: 18/44, `quarantined` |
| `cart > updates total` | `p = 0.15`, all commits | 29/192, `quarantined` (auto). `7d`: 7/44, `quarantined` |
| `search > paginates results` | `p = 0.05`, all commits | 9/192, `flaky`. `7d`: 2/44, `flaky` |
| `payments > refunds partial` | Passes until day −15, then fails every attempt | `broken` in `7d` and `30d`. `30d`: 96 unconfirmed failures, never in the quarantine list |
| `profile > uploads avatar` | `p = 0.30`, only `feature/avatar-v2` commits | `*`: 9/192, `flaky`. `30d/feature/avatar-v2`: 9/29, `quarantined`. `7d/feature/avatar-v2`: 2/7, `flaky`. `main`: `stable` |
| `orders > exports csv` | `p = 0.30`, only commits until day −10 | 37/192, `quarantined`. `7d`: 0/44, `stable` |
| `catalog > syncs stock` | Always passes; renamed to `catalog > syncs stock levels` from day −20 | Two test cases. The old one has 62 commits in `30d` and is absent from `7d` |
| All other test cases | Always pass | `stable` |

*Acceptance:*
- Given the scenario seeded with defaults, then every value in the table holds exactly.
- Given the default ranked list, then the top five are, in order: `auth > redirects after sso`, `orders > exports csv`, `cart > updates total`, `profile > uploads avatar`, `search > paginates results`. The last two tie on rate and attempts and are ordered by name.

#### REQ-SEED-06
**Realistic reports.** Generated files MUST be valid JUnit XML in the `<testsuites>` form, with one `<testsuite>` per module carrying `name` (the module) and `file`, and with `tests`, `failures`, `errors`, `skipped`, and `time` attributes that match their contents.

*Acceptance:*
- Given any generated file, then it passes the same parser used for real uploads, and the suite counts match the test cases inside it.

---

## 13. Non-functional (NFR)

#### REQ-NFR-01
**Performance targets.** These are SHOULD-level benchmarks, run with `npm run bench` (not part of `npm test`). The reference environment is a GitHub Actions `ubuntu-latest` standard runner, with the ShopLite scenario loaded:
- `GET /api/v1/tests` and `GET /api/v1/summary` SHOULD respond in under **300 ms** (p95)
- `GET /api/v1/tests/:id/history` SHOULD respond in under **500 ms** (p95)
- a 150-test upload SHOULD respond in under **200 ms** (p95)
- seeding the full default scenario SHOULD take under **2 minutes**. That is about 700 uploads (384 first attempts plus re-runs), so it needs an average of about 170 ms per upload including HTTP overhead.

*Acceptance:*
- Given the seeded database, when `npm run bench` calls each endpoint 50 times, then it reports p95 times and flags any above the targets.

#### REQ-NFR-02
**Time to insight.** The success measure in [§1.3](#13-success-measure) MUST be checked by an end-to-end test: open the dashboard and read the top five rows without changing any filter.

*Acceptance:*
- Given the seeded dashboard at 1280 × 800, then the first five rows and their failed-attempt counts are visible without scrolling.

#### REQ-NFR-03
**Logging.** The API MUST log one structured JSON line per request (method, path, status, duration), and MUST NOT log report contents or the write token.

*Acceptance:*
- Given an upload with a token, then the log line contains the path and status but not the token.

#### REQ-NFR-04
**Controllable clock.** The as-of time MUST come from one clock module. On **every call**, it returns `FLAKEWATCH_NOW` if that is set to an ISO date-time, and the system time otherwise. All ShopLite acceptance and end-to-end tests run with `FLAKEWATCH_NOW` equal to the generator's `--end`.

*Acceptance:*
- Given `FLAKEWATCH_NOW=2026-10-24T00:00:00Z`, then windows are measured back from that time.
- Given `FLAKEWATCH_NOW` changes while the server is running, then the next request uses the new value.

#### REQ-NFR-05
**Traceability.** Every `REQ-` ID in this document that is not **Withdrawn** MUST be referenced by at least one automated test name, and every `REQ-` ID in a test name MUST exist in this document. `npm run spec:check` MUST report both kinds of mismatch and exit non-zero if any exist. Performance benchmarks ([REQ-NFR-01](#req-nfr-01)) count as tests for this purpose.

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
| `RETENTION_DAYS` | `90` | Integer ≥ 37 ([REQ-RET-02](#req-ret-02)) |
| `MAX_UPLOAD_MB` | `10` | Number > 0 (1 MB = 1,048,576 bytes) |
| `UPLOAD_TOKEN` | *(unset)* | Optional write token ([REQ-ING-10](#req-ing-10)) |
| `FLAKEWATCH_NOW` | *(unset)* | Optional ISO date-time ([REQ-NFR-04](#req-nfr-04)) |
| `VITE_API_URL` | `http://localhost:4000` | Dashboard's API base URL |

An invalid value MUST stop the server from starting, with an error naming the variable.

---

## 14. Change process

1. **Propose:** open a pull request that edits this spec, with a short reason. Say whether each change adds, changes, or withdraws a requirement.
2. **Version:** bump the spec version (minor for additions, major for changed or withdrawn behavior) and add a [Changelog](#16-changelog) entry.
3. **Tests first:** update or add the tests for the affected IDs in the same pull request, or a linked one, before changing the implementation.
4. **Implement:** change the code until `npm test` and `npm run spec:check` pass.
5. **Never** change behavior in code without a matching spec change. If an agent or a person finds the spec silent or ambiguous, they raise it as an open question in [§15](#15-decisions) instead of guessing.

---

## 15. Decisions

### 15.1 Decision log

Questions raised while writing and reviewing the spec, and how they were settled. New questions are added here as `Q-NN` until they are decided, then recorded as `D-NN`.

| # | Question | Decision | Why | Alternatives considered | Date |
|---|---|---|---|---|---|
| D-01 | What are the automatic quarantine defaults? | **10% flake rate with at least 20 commits** ([REQ-CLS-02](#req-cls-02)) | 10% means a test breaks 1 in 10 builds, which clearly needs action. 20 commits is about a week on a busy repo: enough evidence without reacting too late. Both are configurable. | 5% or 15%; minimum 10 or 30 commits | 2026-10-25 |
| D-02 | Should automatic quarantine have hysteresis so tests don't flip on and off? | **No in v1.** Quarantine is lifted as soon as the rate drops below the threshold ([REQ-QUA-04](#req-qua-04)). Hysteresis is planned as [PC-01](#152-planned-changes). | Keeps v1 simple to build, test, and explain. The flip-flop will be shown with planted data and fixed by a spec change, which demonstrates the change process. | Lift only below 5%; lift only after 7 days below the threshold | 2026-10-25 |
| D-03 | How is a test case that fails with no passing result on the same commit handled, when it's not broken? | **It stays `stable`, but is counted as an unconfirmed failure** and shown in the table and detail page ([REQ-STA-07](#req-sta-07)) | Counting it as a flake would break the single flake rule. A new `failing` status would add rules for how long it lasts and how it ranks. A count keeps the rule clean and the failure visible. | A separate `failing` status; treat it as a suspected flake | 2026-10-25 |
| D-04 | Are windows rolling from now, or calendar-based? | **Rolling: the last 7 × 24 or 30 × 24 hours** ([REQ-STA-01](#req-sta-01)) | The numbers don't jump at midnight, and time zones don't matter. The trend chart uses UTC days for its points. | From UTC midnight; the viewer's time zone | 2026-10-25 |
| D-05 | Is broken decided per branch or across all branches? | **Per scope:** each branch on its own, and `*` across all branches ([REQ-CLS-01](#req-cls-01)) | `main` only would miss a branch where someone broke a test, which is where the label helps most: it tells the developer the problem is their change. | `main` only | 2026-10-25 |
| D-06 | Can releasing a manual quarantine override automatic quarantine? | **No** ([REQ-QUA-02](#req-qua-02)) | Otherwise anyone could silence a test that the data says is flaky. | Yes, with an "ignore until" date (possible later feature) | 2026-10-25 |
| D-07 | What is the default window? | **30 days** ([REQ-API-03](#req-api-03), [REQ-UI-02](#req-ui-02)) | It matches the success measure ("this month"), ranks on more data so the list is steadier, and shows fixed tests improving. 7 days is one click away. | 7 days | 2026-10-25 |
| D-08 | Should the synthetic data plant flakiness with random draws or exact counts? | **Exact counts per segment** ([REQ-SEED-04](#req-seed-04)) | The spec review found that with random draws, a correct generator would pass every planted range only about 55% of the time. Exact counts make the expected results guaranteed and still look realistic. | Random draws with wider ranges | 2026-10-25 |
| D-09 | Should v1 include the duration trend chart and a "new flaky commits" count per upload? | **No, both are deferred** to the roadmap | Neither is needed for the success measure, and both were underspecified. Deferring keeps v1 lean. Durations are still stored and shown per attempt. | Keep both and specify them fully | 2026-10-25 |
| D-10 | Are statistics precomputed on a schedule or computed for each request? | **Computed as of one `now` per request; caching only if indistinguishable** ([REQ-STA-06](#req-sta-06)) | An hourly recompute could be up to an hour stale and mix as-of times in one response, which contradicts second-precise windows. | Recompute after each upload plus hourly | 2026-10-25 |
| D-11 | Should commits be identified by short or full SHAs? | **Full 40-character SHAs only** ([REQ-ING-01](#req-ing-01)) | A short and a full SHA of the same commit would count as two commits and hide a flake. CI systems provide the full SHA. | Accept 7–40 characters and match prefixes | 2026-10-25 |
| D-12 | Who can quarantine or release tests? | **Anyone with the write token, when one is set** ([REQ-ING-10](#req-ing-10)) | Without it, anyone could quarantine a test and silence it in CI, which contradicts D-06. | Open to all; separate admin token | 2026-10-25 |

**Open questions:** none at the moment.

### 15.2 Planned changes

Changes already agreed for a later version. Each one becomes a spec pull request ([§14](#14-change-process)) when it is scheduled.

#### PC-01: Quarantine hysteresis (from D-02)

- **Problem:** a test hovering around the threshold flips between `quarantined` and `flaky` as each new commit, or the moving window, nudges its rate across 10%. CI would then block on it one day and not the next.
- **Change:** add `QUARANTINE_EXIT_THRESHOLD` (default `0.05`). A test enters automatic quarantine at `flakeRate ≥ QUARANTINE_THRESHOLD` and leaves only when `flakeRate < QUARANTINE_EXIT_THRESHOLD`. This needs a stored quarantine state, because the status then depends on the previous status.
- **Exit value:** half the entry threshold is a rule of thumb, not a standard. It leaves a gap wider than normal day-to-day variation. The value is confirmed with the planted test below and is configurable.
- **Planted test:** `checkout > calculates tax`, flaky at random on about 10% of commits (random draws, not exact counts, so its rate wobbles). Evaluated with `FLAKEWATCH_NOW` set to each of the scenario's last 30 days: before the change, its status flips at least twice; after the change, it stays `quarantined`.
- **Affects:** [REQ-CLS-02](#req-cls-02), [REQ-QUA-04](#req-qua-04), [REQ-SEED-05](#req-seed-05), [§13.2](#132-configuration).

---

## 16. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-25 | First draft |
| 0.2 | 2026-10-25 | Recorded decisions D-01 to D-07. Added unconfirmed failures (REQ-STA-07) and planned change PC-01. |
| 1.0 | 2026-10-25 | Applied the independent spec review (24 findings). Exact-count seeding with exact expected values (D-08). Deferred the duration trend and the per-upload new-flake count (D-09). Statistics computed per request (D-10). Full SHAs only (D-11). Write token required for quarantine (D-12). Added the trend definition, window-per-attempt rule (REQ-DET-06), consistent runs (REQ-ING-13), order of checks (REQ-ING-14), and `GET /quarantine` (REQ-QUA-05). Raised the minimum retention to 37 days. Renamed `failedRuns` to `failedAttempts`. Defined ordering, rounding, scopes, `lastSeenAt`, `quarantineSource`, and the generator's output format. Made performance targets benchmarks. Status set to approved. |
