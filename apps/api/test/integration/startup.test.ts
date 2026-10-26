// Starting the server: config errors stop it with the variable named (REQ-RET-02, REQ-NFR-06).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { ConfigError } from "../../src/config.js";
import { startServer } from "../../src/server.js";
import { tmpDbPath } from "../helpers/db.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SERVER = fileURLToPath(new URL("../../src/server.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../../../../node_modules/.bin/tsx", import.meta.url));

/** A port that was free a moment ago. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address ? resolve(address.port) : reject(),
      );
    });
  });
}

/** Runs the server entry point as a separate process and returns its exit code and stderr. */
async function runServerProcess(
  env: Record<string, string>,
): Promise<{ code: number; stderr: string }> {
  try {
    await promisify(execFile)(TSX, [SERVER], {
      cwd: REPO_ROOT,
      env: { PATH: process.env["PATH"] ?? "", DATABASE_PATH: tmpDbPath(), ...env },
      timeout: 20_000,
    });
    return { code: 0, stderr: "" };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    return { code: failure.code ?? -1, stderr: failure.stderr ?? "" };
  }
}

describe("startServer", () => {
  it("REQ-RET-02: RETENTION_DAYS=30 stops startup with a ConfigError naming RETENTION_DAYS", async () => {
    const error = await startServer({ RETENTION_DAYS: "30", DATABASE_PATH: tmpDbPath() }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).variable).toBe("RETENTION_DAYS");
  });

  it("REQ-NFR-06: an invalid value stops startup before the database is created", async () => {
    const file = tmpDbPath();
    const error = await startServer({ PORT: "abc", DATABASE_PATH: file }).catch((e: unknown) => e);
    expect((error as ConfigError).variable).toBe("PORT");
    expect(existsSync(file)).toBe(false);
  });

  it("REQ-NFR-06: with valid settings, creates and migrates the database and serves /health", async () => {
    const file = tmpDbPath();
    const port = await freePort();
    const server = await startServer({ PORT: String(port), DATABASE_PATH: file });
    try {
      expect(server.port).toBe(port);
      expect(existsSync(file)).toBe(true);
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ok" });
    } finally {
      await server.close();
    }
  });
});

describe("the server process", () => {
  it("REQ-RET-02: with RETENTION_DAYS=30, exits non-zero with an error naming RETENTION_DAYS", async () => {
    const result = await runServerProcess({ RETENTION_DAYS: "30" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("RETENTION_DAYS");
  }, 30_000);

  it("REQ-NFR-06: with FLAKEWATCH_NOW=tomorrow, exits non-zero with an error naming FLAKEWATCH_NOW", async () => {
    const result = await runServerProcess({ FLAKEWATCH_NOW: "tomorrow" });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("FLAKEWATCH_NOW");
  }, 30_000);
});
