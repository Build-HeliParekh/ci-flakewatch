# flakewatch: Presentation Q&A

Quick answers to questions likely to come up when presenting the project. Each answer is a few bullets you can say out loud, with a pointer to the source in [`SPEC.md`](SPEC.md) if someone wants detail.

> Keep this doc in sync with the spec. When a decision changes, update the answer here in the same pull request.

---

## 1. The problem

**What problem does flakewatch solve?**
- Flaky tests pass and fail on the same code with no change.
- Teams click "Re-run" until CI goes green, so the failure is never recorded.
- Result: wasted time (10–30 minutes per re-run), wasted CI minutes, and developers who stop trusting red builds.
- CI tools show one run at a time, never a test's history across runs, so nobody can measure the problem.

**Who is it for?**
- Any team running automated tests in CI, especially larger suites where flakes are common.
- Developers (which test to fix), tech leads (how bad is it, is it improving), and CI pipelines (which failures not to block on).

**How do you know it works?**
- Success measure: a developer can name the five flakiest tests, and how many failed attempts each caused this month, **within 30 seconds** of opening the dashboard (SPEC §1.3).
- It's checked by an end-to-end test (REQ-NFR-02).

**Doesn't GitHub, Jenkins, or another tool already do this?**
- Some CI products have basic flaky-test features, but they're often paid, tied to one CI vendor, or opaque about how they decide.
- Flakewatch is CI-agnostic (any CI that can send JUnit XML), has one documented rule, and shows its working (counts per commit).

---

## 2. Flake detection

**What exactly counts as flaky?**
- One rule: a test is flaky on a commit if, on the **same commit**, it has at least one **fail** and at least one **pass** (REQ-DET-01).
- Same code, different outcome, so the test is unreliable.
- Order doesn't matter: fail→pass and pass→fail both count.

**Why use the commit SHA?**
- It proves two runs tested identical code. Without it you can't tell "flaky" from "someone changed the code".
- Only full 40-character SHAs are accepted, so a short and a long SHA of one commit can't be counted as two commits and hide a flake (decision D-11).

**How is the flake rate calculated?**
- Flake rate = flaky commits ÷ commits the test ran on, within the window.
- Example: flaky on 2 of 5 commits → **40%**.

**Why count commits and not runs?**
- Re-runs would distort it: five re-runs of one bad commit shouldn't make a test look five times worse.
- Commits measure **reliability**. Failed attempts are tracked separately and measure **cost**.

**What about retries inside one run (e.g. Jest retries)?**
- Each occurrence of the test in the report is stored as its own result (REQ-ING-06), so fail-then-pass in one run is detected too.

**What about skipped tests?**
- Ignored for detection, counted separately (REQ-DET-02).

**What happens when a test is renamed?**
- It's treated as a new test (REQ-DET-05). Linking renamed tests is out of scope for v1, a known limitation.

---

## 3. Statuses

**What statuses can a test have?**
- 🔴 **Broken:** fails every time for the last 3+ commits. A real regression.
- 🟠 **Quarantined:** flaky on ≥ 10% of commits, with ≥ 20 commits of data (or quarantined manually).
- 🟡 **Flaky:** flaky at least once, below the quarantine threshold.
- 🟢 **Stable:** everything else with data.
- Checked in that order, and the first match wins (SPEC §7).

**Why is "broken" separate from "flaky"?**
- They mean opposite things: flaky means fix the **test**; broken means fix the **code**.
- If broken tests were treated as flaky, a real bug could be quarantined and silenced.
- That's why broken always wins, even over manual quarantine, and why broken tests never appear in the CI quarantine list.

**What if a test fails once and nobody re-runs it?**
- It's not flaky (no pass to compare) and not broken (only one commit).
- It stays **stable** but is counted as an **unconfirmed failure** and flagged with ⚠️ (REQ-STA-07, decision D-03).
- We considered a new "failing" status and treating it as a flake. Both made the rules more complicated or less accurate.

---

## 4. Quarantine

**What does quarantine actually do?**
- Flakewatch only **marks** tests as quarantined.
- CI fetches the complete list from one endpoint, `GET /api/v1/quarantine?repo=…` (REQ-QUA-05), and decides what to do with it, e.g. don't block a merge on those failures.
- Flakewatch never skips or re-runs tests itself (out of scope for v1).

**Why 10% and 20 commits?** (decision D-01)
- 10% means the test breaks 1 in 10 builds, which clearly needs action.
- The 20-commit minimum avoids quarantining on thin evidence: 1 flaky in 2 commits is "50%" but proves little.
- Both are configurable (`QUARANTINE_THRESHOLD`, `QUARANTINE_MIN_COMMITS`).

**Won't a test near 10% flip in and out of quarantine?**
- Yes, in v1. Each new pass or flake, or an old commit leaving the window, can nudge it across the line (decision D-02).
- It was deliberately left out of v1 to keep things simple.
- It's planned as **PC-01: hysteresis**, in at ≥ 10% and out only below 5%, like a thermostat. It will be demonstrated with a planted "hovering" test.
- This is also the project's example of a mid-project spec change.

**Where does the 5% exit come from?**
- A rule of thumb: half the entry threshold. It leaves a gap bigger than normal day-to-day wobble.
- It's not a standard. It will be confirmed with the planted test, and it's configurable.

**Who can quarantine or un-quarantine a test?**
- Anyone with the write token, when one is set (decision D-12). Otherwise anyone could silence a test.
- A **manual** quarantine can be released, but an **automatic** one can't be overridden (decision D-06).

---

## 5. Time windows and branches

**What do "7 days" and "30 days" mean?**
- Rolling windows: the last 7 × 24 or 30 × 24 hours from now (decision D-04).
- No jumps at midnight, no time-zone issues.
- Every number in one response uses the same "now", so nothing is stale or mixed (decision D-10).

**Why is 30 days the default?** (decision D-07)
- It matches the success measure ("this month"), gives steadier rankings on more data, and shows fixed tests improving.

**How are branches handled?**
- Stats are computed per branch and across all branches (REQ-STA-03).
- A test flaky only on a feature branch shows up when you filter to that branch.
- Broken is also decided per branch (decision D-05), which tells a developer that their change broke it.

**How long is data kept?**
- 90 days by default, and never less than 37: the 30-day trend chart looks back a further 7 days (REQ-RET-02).

---

## 6. Data

**Which test frameworks does it support?**
- Any framework that outputs **JUnit XML**: a file format, not the JUnit framework.
- That includes Jest, Vitest, pytest, JUnit/TestNG, **xUnit/NUnit/MSTest** (via a JUnit logger), Go, and RSpec.
- The parser is built as pluggable adapters. Native TRX, xUnit, NUnit, and CTRF support is on the roadmap.

**Why synthetic data instead of real data?**
- With synthetic data, the right answer is known in advance, because the flakes are planted.
- It's repeatable (fixed seed), needs no network, and can force rare edge cases.

**Why plant exact counts instead of random flakes?** (decision D-08)
- The spec review found that with random coin flips, even a correct generator would pass every expected range only about 55% of the time.
- So the generator picks **exactly** 40% of eligible commits to flake for a 40% test.
- The tests can then check exact values, e.g. "`auth > redirects after sso` is flaky on exactly 77 of 192 commits", and never fail by chance.

**Isn't synthetic data unrealistic?**
- Yes, it's only as realistic as our assumptions, and that's a known limitation.
- Plan: build and verify on synthetic data, then demo on real CI data from a sample repo with a deliberately flaky test.

**What is ShopLite?**
- A fictional online store that all the synthetic data describes, so the data tells one story.
- 8 modules (auth, catalog, search, cart, checkout, payments, orders, profile), 150 tests, 60 days, 384 commits, and 4 branches.

**What's planted in the data?** (30-day view)
- `auth > redirects after sso`: flaky on 40% of commits (77/192). Ranks #1.
- `cart > updates total`: 15%, quarantined. `search > paginates results`: 5%, flaky.
- `payments > refunds partial`: broken from 15 days before the end. Must be broken, not flaky.
- `profile > uploads avatar`: flaky only on `feature/avatar-v2` (quarantined there, stable on `main`).
- `orders > exports csv`: fixed 10 days before the end, so 19.3% over 30 days and 0% over 7.
- `catalog > syncs stock`: renamed, so it becomes two tests.

**Do you need a real repo to create flaky tests?**
- No. The generator never runs tests. It writes the **results** CI would produce, as real JUnit XML, and uploads them through the real API.

---

## 7. How it was built: spec-driven development

**What is spec-driven development here?**
- Every behavior is written in `SPEC.md` first, as a numbered requirement (e.g. `REQ-DET-01`) with Given/When/Then acceptance criteria.
- Tests are written from the spec, then code is written to pass the tests.
- To change behavior: change the spec first, then the tests, then the code (SPEC §14).

**How do you know every requirement is tested?**
- Every test name starts with its requirement ID.
- `npm run spec:check` fails if a requirement has no test, or a test names an ID that doesn't exist (REQ-NFR-05).

**Did writing the spec actually catch anything?** (good story for the presentation)
- **The 40% example was wrong.** "Fails 40% of attempts" actually gives about a 24% flake rate, because failing the retry too isn't flaky. Fixed by planting flakiness per commit.
- **A timing bug in the plan.** The "fixed" test's flaky period would have fallen outside the 30-day window. Fixed before any code existed.
- **A gap in the statuses.** A single failure with no re-run fit no status. It led to the unconfirmed-failures decision (D-03).
- All three were found before writing a line of code, which is the point of spec-first.

**What did the independent spec review find?** (second good story)
- A reviewer agent that had never seen the project read only the spec, and found **5 high, 14 medium, and 5 low** issues.
- **Biggest catch:** with random flakes, the test data would pass only about 55% of the time, so the tests themselves would have been flaky. That led to exact counts (D-08).
- **Security gap:** anyone could quarantine a test and silence it in CI, which contradicted our own rule. The write token is now required (D-12).
- **Silent bug in CI use:** the quarantine list was paginated, so a CI script could miss tests. It's now its own complete endpoint.
- **Data design:** "recompute hourly" could serve numbers up to an hour stale. Stats are now computed per request (D-10).
- **A wrong expectation:** the draft said a trend "falls to 0 in the last 10 days". With a 7-day trailing window, it's only 0 for the last 4 days.
- All 24 were fixed in wording before any code. The spec went from v0.2 to v1.0.

---

## 8. How it was built: agentic development

**Where do AI agents come in?**
- Agents do the work, the human makes the decisions.
- **Spec reviewer** finds gaps. **Planner** breaks the spec into tasks. **Test writer** turns REQ-IDs into failing tests. **Implementers** build each module. **Reviewer** checks PRs against the spec.
- The human approves the spec and the plan, reviews the tests, and merges every PR. Agents never merge their own work.

**Why use a separate agent to review the spec?**
- The author knows what they *meant*, so they read past gaps. A reviewer with no context reads only what's *written*, as an implementer would.
- It found 24 issues in a spec we thought was finished (see §7).

**How do you stop agents going off track?**
- Small, bounded tasks with linked requirement IDs.
- Tests are the "done" signal, not the agent saying it's done.
- An `AGENTS.md` file holds standing rules (read the spec first, name tests by ID, run the tests and lint).
- When an agent gets something wrong, find the spec gap and fix the spec, not just the code. Gaps are logged in `RETRO.md`.

**How did it end up?**
- v1 is complete: all 76 requirements are covered by real tests, and `spec:check --strict` passes with none pending.
- About 450 unit, integration, and acceptance tests, plus 22 end-to-end tests in a real browser, including axe accessibility checks in light and dark mode.
- The ShopLite acceptance suite passed on its first run: every number in the spec matched, so the planned "fix discrepancies" task wasn't needed.
- The benchmark caught a real problem (the list endpoint at 320–365 ms against a 300 ms target), fixed to about 150 ms without changing a single test.

**What did the tests catch that a human might have missed?**
- A library validator that accepts invalid XML (`&` unescaped), an off-by-one size limit, a request that hung, lost keyboard focus, and a layout too tall to show the top five rows. Each is logged in `RETRO.md` with the missing sentence that caused it.

**What's the role of GitHub Actions?**
- On every PR: lint, run the tests, and run the spec traceability check.
- An agent can review PRs, or open a PR for a labeled issue, with a human approving the merge.
- Dogfooding: an optional step uploads the project's own test results to a hosted flakewatch, once `FLAKEWATCH_URL` is set. It never fails the build.

---

## 9. Technical

**What's the stack?**
- TypeScript throughout. React and Vite dashboard, Node.js and Express API, SQLite database, Vitest and Playwright for tests.

**Why SQLite?**
- Zero setup, a single file, fast enough for this scale. It sits behind a repository interface, so PostgreSQL can replace it later.

**How fast is it?**
- Benchmarks (REQ-NFR-01, on a GitHub Actions runner): ranked list under 300 ms, history under 500 ms, a 150-test upload under 200 ms, full seed under 2 minutes.

**How do the numbers stay current?**
- They're computed as of the moment of each request, from one clock, so every number in a response agrees (REQ-STA-06).
- Tests fix the clock with `FLAKEWATCH_NOW`, so results are repeatable.

**What if the same report is uploaded twice?**
- It replaces the earlier one and never double-counts (REQ-ING-07).

**What if an upload has several problems at once?**
- One fixed order of checks: token (401) → size (413) → metadata (400) → report (422) (REQ-ING-14).

**Is it secure?**
- An optional write token protects uploads and quarantine changes (REQ-ING-10). Read endpoints are open.
- No user accounts in v1 (out of scope). Tokens and report contents are never logged (REQ-NFR-03).

---

## 10. Limitations and future work

**What are the known limitations?**
- Renamed tests aren't linked.
- Quarantine can flip near the threshold until PC-01 is done.
- JUnit XML only in v1.
- No user accounts or permissions, just one shared write token.
- Synthetic data is only as realistic as its assumptions.
- A failure that's never re-run can't be confirmed as flaky. It's flagged, not scored.

**What would you add next?**
- PC-01 hysteresis.
- TRX, xUnit, NUnit, and CTRF adapters.
- A real sample repo for live demos.
- A duration trend chart and per-upload new-flake counts (deferred from v1, decision D-09).
- PostgreSQL support.
- Slack alerts for new quarantines.
- Test ownership via CODEOWNERS.
- An "ignore until" date for manual overrides.

---

*Last updated: 2026-10-25 · Spec version 1.0*
