// Database helpers for API tests (PLAN §3.7).
//
//   createTestDb()  a fresh, migrated in-memory database; use one per test
//   tmpDbPath()     a path to a new file database in the OS temp folder (for CLI and startup tests)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { migrate, openDb, type Db } from "../../src/db/open.js";

export function createTestDb(): Db {
  const db = openDb(":memory:");
  migrate(db);
  return db;
}

export function tmpDbPath(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "flakewatch-")), "test.db");
}
