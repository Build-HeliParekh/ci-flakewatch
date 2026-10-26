// Starting the server: config, database, app, port (PLAN §3.4, REQ-RET-02, REQ-NFR-06).
import { pathToFileURL } from "node:url";

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Validates the configuration (throws `ConfigError` naming the variable), opens and migrates
 * the database at DATABASE_PATH, and listens on PORT.
 */
export async function startServer(env: Record<string, string | undefined>): Promise<RunningServer> {
  throw new Error(
    `startServer is not implemented yet (T-07b); ${Object.keys(env).length} variable(s)`,
  );
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
