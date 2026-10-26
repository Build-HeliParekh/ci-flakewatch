// npm run db:reset: deletes the database at DATABASE_PATH and creates it again, empty.
import { rmSync } from "node:fs";
import { databasePathFromEnv, migrate, openDb } from "../db/open.js";

const file = databasePathFromEnv(process.env);
if (file !== ":memory:") {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${file}${suffix}`, { force: true });
}
const db = openDb(file);
migrate(db);
db.close();
console.log(`db:reset: recreated ${file}`);
