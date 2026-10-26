// npm run db:migrate: creates or upgrades the database at DATABASE_PATH.
import { databasePathFromEnv, migrate, openDb } from "../db/open.js";

const file = databasePathFromEnv(process.env);
const db = openDb(file);
const applied = migrate(db);
db.close();
console.log(
  applied.length > 0
    ? `db:migrate: applied migration(s) ${applied.join(", ")} to ${file}`
    : `db:migrate: ${file} is up to date`,
);
