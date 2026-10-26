// Starting the server: config, database, app, port (PLAN §3.4, REQ-RET-02, REQ-NFR-06).
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { envClock } from "./clock.js";
import { loadConfig } from "./config.js";
import { databasePathFromEnv, migrate, openDb } from "./db/open.js";
import { createApp } from "./http/app.js";
import { jsonLogger } from "./logger.js";

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Validates the configuration (throws `ConfigError` naming the variable), opens and migrates
 * the database at DATABASE_PATH, and listens on PORT.
 */
export async function startServer(env: Record<string, string | undefined>): Promise<RunningServer> {
  const config = loadConfig(env);
  const db = openDb(databasePathFromEnv(env));
  migrate(db);
  const logger = jsonLogger();
  const app = createApp({ db, config, clock: envClock(env), logger });

  const server = await new Promise<import("node:http").Server>((resolve, reject) => {
    const listening = app.listen(config.port, () => resolve(listening));
    listening.on("error", reject);
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          db.close();
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

// `tsx apps/api/src/server.ts` / `node dist/server.js`: start, or print the config error and exit 1.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  startServer(process.env).then(
    (server) =>
      console.log(JSON.stringify({ level: "info", message: `listening on ${server.port}` })),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
