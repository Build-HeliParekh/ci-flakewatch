// npm run db:reset: deletes the database at DATABASE_PATH and creates it again, empty.
import { rmSync } from "node:fs";
import { ConfigError } from "../config.js";
import { databasePathFromEnv, migrate, openDb } from "../db/open.js";

try {
  const file = databasePathFromEnv(process.env);
  if (file !== ":memory:") {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${file}${suffix}`, { force: true });
  }
  const db = openDb(file);
  migrate(db);
  db.close();
  console.log(`db:reset: recreated ${file}`);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`db:reset: ${error.message}`);
  process.exitCode = 1;
}
