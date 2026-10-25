<div align="center">

# 🔍 flakewatch

**Find the tests that fail for no reason, before your team stops trusting CI.**

Detect, rank, and quarantine flaky tests from CI results. Flakewatch ingests JUnit XML, flags tests that fail then pass on the same commit, ranks them by flake rate, and shows trends in a filterable dashboard backed by a REST API.

![status](https://img.shields.io/badge/status-in%20development-orange)
![stack](https://img.shields.io/badge/stack-React%20%2B%20Node%20%2B%20TypeScript-blue)
![format](https://img.shields.io/badge/input-JUnit%20XML-informational)
![license](https://img.shields.io/badge/license-MIT-green)

[Why](#-why-flakewatch) ·
[How it works](#-how-it-works) ·
[Features](#-features) ·
[Quick start](#-quick-start) ·
[Flake rules](#-how-flakiness-is-measured) ·
[Synthetic data](#-synthetic-data-the-shoplite-scenario) ·
[API](#-rest-api) ·
[FAQ](#-faq)

</div>

---

## 🤔 Why flakewatch?

A **flaky test** passes and fails on the same code with no change. Timing issues, network calls, test order, and shared state are the usual causes.

This is what usually happens:

> CI goes red → someone clicks **Re-run** → it goes green → merge → move on.

The re-run erases the evidence, and the costs build up quietly:

- 🕳️ **Nothing is recorded.** Nobody knows which test failed or how often it happens.
- ⏱️ **Time and money are wasted.** Every re-run costs 10–30 minutes of waiting plus paid CI minutes.
- 📉 **Trust in CI drops.** "It's probably flaky" becomes a habit, and real bugs slip through.
- 🤷 **Nobody owns it.** CI tools show one run at a time, never a test's history across hundreds of runs.

**Flakewatch makes flakiness visible and measurable.** The goal:

> A developer opens the dashboard and, **within 30 seconds**, can name the five flakiest tests in their repo and how many failed runs each one caused this month.

## ⚙️ How it works

```mermaid
flowchart LR
    A[Tests run in CI] -->|JUnit XML + repo, branch,<br/>commit, attempt| B[Upload API]
    B --> C[Parser]
    C --> D[(Database<br/>full history)]
    D --> E[Flake detector]
    E --> F[(Stats + status<br/>per test)]
    F --> G[Query API]
    G --> H[Dashboard]
```

1. **Tests run in CI** and write a JUnit XML report, a standard format that almost every framework can produce.
2. **CI uploads the report** with context: repo, branch, **commit SHA**, run ID, and attempt number.
3. **The parser** turns the XML into clean records and stores every result, so a history builds up.
4. **The flake detector** checks each test against one rule: *did it fail and pass on the same commit?*
5. **Stats are calculated** (flake rate, failed runs) and each test gets a status: stable, flaky, quarantined, or broken.
6. **The dashboard** ranks the worst offenders, with filters, trends, and a per-test history.

> The **commit SHA** is what makes this work. It proves two runs tested identical code, so a different outcome can only mean the test is unreliable.

## ✨ Features

| | Feature | What it does |
|---|---|---|
| 📥 | **Result ingestion** | Upload a JUnit XML report through the API. Re-uploading the same run is **idempotent**, so it never double-counts. |
| 🎯 | **Flake detection** | Flags a test automatically when it fails and passes on the same commit, whether in a retry within one run or a separate re-run. Nobody has to report it. |
| 📊 | **Ranking** | Orders tests by flake rate or failed runs, worst first, to answer *"what do we fix first?"* |
| 🏷️ | **Filter chips** | Filter by repo, branch, status, and the **last 7 or 30 days**. Filters live in the URL, so a view can be shared as a link. |
| 🔬 | **Test detail view** | Flake-rate trend, duration trend, a pass/fail/flaky strip per commit, and recent error messages, which are often the biggest clue. |
| 🚧 | **Quarantine** | Auto-flags tests above a threshold (default **10%**, with at least 20 commits of data) so they stop blocking merges until fixed. Manual quarantine and release are supported, with a reason. |
| 🛑 | **Broken ≠ flaky** | A test that fails *every time* from a commit onward is a real bug, so it is marked **broken** and is never quarantined or hidden. |
| 🧹 | **Retention** | Deletes raw results after N days (default 90) and keeps the summary stats, so the database stays small and fast. |
| 🧪 | **Synthetic data generator** | Creates realistic CI history for one sample app with **planted** flaky, stable, and broken tests, so correctness is checked against known answers. |
| 🔌 | **REST API** | The same endpoints power the dashboard and any other tool (CLI, Slack bot, and so on). |

## 🚀 Quick start

**Prerequisites:** Node.js 20+ and npm 10+

```bash
git clone https://github.com/Build-HeliParekh/ci-flakewatch.git
cd ci-flakewatch
npm install
cp .env.example .env

npm run db:migrate   # create the SQLite schema
npm run dev          # API on :4000, dashboard on :5173
npm run seed         # in a second terminal: load the ShopLite synthetic data
```

Open **http://localhost:5173**. You should see `auth > redirects after sso` at the top of the ranking.

<details>
<summary><b>All npm scripts</b></summary>

| Script | What it does |
|---|---|
| `npm run dev` | Start API and dashboard in watch mode |
| `npm run build` | Build all workspaces |
| `npm test` | Unit, integration, and acceptance tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run seed` | Generate and upload synthetic data |
| `npm run db:reset` | Drop and recreate the database |
| `npm run lint` | ESLint and Prettier check |

</details>

## 📐 How flakiness is measured

### The rule

> **A test is flaky on a commit when, for the same repo and commit SHA, it has at least one ❌ failed result and at least one ✅ passed result.**

The code didn't change, so the outcome shouldn't have either.

### Flake rate

> **Flake rate = flaky commits ÷ commits the test ran on** (within the selected 7- or 30-day window)

**Example:** `auth > redirects after sso` over five commits:

| Commit | Attempts | Flaky? |
|---|---|---|
| `a1` | ✅ | — |
| `b2` | ❌ ✅ | **Yes** |
| `c3` | ✅ | — |
| `d4` | ❌ ✅ | **Yes** |
| `e5` | ✅ | — |

2 flaky commits ÷ 5 commits = **40% flake rate**

**Why count commits and not runs?** If `b2` was re-run five times (❌❌❌❌✅), counting runs would make the test look far worse just because someone kept clicking re-run. Counting commits measures **reliability**: *on how many versions of the code did this test misbehave?* The wasted re-runs are tracked separately as **failed runs**, which measures **cost**.

### Statuses

| Status | Rule | What to do |
|---|---|---|
| 🟢 `stable` | No failures in the window | Nothing |
| 🟡 `flaky` | Flake rate > 0, below the quarantine threshold | Keep an eye on it |
| 🟠 `quarantined` | Flake rate ≥ 10% **and** ≥ 20 commits run, or quarantined manually | Fix the **test**; don't let it block merges |
| 🔴 `broken` | Fails on every attempt for the last 3+ consecutive commits | Fix the **code**; it's a real regression |

### Why "broken" is kept separate

| Commit | `a1` | `b2` | `c3` | `d4` | `e5` |
|---|---|---|---|---|---|
| Attempts | ✅ | ✅ | ❌ ❌ | ❌ ❌ | ❌ ❌ |

This test fails a lot, but it's **not flaky**. It fails *every time* from `c3` onward, which means someone broke something in `c3` and the test is doing its job. Treating it as flaky would quarantine a real bug and send the team hunting for timing issues instead of looking at what changed.

- **Flaky:** the test is unreliable, so fix the test.
- **Broken:** the code is broken, so fix the code.

### Edge cases

- **Skipped** results are ignored for detection and counted separately.
- **Errors** (JUnit `<error>`) count as failures.
- **Branch-only flakes:** stats are computed per branch and across all branches, so a flake that only happens on one branch is visible when filtered.
- **Renamed tests** are tracked as new tests. A test's identity is `repo + file + classname + name`.
- **Duplicate uploads** of the same `(repo, runId, attempt)` replace the earlier upload.

## 🧩 Supported test frameworks

"JUnit XML" is a **file format**, not the JUnit framework. It's the de facto standard that most CI tools read, and nearly every framework can write it:

| Language | Framework | How to output JUnit XML |
|---|---|---|
| JavaScript / TypeScript | Jest, Vitest, Mocha, Playwright | `jest-junit` reporter, or built-in `--reporter=junit` |
| Python | pytest | `pytest --junitxml=report.xml` |
| Java / Kotlin | JUnit, TestNG | Built in via Maven Surefire or Gradle |
| .NET | xUnit, NUnit, MSTest | `JunitXml.TestLogger` package: `dotnet test --logger junit` |
| Go | go test | `go-junit-report` |
| Ruby | RSpec | `rspec_junit_formatter` |

The parser is built as **pluggable adapters**. Every format converts to the same internal shape, so the detector and dashboard never depend on where the data came from:

```mermaid
flowchart LR
    J[JUnit XML] --> JA[JUnit adapter]
    T[TRX - planned] -.-> TA[TRX adapter]
    X[xUnit / NUnit XML - planned] -.-> XA[xUnit adapter]
    JA --> N[Normalized results]
    TA -.-> N
    XA -.-> N
    N --> D[Detector → Dashboard]
```

Native TRX, xUnit, NUnit, and CTRF support is on the [roadmap](#-roadmap).

## 🧪 Synthetic data: the ShopLite scenario

During development, flakewatch is fed **synthetic data**: realistic but fake CI history generated by a seeded script. No tests actually run; the generator writes the *results* a real CI would produce.

All of it describes **one fictional app**, so the data tells a single coherent story instead of a random mix.

### Meet ShopLite

**ShopLite** (`demo/shoplite`) is a small online store with a typical test suite.

| Module | Example tests | Tests |
|---|---|---|
| `auth` | logs in with email, redirects after sso, resets password | ~20 |
| `catalog` | lists products, filters by category, shows out-of-stock badge | ~25 |
| `search` | finds by keyword, paginates results, handles typos | ~15 |
| `cart` | adds item, updates total, applies quantity limits | ~20 |
| `checkout` | applies discount code, validates address, calculates tax | ~25 |
| `payments` | charges card, refunds partial, retries declined payment | ~15 |
| `orders` | shows order history, exports csv, cancels pending order | ~15 |
| `profile` | uploads avatar, updates email, deletes account | ~15 |

**History:** ~60 days, ~150 test cases, ~400 commits, and ~600 runs including re-runs.

**Branches:** `main`, `feature/avatar-v2`, `feature/new-checkout`, `fix/search-performance`

**Retries:** when a run has failures, the generator adds a second attempt on the same commit, just as a developer clicking re-run would.

### Planted behaviors

These behaviors are planted on purpose, so the **correct answer is known in advance** and the acceptance tests can assert it:

| Test | Planted behavior | flakewatch should report |
|---|---|---|
| `checkout > applies discount code` | Always passes | 🟢 `stable`, 0% |
| `auth > redirects after sso` | Fails 40% of attempts at random | 🟠 `quarantined`, **ranked #1**, ~40% |
| `cart > updates total` | Fails 15% of attempts at random | 🟠 `quarantined`, ~15% |
| `search > paginates results` | Fails 5% of attempts at random | 🟡 `flaky`, ~5% |
| `payments > refunds partial` | Fails every time after one specific commit | 🔴 `broken`, **not** flaky |
| `profile > uploads avatar` | Flaky only on `feature/avatar-v2` | Flaky on that branch, stable on `main` |
| `orders > exports csv` | 30% flaky for 30 days, then fixed | High 30-day rate, ~0% 7-day rate, improving trend |
| `catalog > syncs stock` → `catalog > syncs stock levels` | Renamed mid-history | Two separate test cases |
| Everything else | Always passes | 🟢 `stable` |

```bash
npm run seed                          # default ShopLite scenario, seed 42
npm run seed -- --seed 7 --days 30    # different seed, shorter history
npm run seed -- --out ./tmp/junit     # write XML files only, don't upload
```

The generator writes **real JUnit XML files** and uploads them through the **real API**, so the parser and ingestion path are exercised too, not just the detector. A fixed seed gives identical data on every run, so tests never flake on their own data.

## 🔌 REST API

Base path: `/api/v1`. All responses are JSON.

| Method | Path | Description |
|---|---|---|
| `POST` | `/results` | Upload a JUnit XML report (multipart field `report`) with `repo`, `branch`, `commitSha`, `runId`, `attempt`, `startedAt` |
| `GET` | `/repos` | List repos and their branches |
| `GET` | `/tests` | Ranked list. Query: `repo`, `branch`, `window` (`7d`\|`30d`), `status`, `sort` (`flakeRate`\|`failedRuns`\|`name`), `page`, `pageSize` |
| `GET` | `/tests/:id` | Test details with stats for each window |
| `GET` | `/tests/:id/history` | Results grouped by commit, plus daily flake-rate points |
| `POST` | `/tests/:id/quarantine` | Quarantine manually. Body: `{ "reason": "..." }` |
| `DELETE` | `/tests/:id/quarantine` | Release a manual quarantine |
| `GET` | `/health` | Liveness check |

<details>
<summary><b>Example: upload a report</b></summary>

```bash
curl -X POST http://localhost:4000/api/v1/results \
  -F report=@junit.xml \
  -F repo=demo/shoplite \
  -F branch=main \
  -F commitSha=9f2c1ab \
  -F runId=123456 \
  -F attempt=1 \
  -F startedAt=2026-10-25T14:00:00Z
```

```json
{ "runId": 42, "tests": 150, "passed": 146, "failed": 3, "skipped": 1, "newFlakes": 1 }
```

</details>

<details>
<summary><b>Example: get the ranking</b></summary>

```bash
curl "http://localhost:4000/api/v1/tests?repo=demo/shoplite&window=30d&sort=flakeRate"
```

```json
{
  "items": [
    {
      "id": 17,
      "name": "auth > redirects after sso",
      "file": "tests/auth.test.ts",
      "flakeRate": 0.41,
      "flakyCommits": 12,
      "commitsRun": 29,
      "failedRuns": 14,
      "status": "quarantined"
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 1
}
```

</details>

Errors use `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }` with status codes 400, 404, 413, or 422.

## 🖥️ Dashboard

- **Overview cards:** flaky tests, quarantined tests, and failed runs caused by flakes in the selected window
- **Ranked table:** test name, file, flake rate, flaky commits, failed runs, and status badge, all sortable
- **Filter chips:** repo · branch · status · 7d / 30d
- **Test detail page:** flake-rate trend, duration trend, per-commit result strip, recent errors, and quarantine controls
- **Empty and error states:** no data yet, no matches, and API unreachable

## 🏗️ Architecture and data model

| Component | Responsibility |
|---|---|
| **Upload endpoint** | Validates the file and metadata, then returns a summary |
| **Parser adapters** | Convert each report format into normalized results |
| **Storage** | SQLite behind a repository interface, so it can be swapped for PostgreSQL later |
| **Flake detector** | Applies the rule and statuses, then recomputes stats for affected tests after each upload |
| **Query endpoints** | Ranking, filtering, history, and quarantine |
| **Dashboard** | React UI on top of the query API |

<details>
<summary><b>Entity relationship diagram</b></summary>

```mermaid
erDiagram
    REPO ||--o{ RUN : has
    REPO ||--o{ TEST_CASE : has
    RUN ||--o{ TEST_RESULT : contains
    TEST_CASE ||--o{ TEST_RESULT : has
    TEST_CASE ||--o{ FLAKE_STATS : summarized_by

    REPO {
        int id PK
        string name "owner/repo"
    }
    RUN {
        int id PK
        int repo_id FK
        string external_run_id
        int attempt
        string branch
        string commit_sha
        datetime started_at
    }
    TEST_CASE {
        int id PK
        int repo_id FK
        string file
        string classname
        string name
        bool manually_quarantined
    }
    TEST_RESULT {
        int id PK
        int run_id FK
        int test_case_id FK
        string status "passed|failed|skipped"
        int duration_ms
        string error_message
    }
    FLAKE_STATS {
        int test_case_id FK
        string branch "or * for all"
        string window "7d|30d"
        int commits_run
        int flaky_commits
        int failed_runs
        float flake_rate
        string status
        datetime computed_at
    }
```

</details>

## 🛠️ Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Frontend | React 18, Vite, React Router, TanStack Query, Recharts |
| Backend | Node.js 20, Express, Zod, fast-xml-parser |
| Database | SQLite via better-sqlite3 |
| Testing | Vitest, Supertest, React Testing Library, Playwright |
| Tooling | npm workspaces, ESLint, Prettier |

## 📁 Project structure

```text
ci-flakewatch/
├── apps/
│   ├── api/                  # Express REST API
│   │   ├── src/
│   │   │   ├── routes/       # results, tests, repos, health
│   │   │   ├── ingest/       # parser adapters (JUnit first)
│   │   │   ├── detector/     # flake rule, statuses, stats
│   │   │   ├── db/           # schema, migrations, repositories
│   │   │   └── server.ts
│   │   └── test/
│   └── web/                  # React dashboard
│       ├── src/
│       │   ├── pages/        # Overview, TestDetail
│       │   ├── components/   # FilterChips, RankedTable, TrendChart
│       │   └── api/          # typed API client
│       └── test/
├── packages/
│   └── shared/               # shared types: API contracts, statuses
├── tools/
│   └── seed/                 # ShopLite synthetic data generator
├── docs/
│   └── SPEC.md               # requirements with IDs + acceptance criteria
├── e2e/                      # Playwright tests
├── .env.example
├── package.json              # npm workspaces root
└── README.md
```

## 🔧 Configuration

Set these in `.env`. The defaults are shown.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API port |
| `DATABASE_PATH` | `./data/flakewatch.db` | SQLite file location |
| `QUARANTINE_THRESHOLD` | `0.10` | Flake rate that triggers quarantine |
| `QUARANTINE_MIN_COMMITS` | `20` | Minimum commits before auto-quarantine applies |
| `BROKEN_MIN_COMMITS` | `3` | Consecutive all-failing commits that mark a test broken |
| `RETENTION_DAYS` | `90` | Raw results older than this are deleted |
| `MAX_UPLOAD_MB` | `10` | Maximum report upload size |
| `UPLOAD_TOKEN` | *(empty)* | If set, uploads must send `Authorization: Bearer <token>` |
| `VITE_API_URL` | `http://localhost:4000` | API base URL for the dashboard |

## 📤 Uploading results from CI

Any CI system that can produce JUnit XML and run `curl` can send results. Here's an example GitHub Actions step:

```yaml
- name: Upload test results to flakewatch
  if: always()               # upload even when tests fail
  run: |
    curl -fsS -X POST "$FLAKEWATCH_URL/api/v1/results" \
      -H "Authorization: Bearer $FLAKEWATCH_TOKEN" \
      -F report=@reports/junit.xml \
      -F repo="${{ github.repository }}" \
      -F branch="${{ github.head_ref || github.ref_name }}" \
      -F commitSha="${{ github.sha }}" \
      -F runId="${{ github.run_id }}" \
      -F attempt="${{ github.run_attempt }}" \
      -F startedAt="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  env:
    FLAKEWATCH_URL: ${{ vars.FLAKEWATCH_URL }}
    FLAKEWATCH_TOKEN: ${{ secrets.FLAKEWATCH_TOKEN }}
```

`run_attempt` goes up on every re-run, which is how flakewatch sees a fail-then-pass on the same commit.

## ✅ Testing

Flakewatch has **its own test suite**, separate from the synthetic data:

| | Synthetic data | Flakewatch's own tests |
|---|---|---|
| **What** | Fake ShopLite CI results *fed into* flakewatch | Real tests that check *flakewatch's code* |
| **Purpose** | Gives flakewatch something to analyze | Proves it analyzes that data correctly |
| **Example** | "`cart > updates total` failed on `b2`, passed on retry" | "Given that data, the detector marks it flaky" |

| Level | Example | Tool |
|---|---|---|
| **Unit** | Fail + pass on the same commit → flaky; 2 of 5 commits → 0.40 | Vitest |
| **Integration** | POST a report, then GET `/tests` shows it; a duplicate upload doesn't double-count | Vitest + Supertest |
| **Acceptance** | After seeding ShopLite, `auth > redirects after sso` ranks #1 at 35–45%; `payments > refunds partial` is broken | Vitest |
| **Component** | Clicking the *quarantined* chip shows only quarantined tests | React Testing Library |
| **End-to-end** | Seed → open dashboard → filter → open a test → see its history | Playwright |

Every requirement in [`docs/SPEC.md`](docs/SPEC.md) has an ID, and the tests that cover it reference it by name:

```ts
// SPEC: REQ-DET-01: a test is flaky on a commit if it has ≥1 failed and ≥1 passed result
it("REQ-DET-01: marks fail-then-pass on the same commit as flaky", () => { /* ... */ });
```

This makes it easy to see that every requirement is tested, and when a test fails, which promise was broken.

> 🔁 **Dogfooding:** flakewatch's own CI uploads its test results to flakewatch, so the project watches its own tests for flakiness.

## 🧭 Development workflow

1. **Spec first.** Define behavior in `docs/SPEC.md` with requirement IDs and acceptance criteria.
2. **Tests from the spec.** Write acceptance tests against the spec and the ShopLite scenario.
3. **Build by module.** Ingestion, detector, API, and dashboard are built against shared interfaces in `packages/shared`.
4. **Change the spec, not just the code.** For any behavior change, update the spec and its tests first, then the implementation.

## 🗺️ Roadmap

- [ ] `docs/SPEC.md` with requirement IDs and acceptance criteria
- [ ] ShopLite synthetic data generator with planted behaviors
- [ ] JUnit XML parser adapter and ingestion endpoint
- [ ] Flake detector and statuses
- [ ] Query API: ranking, filters, history, quarantine
- [ ] Dashboard: overview, filter chips, ranked table
- [ ] Dashboard: test detail page with trends
- [ ] Retention job
- [ ] CI pipeline for this repo (lint, test, build), uploading its own results
- [ ] Additional adapters: TRX, xUnit XML, NUnit XML, CTRF
- [ ] A real sample repo with a deliberately flaky test for a live demo
- [ ] Later: PostgreSQL support, Slack alerts for new quarantines, test ownership via CODEOWNERS

## ❓ FAQ

<details>
<summary><b>Does this only work with the JUnit framework?</b></summary>

No. JUnit XML is a report *format* that most frameworks can write, including Jest, pytest, xUnit, NUnit, and Go. See [Supported test frameworks](#-supported-test-frameworks). Native support for other formats such as TRX is planned through the adapter design.
</details>

<details>
<summary><b>Why count flaky commits instead of failed runs?</b></summary>

Re-runs would distort the rate. Five re-runs of one commit shouldn't make a test look five times worse. Commits measure reliability; failed runs measure cost. Flakewatch shows both.
</details>

<details>
<summary><b>What's the difference between flaky and broken?</b></summary>

A flaky test fails **and** passes on the same code, which means the test is unreliable. A broken test fails **every time** from some commit onward, which means the code is broken. Broken tests are never quarantined, so real bugs are never hidden.
</details>

<details>
<summary><b>Does quarantine skip the test in CI?</b></summary>

Not by itself. Flakewatch marks the test as quarantined and exposes that through the API. Your CI can read that list to decide whether a failure should block a merge.
</details>

<details>
<summary><b>Why synthetic data instead of real CI data?</b></summary>

With synthetic data, the right answer is known in advance, because the flakes were planted. That makes correctness provable. Real CI data is planned for the final demo, to show the tool works outside the lab.
</details>

## 🤝 Contributing

1. Create a branch from `main`.
2. If behavior changes, update `docs/SPEC.md` first and reference the requirement IDs in your PR.
3. Make sure `npm run lint` and `npm test` pass.
4. Open a pull request describing the change and the requirements it covers.

## 📄 License

[MIT](LICENSE)
