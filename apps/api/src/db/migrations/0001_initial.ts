// Migration 1: the initial schema (PLAN §3.6). Times are UTC epoch milliseconds.
export const version = 1;

export const sql = `
CREATE TABLE runs (
  id         INTEGER PRIMARY KEY,
  repo       TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  commit_sha TEXT NOT NULL CHECK (length(commit_sha) = 40 AND commit_sha NOT GLOB '*[^0-9a-f]*'),
  branch     TEXT NOT NULL CHECK (length(branch) BETWEEN 1 AND 255 AND branch <> '*'),
  UNIQUE (repo, run_id)
);
CREATE INDEX runs_repo_commit ON runs (repo, commit_sha);

CREATE TABLE attempts (
  id            INTEGER PRIMARY KEY,
  run_pk        INTEGER NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  attempt       INTEGER NOT NULL CHECK (attempt >= 1),
  started_at_ms INTEGER NOT NULL,
  UNIQUE (run_pk, attempt)
);
CREATE INDEX attempts_started_at ON attempts (started_at_ms);

CREATE TABLE test_cases (
  id        INTEGER PRIMARY KEY,
  repo      TEXT NOT NULL,
  file      TEXT NOT NULL,
  classname TEXT NOT NULL,
  name      TEXT NOT NULL CHECK (length(name) > 0),
  UNIQUE (repo, file, classname, name)
);
CREATE INDEX test_cases_repo_name ON test_cases (repo, name);

CREATE TABLE results (
  id           INTEGER PRIMARY KEY,
  attempt_pk   INTEGER NOT NULL REFERENCES attempts (id) ON DELETE CASCADE,
  test_case_id INTEGER NOT NULL REFERENCES test_cases (id),
  position     INTEGER NOT NULL CHECK (position >= 1),
  status       TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
  duration_ms  INTEGER NOT NULL CHECK (duration_ms >= 0),
  message      TEXT
);
CREATE INDEX results_test_case_attempt ON results (test_case_id, attempt_pk);
CREATE INDEX results_attempt ON results (attempt_pk);

CREATE TABLE manual_quarantines (
  test_case_id INTEGER PRIMARY KEY REFERENCES test_cases (id),
  reason       TEXT NOT NULL,
  at_ms        INTEGER NOT NULL
);
`;
