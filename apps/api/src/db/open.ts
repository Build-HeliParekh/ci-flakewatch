// Opening the SQLite database and applying migrations (PLAN §3.6).
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadConfig } from "../config.js";
import { MIGRATIONS, type Migration } from "./migrations/index.js";

export type Db = Database.Database;

/**
 * Opens (and creates, if needed) the database at `file`, or an in-memory database for
 * `":memory:"`. Creates the parent folder, enables foreign keys, and uses WAL for files.
 * Does not migrate: call `migrate(db)` next.
 */
export function openDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("foreign_keys = ON");
  if (file !== ":memory:") db.pragma("journal_mode = WAL");
  return db;
}

/** Applies every migration not yet recorded in `schema_migrations`. Safe to run repeatedly. */
export function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): number[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at_ms INTEGER NOT NULL)",
  );
  const applied = new Set(
    db
      .prepare<[], { version: number }>("SELECT version FROM schema_migrations")
      .all()
      .map((row) => row.version),
  );
  const record = db.prepare(
    "INSERT INTO schema_migrations (version, applied_at_ms) VALUES (?, CAST(unixepoch('subsec') * 1000 AS INTEGER))",
  );

  const newlyApplied: number[] = [];
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      record.run(migration.version);
    })();
    newlyApplied.push(migration.version);
  }
  return newlyApplied;
}

/**
 * The database path from the validated configuration (`DATABASE_PATH`, default
 * `./data/flakewatch.db`), resolved against the folder npm was started from, so
 * `npm run db:migrate` at the repo root uses the root `data/`. Throws `ConfigError` if any
 * §13.2 variable is invalid (REQ-NFR-06).
 */
export function databasePathFromEnv(env: Record<string, string | undefined>): string {
  const file = loadConfig(env).databasePath;
  return file === ":memory:" ? file : path.resolve(env["INIT_CWD"] ?? process.cwd(), file);
}
