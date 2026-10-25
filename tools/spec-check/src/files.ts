// Finds test files and writes pending placeholders.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceFile } from "./check.js";

const TEST_FILE = /\.(test|spec|bench)\.tsx?$/;
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "reports",
  "coverage",
  "playwright-report",
  "test-results",
]);

/** Pending placeholders live here, one file per requirement (PLAN §3.7). */
export const PENDING_DIR = path.join("test", "traceability", "pending");

export async function findTestFiles(root: string): Promise<SourceFile[]> {
  const found: SourceFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) await walk(full);
      } else if (TEST_FILE.test(entry.name)) {
        const relative = path.relative(root, full).split(path.sep).join("/");
        found.push({ path: relative, source: await readFile(full, "utf8") });
      }
    }
  };
  await walk(root);
  return found;
}

export function placeholderSource(id: string): string {
  return `import { it } from "vitest";\n\nit.todo("${id}: pending");\n`;
}

/** Writes a placeholder for each ID and returns the paths written, relative to `root`. */
export async function writePlaceholders(root: string, ids: readonly string[]): Promise<string[]> {
  const dir = path.join(root, PENDING_DIR);
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const id of ids) {
    await writeFile(path.join(dir, `${id}.test.ts`), placeholderSource(id), "utf8");
    written.push(`${PENDING_DIR.split(path.sep).join("/")}/${id}.test.ts`);
  }
  return written;
}
