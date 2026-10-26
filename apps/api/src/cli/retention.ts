// npm run retention: deletes old attempts now and prints how many (REQ-RET-03).
import { envClock } from "../clock.js";
import { ConfigError, loadConfig } from "../config.js";
import { databasePathFromEnv, migrate, openDb } from "../db/open.js";
import { runRetention } from "../retention.js";

try {
  const config = loadConfig(process.env);
  const db = openDb(databasePathFromEnv(process.env));
  migrate(db);
  const result = runRetention(db, envClock(process.env).now(), config.retentionDays);
  db.close();
  console.log(
    `retention: deleted ${result.attemptsDeleted} attempts (${result.resultsDeleted} results, ${result.runsDeleted} runs) older than ${config.retentionDays} days`,
  );
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`retention: ${error.message}`);
  process.exitCode = 1;
}
