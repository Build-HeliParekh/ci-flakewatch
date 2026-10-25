// Compares the spec's requirement IDs with the IDs named in test titles (REQ-NFR-05).
import { allIds, extractSpecIds, leadingIds } from "./ids.js";
import { extractTestTitles } from "./titles.js";

export interface SourceFile {
  path: string;
  source: string;
}

export interface UnknownReference {
  id: string;
  file: string;
  line: number;
}

export interface SpecCheckResult {
  /** Active IDs with no test or placeholder at all. */
  missing: string[];
  /** IDs named in a test title that don't exist in the spec. */
  unknown: UnknownReference[];
  /** Active IDs covered only by `it.todo` placeholders. */
  pending: string[];
  /** Active IDs covered by real tests, with the files that cover them. */
  covered: Map<string, string[]>;
  /** Number of active requirements in the spec. */
  activeCount: number;
}

export function checkTraceability(
  specMarkdown: string,
  files: readonly SourceFile[],
): SpecCheckResult {
  const { active, withdrawn } = extractSpecIds(specMarkdown);
  const known = new Set([...active, ...withdrawn]);
  const coveredBy = new Map<string, Set<string>>();
  const todoIds = new Set<string>();
  const unknown: UnknownReference[] = [];

  for (const file of files) {
    for (const { title, kind, line } of extractTestTitles(file.source, file.path)) {
      for (const id of allIds(title)) {
        if (!known.has(id)) unknown.push({ id, file: file.path, line });
      }
      // Skipped tests never count as coverage.
      if (kind === "skip") continue;
      for (const id of leadingIds(title)) {
        if (kind === "todo") {
          todoIds.add(id);
        } else {
          const set = coveredBy.get(id) ?? new Set<string>();
          set.add(file.path);
          coveredBy.set(id, set);
        }
      }
    }
  }

  const covered = new Map<string, string[]>();
  const pending: string[] = [];
  const missing: string[] = [];
  for (const id of active) {
    const paths = coveredBy.get(id);
    if (paths) covered.set(id, [...paths].sort());
    else if (todoIds.has(id)) pending.push(id);
    else missing.push(id);
  }

  return { missing, unknown, pending, covered, activeCount: active.length };
}

/** Exit code for a result: 1 for missing or unknown IDs, and with `strict` also for pending. */
export function exitCode(result: SpecCheckResult, strict: boolean): 0 | 1 {
  const failed =
    result.missing.length > 0 || result.unknown.length > 0 || (strict && result.pending.length > 0);
  return failed ? 1 : 0;
}

export function formatReport(result: SpecCheckResult, strict: boolean): string {
  const lines = [
    `spec:check: ${result.activeCount} requirements: ${result.covered.size} covered, ` +
      `${result.pending.length} pending, ${result.missing.length} missing, ` +
      `${result.unknown.length} unknown${strict ? " (strict)" : ""}`,
  ];
  if (result.missing.length > 0) {
    lines.push("", "Missing (no test or placeholder):", ...result.missing.map((id) => `  ${id}`));
  }
  if (result.unknown.length > 0) {
    lines.push(
      "",
      "Unknown (named in a test but not in the spec):",
      ...result.unknown.map((u) => `  ${u.id}  ${u.file}:${u.line}`),
    );
  }
  if (result.pending.length > 0) {
    lines.push(
      "",
      strict ? "Pending (not allowed with --strict):" : "Pending (placeholder only):",
      `  ${result.pending.join(", ")}`,
    );
  }
  lines.push("", exitCode(result, strict) === 0 ? "OK" : "FAILED");
  return lines.join("\n");
}
