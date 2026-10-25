# AGENTS.md

Standing instructions for **every AI coding agent** (and human contributor) working in this repository. Read this file in full before starting any task.

---

## 1. What this project is

**flakewatch** detects, ranks, and quarantines flaky tests from CI results. It ingests JUnit XML, flags tests that fail and pass on the same commit, and shows them in a React dashboard backed by a Node.js REST API. Synthetic data for a fictional app, **ShopLite**, is used to develop and verify it.

| Document | Role |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | **The source of truth for behavior.** Every requirement has an ID such as `REQ-DET-01`. |
| [`docs/PLAN.md`](docs/PLAN.md) | The task breakdown, shared interfaces, and order of work. Your task comes from here. |
| [`README.md`](README.md) | Overview for humans. It follows the spec, not the other way round. |
| [`docs/RETRO.md`](docs/RETRO.md) | Log of spec gaps and agent mistakes, used for the retrospective. |
| [`docs/PRESENTATION-QA.md`](docs/PRESENTATION-QA.md) | Answers for presentations. Keep it in sync with decisions. |

---

## 2. The golden rules

1. **The spec decides.** Read the requirements your task covers in `docs/SPEC.md` before writing anything. Implement exactly what they say: no more, no less.
2. **Never guess.** If the spec is silent, ambiguous, or contradicts itself, **stop and ask**. Add an open question to SPEC §15 (`Q-NN`) in your PR, and describe it in the PR. Don't invent behavior. (SPEC §14, rule 5.)
3. **Never change behavior without a spec change.** Don't edit `docs/SPEC.md` to make your code pass. Spec changes are separate, human-approved pull requests.
4. **Tests are the definition of done,** not your own judgement. A task is done when its REQ tests pass, `npm run spec:check` passes, and lint is clean.
5. **Stay inside your task.** Change only the files your task needs. If you notice an unrelated problem, mention it in the PR instead of fixing it.
6. **Humans merge.** Open a pull request. Never merge it yourself, never push to `main`, and never force-push a branch someone else is using.

---

## 3. Workflow for a task

Tasks come from `docs/PLAN.md`. Most are a **pair**: a test writer stage (`T-nna`) and an implementer stage (`T-nnb`) that share **one branch and one pull request** (PLAN §2.2).

1. **Read** this file, the task in `docs/PLAN.md`, and every requirement ID it lists.
2. **Test writer:** create the branch from the latest `main` (naming in [§7](#7-git-and-pull-requests)). Write the failing tests first. Every test covering a requirement starts its name with the ID:
   ```ts
   it("REQ-DET-01: marks fail-then-pass on the same commit as flaky", () => { /* ... */ });
   ```
   Delete the pending placeholder files for the IDs you now cover ([§8](#8-testing-rules)). Commit as `test: …` and open a **draft** PR.
3. **Human:** reviews the tests only, then adds the label `tests-approved` and notes the approved commit SHA.
4. **Implementer:** add commits to the **same branch** until every check passes. Never change a test file from step 2. If you think a test is wrong, stop and say so in the PR.
5. **Run the checks** in [§5](#5-commands) and fix every failure.
6. **Mark the PR ready for review** and complete the template, listing every requirement ID it covers. A human reviews and merges.
7. **If anything in the spec was unclear,** even if you worked it out, add an entry to `docs/RETRO.md`.

Single-role tasks (scaffold, workflows, close-out, and so on) follow the same steps in one stage.

---

## 4. Agent roles

Each task names one role. Behave only as that role.

| Role | Input | Output | Must not |
|---|---|---|---|
| **Spec reviewer** | `docs/SPEC.md` only | A list of gaps, ambiguities, and contradictions, with suggested wording | Edit the spec or write code |
| **Planner** | The approved spec | `docs/PLAN.md`: tasks, order, interfaces, and requirement IDs per task | Write implementation code |
| **Test writer** | Spec + plan + task | Failing tests named by REQ-ID, plus fixtures | Implement features to make the tests pass |
| **Implementer** | One task + its tests | Code that makes those tests pass | Weaken, skip, or delete tests; edit the spec |
| **Code reviewer** | A PR + the spec | Review comments: spec violations, missing tests, risks | Push commits to the PR |

If a task seems to need a second role (for example, an implementer finds a test is wrong), stop and say so in the PR instead of switching roles.

---

## 5. Commands

Run these from the repo root. Commands marked *(after scaffold)* exist once the `chore/scaffold` task is merged.

| Command | When |
|---|---|
| `npm install` | After cloning or when dependencies change |
| `npm run lint` | Before every commit |
| `npm test` | Before every commit; must pass |
| `npm run spec:check` | Before opening a PR; must pass. Pending placeholders are allowed while v1 is built *(after scaffold)* |
| `npm run spec:check -- --strict` | Fails on pending placeholders too; must pass for v1 to be complete *(after scaffold)* |
| `npm run test:e2e` | When the dashboard or the API contract changes *(after scaffold)* |
| `npm run seed` | Load ShopLite with the fixed end date, for tests *(after the seed task)* |
| `npm run seed:demo` | Load ShopLite ending today, for viewing the dashboard *(after the seed task)* |

---

## 6. Code standards

### General
- **TypeScript strict mode everywhere.** No `any`. Use `unknown` and narrow it. No `@ts-ignore`; use `@ts-expect-error` with a reason only if there's no alternative.
- **Shared contracts live in `packages/shared`.** API request and response types, status names, and error codes are defined once there and imported by both the API and the dashboard. Never duplicate them.
- **Names follow the spec.** Use the spec's exact terms in code: `flakeRate`, `flakyCommits`, `commitsRun`, `failedAttempts`, `unconfirmedFailures`, `quarantineSource`, `attempt`, `scope`, `window`.
- **Small, pure functions** for rules (the flake rule, statuses, stats). Keep them free of I/O so they can be unit-tested directly.
- **Validate at the edges** with Zod: request bodies, query parameters, and environment variables. Trust nothing from outside.

### Time
- **Never call `Date.now()` or `new Date()` for "now"** outside `apps/api/src/clock.ts`. Every request reads `now` once from the clock and passes it down (REQ-STA-06, REQ-NFR-04).
- Store and compare all times in **UTC**.

### API
- Follow the response shapes and error format in SPEC §9 exactly, including field names and status codes.
- Upload checks run in the order 401 → 413 → 400 → 422 (REQ-ING-14).
- Never log report contents or tokens (REQ-NFR-03).

### Dashboard
- Every status badge has a **text label**. Color is never the only signal (REQ-UI-06).
- All filter state lives in the URL (REQ-UI-03).
- Every interactive element must be keyboard-usable and have an accessible name (REQ-UI-09).

### Dependencies
- **Don't add a dependency** unless the task needs it. Prefer the stack in the README. These are **pre-approved**: `multer` or `busboy`, `tsx`, `yaml`, `concurrently`, `jsdom`, `@testing-library/user-event`, `axe-core`, `@axe-core/playwright`, and ESLint/Prettier packages. Anything else needs a reason in the PR.
- Never commit secrets, tokens, `.env` files, or database files.

---

## 7. Git and pull requests

### Branches
One short-lived branch per task, from the latest `main`:

| Prefix | For |
|---|---|
| `feat/` | New behavior, including its tests (`feat/detector`) |
| `fix/` | Bug fixes |
| `test/` | Tasks that only add tests (`test/shoplite-acceptance`) |
| `docs/` | Documentation and spec (`docs/plan`) |
| `chore/` | Tooling, config, and scaffolding (`chore/scaffold`) |
| `ci/` | GitHub Actions workflows |

### Commits
- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`, `test: …`, `docs: …`, `chore: …`, `ci: …`.
- Mention requirement IDs in the body when relevant (e.g. `Covers REQ-DET-01, REQ-DET-02`).
- AI agents add a `Co-Authored-By:` line identifying themselves.

### Pull requests
- Keep them **small**: one task, ideally under about 400 changed lines excluding generated files and fixtures.
- Fill in the template (`.github/pull_request_template.md`) completely, including **Requirements covered** and **Spec questions**.
- CI must be green before review.

---

## 8. Testing rules

- **Name tests by requirement ID** (see [§3](#3-workflow-for-a-task)). `npm run spec:check` enforces this (REQ-NFR-05).
- **Pending placeholders:** until a requirement has real tests, it's covered by a placeholder `it.todo("REQ-XXX-NN: pending")` in `test/traceability/pending/`. When you write the real tests for an ID, delete its placeholder in the same PR. Never add a placeholder for an ID that already has real tests.
- **Deterministic only.** No real network calls, no real clock, and no randomness without a fixed seed. Set `FLAKEWATCH_NOW` in any test that depends on time.
- **ShopLite tests** seed with default options and set `FLAKEWATCH_NOW=2026-10-24T00:00:00Z` (the default `--end`). Assert the **exact** values in SPEC §12, not approximate ranges.
- **Isolated databases:** each integration test uses its own temporary SQLite file or in-memory database.
- **Never weaken a test to make it pass.** If you believe a test is wrong, explain why in the PR and leave it failing for a human to decide.
- It would be ironic for this project to have flaky tests. If a test fails intermittently, treat it as a bug.

---

## 9. When you are stuck or unsure

| Situation | What to do |
|---|---|
| The spec doesn't cover a case | Add `Q-NN` to SPEC §15 in your PR, describe it in the PR, and implement nothing for that case |
| The spec and a test disagree | Follow the spec. Flag the test in the PR |
| Two requirements contradict each other | Stop. Describe the conflict in the PR |
| The task needs files outside its scope | Explain why in the PR before changing them |
| A check fails and you can't fix it | Leave it failing and explain what you tried. Never disable the check |

In every case, add a short entry to `docs/RETRO.md`.

---

## 10. Definition of done

A task is done only when **all** of these are true:

- [ ] Every requirement the task lists has at least one test named with its ID
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run spec:check` passes *(after scaffold)*
- [ ] No unrelated files changed
- [ ] The PR template is complete, including the requirements covered and any spec questions
- [ ] The README or Q&A is updated if user-visible behavior or commands changed
- [ ] Any spec gap you hit is logged in `docs/RETRO.md`
