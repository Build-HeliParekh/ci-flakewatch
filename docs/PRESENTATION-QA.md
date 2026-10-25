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
- Success measure: a developer can name the five flakiest tests, and how many failed runs each caused this month, **within 30 seconds** of opening the dashboard (SPEC §1.3).
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

**How is the flake rate calculated?**
- Flake rate = flaky commits ÷ commits the test ran on, within the window.
- Example: flaky on 2 of 5 commits → **40%**.

**Why count commits and not runs?**
- Re-runs would distort it: five re-runs of one bad commit shouldn't make a test look five times worse.
- Commits measure **reliability**. Failed runs are tracked separately and measure **cost**.

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
- That's why broken always wins, even over manual quarantine.

**What if a test fails once and nobody re-runs it?**
- It's not flaky (no pass to compare) and not broken (only one commit).
- It stays **stable** but is counted as an **unconfirmed failure** and flagged with ⚠️ (REQ-STA-07, decision D-03).
- We considered a new "failing" status and treating it as a flake. Both made the rules more complicated or less accurate.

---

## 4. Quarantine

**What does quarantine actually do?**
- Flakewatch only **marks** tests as quarantined and exposes the list through the API (REQ-QUA-05).
- Your CI decides what to do with that list, e.g. don't block a merge on those failures.
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

**Can someone just un-quarantine a test?**
- They can release a **manual** quarantine, but not override an **automatic** one (decision D-06).
- Otherwise anyone could silence a test the data says is flaky.

---

## 5. Time windows and branches

**What do "7 days" and "30 days" mean?**
- Rolling windows: the last 7 × 24 or 30 × 24 hours from now (decision D-04).
- No jumps at midnight, no time-zone issues.

**Why is 30 days the default?** (decision D-07)
- It matches the success measure ("this month"), gives steadier rankings on more data, and shows fixed tests improving.

**How are branches handled?**
- Stats are computed per branch and across all branches (REQ-STA-03).
- A test flaky only on a feature branch shows up when you filter to that branch.
- Broken is also decided per branch (decision D-05), which tells a developer that their change broke it.

---

## 6. Data

**Which test frameworks does it support?**
- Any framework that outputs **JUnit XML**: a file format, not the JUnit framework.
- That includes Jest, Vitest, pytest, JUnit/TestNG, **xUnit/NUnit/MSTest** (via a JUnit logger), Go, and RSpec.
- The parser is built as pluggable adapters. Native TRX, xUnit, NUnit, and CTRF support is on the roadmap.

**Why synthetic data instead of real data?**
- With synthetic data, the right answer is known in advance, because the flakes are planted.
- That lets the tests prove correctness, e.g. "the 40% test ranks #1 at 35–45%".
- It's repeatable (fixed seed), needs no network, and can force rare edge cases.

**Isn't synthetic data unrealistic?**
- Yes, it's only as realistic as our assumptions, and that's a known limitation.
- Plan: build and verify on synthetic data, then demo on real CI data from a sample repo with a deliberately flaky test.

**What is ShopLite?**
- A fictional online store that all the synthetic data describes, so the data tells one story.
- 8 modules (auth, catalog, search, cart, checkout, payments, orders, profile), 150 tests, 60 days, about 400 commits, and 4 branches.

**What's planted in the data?**
- `auth > redirects after sso`: flaky on 40% of commits, should rank #1.
- `cart > updates total`: 15%, quarantined. `search > paginates results`: 5%, flaky.
- `payments > refunds partial`: broken from 15 days before the end. Must be broken, not flaky.
- `profile > uploads avatar`: flaky only on `feature/avatar-v2`.
- `orders > exports csv`: fixed 10 days before the end, so high over 30 days and 0% over 7.
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

---

## 8. How it was built: agentic development

**Where do AI agents come in?**
- Agents do the work, the human makes the decisions.
- **Spec reviewer** finds gaps. **Planner** breaks the spec into tasks. **Test writer** turns REQ-IDs into failing tests. **Implementers** build each module. **Reviewer** checks PRs against the spec.
- The human approves the spec and the plan, reviews the tests, and merges every PR. Agents never merge their own work.

**How do you stop agents going off track?**
- Small, bounded tasks with linked requirement IDs.
- Tests are the "done" signal, not the agent saying it's done.
- An `AGENTS.md` file holds standing rules (read the spec first, name tests by ID, run the tests and lint).
- When an agent gets something wrong, find the spec gap and fix the spec, not just the code. Gaps are logged in `RETRO.md`.

**What's the role of GitHub Actions?**
- On every PR: lint, run the tests, and run the spec traceability check.
- An agent can review PRs, or open a PR for a labeled issue, with a human approving the merge.
- Dogfooding: the project's own test results are uploaded to flakewatch.

---

## 9. Technical

**What's the stack?**
- TypeScript throughout. React and Vite dashboard, Node.js and Express API, SQLite database, Vitest and Playwright for tests.

**Why SQLite?**
- Zero setup, a single file, fast enough for this scale. It sits behind a repository interface, so PostgreSQL can replace it later.

**How fast is it?**
- Targets (REQ-NFR-01): ranked list under 300 ms, history under 500 ms, a 150-test upload under 1 s, full seed under 2 minutes.

**What if the same report is uploaded twice?**
- It replaces the earlier one and never double-counts (REQ-ING-07).

**Is it secure?**
- An optional upload token protects writes (REQ-ING-10). Read endpoints are open.
- No user accounts in v1 (out of scope). Tokens and report contents are never logged (REQ-NFR-03).

**How do stats stay current?**
- Recomputed for affected tests on every upload, before it responds, and hourly so windows move forward (REQ-STA-06).

**How long is data kept?**
- Raw results for 90 days by default, never less than 30 (the largest window) (REQ-RET-01, REQ-RET-02).

---

## 10. Limitations and future work

**What are the known limitations?**
- Renamed tests aren't linked.
- Quarantine can flip near the threshold until PC-01 is done.
- JUnit XML only in v1.
- No user accounts or permissions.
- Synthetic data is only as realistic as its assumptions.
- A failure that's never re-run can't be confirmed as flaky. It's flagged, not scored.

**What would you add next?**
- PC-01 hysteresis.
- TRX, xUnit, NUnit, and CTRF adapters.
- A real sample repo for live demos.
- PostgreSQL support.
- Slack alerts for new quarantines.
- Test ownership via CODEOWNERS.
- An "ignore until" date for manual overrides.

---

*Last updated: 2026-10-25 · Spec version 0.2*
