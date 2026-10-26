// npm run db:migrate: creates or upgrades the database at DATABASE_PATH.
import { ConfigError } from "../config.js";
import { databasePathFromEnv, migrate, openDb } from "../db/open.js";

try {
  const file = databasePathFromEnv(process.env);
  const db = openDb(file);
  const applied = migrate(db);
  db.close();
  console.log(
    applied.length > 0
      ? `db:migrate: applied migration(s) ${applied.join(", ")} to ${file}`
      : `db:migrate: ${file} is up to date`,
  );
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`db:migrate: ${error.message}`);
  process.exitCode = 1;
}
