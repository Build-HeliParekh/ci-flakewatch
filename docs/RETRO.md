# Retrospective log

A running record of **spec gaps, ambiguities, and agent mistakes** found while building flakewatch. It feeds the capstone retrospective. Its main question is: *which missing sentence in the spec caused which mistake?*

Add an entry whenever:
- the spec was silent, ambiguous, or contradictory,
- an agent (or a person) built something wrong because of how the spec was written, or
- a review caught something the author missed.

## How to add an entry

Copy this block to the **top** of the log, so the newest entry comes first:

```markdown
### R-NN: Short title
- **Date:** YYYY-MM-DD
- **Found by:** author / spec reviewer / test writer / implementer / code reviewer / human
- **Stage:** spec / plan / tests / implementation / review
- **Requirement(s):** REQ-XXX-NN
- **What happened:** One or two sentences.
- **Root cause:** What the spec said, or didn't say.
- **Fix:** Spec change (version), test change, or code change, with a link to the PR.
- **Lesson:** What to write differently next time.
```

---

## Log

### R-10: Tools installed from the wrong operating system broke the owner's setup
- **Date:** 2026-10-25
- **Found by:** human, when `npm run dev` failed on their Mac
- **Stage:** implementation
- **Requirement(s):** none (process)
- **What happened:** The agent ran `npm ci` in the owner's repository folder from a Linux shell on the same computer, so `node_modules` held only Linux builds of esbuild and Rollup, and the dev server couldn't start on macOS. Reinstalling on the Mac then used an old npm (6), which can't handle npm workspaces and rewrote `package-lock.json` in an old format.
- **Root cause:** A shared folder was treated as if it were the agent's own workspace, and the owner's Node version was never checked against the README's prerequisite.
- **Fix:** The rewritten lockfile was restored with git. The owner is upgrading to Node 22 and npm 10 and reinstalling. Agents now run installs and checks only in their own workspace (AGENTS.md §6), and the README shows how to check versions first.
- **Lesson:** Platform-specific files belong to the machine that installed them. Check prerequisites on the person's real machine before asking them to run anything.

### R-09: Two agent sessions shared one workspace
- **Date:** 2026-10-25
- **Found by:** human and agent, when the next task started
- **Stage:** implementation
- **Requirement(s):** none (process)
- **What happened:** A second Claude session did T-06 in the same repository folder and the same agent workspace, while the first was idle. It left uncommitted work on a branch, and it rewrote the workspace's local history, dropping the T-14 commits from it. Nothing was lost because T-14 was already merged on GitHub, and the T-06 work was reviewed, rebased onto `main`, and kept.
- **Root cause:** Nothing marks a task as claimed, and both sessions assumed they had the folder to themselves.
- **Fix:** The workspace was rebuilt from `main` before continuing. T-06 was committed with a note crediting the other session.
- **Lesson:** One task, one branch, one agent at a time. Mark a task *In progress* in PLAN.md (and push the branch) before starting, and check `git status` and the task's status before starting a new one.

### R-08: A test helper bug would have made a correct implementation fail
- **Date:** 2026-10-25
- **Found by:** test writer (T-13a), before handing the tests over
- **Stage:** tests
- **Requirement(s):** REQ-STA-07
- **What happened:** The helper that builds fake commit SHAs padded labels with zeros, so `p1` and `p10` became the same SHA. One REQ-STA-07 test built 30 commits but really had fewer, so a correct implementation would have failed it.
- **Root cause:** Test fixtures were trusted without being exercised. The stubs fail every test anyway, so a wrong test looks the same as a right one until something real runs against it.
- **Fix:** SHAs are built by hex-encoding the label. Before handing over, the tests were run against a throwaway reference implementation (all 30 passed), which was then deleted.
- **Lesson:** Before approving a test-writer stage, prove the tests can pass, for example with a quick throwaway implementation, and that they fail for the right reason.

### R-07: The "Withdrawn" rule would have silently dropped a requirement
- **Date:** 2026-10-25
- **Found by:** implementer (T-02 spec checker), on its first run against the real spec
- **Stage:** implementation
- **Requirement(s):** REQ-NFR-05
- **What happened:** The plan said a requirement is withdrawn if its heading or first body line *contains* "Withdrawn". REQ-NFR-05's first line says "every ID that is not **Withdrawn**", so the checker counted 73 requirements instead of 74 and stopped checking REQ-NFR-05 itself.
- **Root cause:** The rule was written for the marker we expected, not checked against the real text. The fixture tests passed because they didn't include a body that merely mentions the word.
- **Fix:** Withdrawn only if the heading says so or the first body line *starts* with the word; a regression test covers REQ-NFR-05's wording. PLAN §3.7 updated.
- **Lesson:** Run new tooling against the real input, not only fixtures, and turn every surprise into a test.

### R-06: The spec pinned a runtime that had reached end of life
- **Date:** 2026-10-25
- **Found by:** implementer (T-01 scaffold)
- **Stage:** implementation
- **Requirement(s):** REQ-CI-01
- **What happened:** Installing the planned dependencies reported 9 known vulnerabilities, 2 of them critical, in the test tooling. The fixes needed newer major versions (Vitest 5, Vite 8, Zod 4, fast-xml-parser 5, React Router 7). Vitest 5 requires Node 22, but REQ-CI-01 said Node 20, which had reached end of life in April 2026.
- **Root cause:** The spec and README named versions from memory without checking their support dates or current advisories.
- **Fix:** SPEC v1.3 (Node.js 22, decision D-15); dependency upgrades approved and recorded in the scaffold PR.
- **Lesson:** Check support dates and run `npm audit` when choosing versions, and write minimum versions as "current LTS" rather than a fixed number from memory.

### R-05: Planning surfaced 22 questions the spec didn't answer
- **Date:** 2026-10-25
- **Found by:** planner (an agent with only SPEC v1.1 and AGENTS.md)
- **Stage:** plan
- **Requirement(s):** REQ-NFR-05, REQ-CI-01, REQ-UI-07, REQ-ING-10, and others (PLAN §7.1)
- **What happened:** Turning the spec into tasks exposed 22 gaps (PQ-01 to PQ-22). The most important: REQ-NFR-05 and REQ-CI-01 together would keep CI red until the very last test existed. Others included how the dashboard sends the write token, cross-origin requests, and timestamp formats.
- **Root cause:** The spec described the finished product, not how it would be built step by step. Two requirements that were each correct conflicted during development.
- **Fix:** PQ-01 became SPEC v1.2 (pending placeholders, decision D-14). PQ-02 and PQ-21 were decided in the plan. The rest are answered before their tasks start.
- **Lesson:** Plan against the spec before approving it fully. Ask "can every PR pass CI on the way there?", not just "is the end state right?"

### R-04: An independent review found 24 issues in a "finished" spec
- **Date:** 2026-10-25
- **Found by:** spec reviewer (an agent with no project context)
- **Stage:** spec
- **Requirement(s):** many; see SPEC v1.0 changelog
- **What happened:** A fresh reviewer read only SPEC v0.2 and found 5 high, 14 medium, and 5 low issues. These included random test data that would pass only about 55% of the time, a paginated CI quarantine list, an hourly recompute that could serve stale numbers, and quarantine endpoints with no token.
- **Root cause:** The author read the spec knowing what was *meant*; the reviewer read only what was *written*.
- **Fix:** SPEC v1.0 (decisions D-08 to D-12, plus clarified wording throughout).
- **Lesson:** Always run a cold review before approving a spec. Ask the reviewer to check the maths, not just the wording.

### R-03: A failure with no re-run fit no status
- **Date:** 2026-10-25
- **Found by:** author
- **Stage:** spec
- **Requirement(s):** REQ-CLS-04, REQ-STA-07
- **What happened:** While writing the status rules, a test that fails once with no re-run was neither flaky nor broken, and fell silently into `stable`.
- **Root cause:** The statuses were designed around the cases we expected (re-run or consistently failing), not every combination of results.
- **Fix:** Decision D-03, unconfirmed failures (SPEC v0.2).
- **Lesson:** For any classification, list every possible combination of inputs and check that each one has exactly one outcome.

### R-02: A planted test's flaky period fell outside the window
- **Date:** 2026-10-25
- **Found by:** author
- **Stage:** spec
- **Requirement(s):** REQ-SEED-05
- **What happened:** `orders > exports csv` was planned as "30% flaky for 30 days, then fixed" in a 60-day history. The flaky period ended exactly where the 30-day window began, so its expected "high 30-day rate" would have been 0%.
- **Root cause:** Expected results were written from intuition, not worked out against the window definitions.
- **Fix:** Fixed 10 days before the end instead (SPEC v0.1).
- **Lesson:** Calculate every expected value in the spec against the actual window boundaries.

### R-01: "Fails 40% of attempts" doesn't give a 40% flake rate
- **Date:** 2026-10-25
- **Found by:** author
- **Stage:** spec
- **Requirement(s):** REQ-SEED-04
- **What happened:** The README planted flakiness as "fails 40% of attempts". With a retry that can also fail, the commit is flaky only if attempt 1 fails *and* attempt 2 passes: 0.4 × 0.6 = 24%, not 40%.
- **Root cause:** The planted behavior was described per attempt, but the metric is per commit.
- **Fix:** Plant flakiness per commit (SPEC v0.1), later as exact counts (D-08).
- **Lesson:** Describe planted data in the same unit as the metric that measures it.
