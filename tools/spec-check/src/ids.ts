// Requirement IDs in docs/SPEC.md (REQ-NFR-05).

/** Matches one requirement ID, e.g. `REQ-DET-01`. */
export const REQ_ID = /REQ-[A-Z]+-\d+/g;

const HEADING = /^#### (REQ-[A-Z]+-\d+)\s*(.*)$/;

/**
 * Collects requirement IDs from `#### REQ-<AREA>-<NN>` headings. A requirement is withdrawn when
 * its heading contains the word "Withdrawn", or the first non-empty line after it **starts** with
 * it (e.g. `**Withdrawn.** Replaced by ...`). A body that merely mentions the word, like
 * REQ-NFR-05's "that is not **Withdrawn**", doesn't count.
 */
export function extractSpecIds(markdown: string): { active: string[]; withdrawn: string[] } {
  const lines = markdown.split(/\r?\n/);
  const active: string[] = [];
  const withdrawn: string[] = [];

  lines.forEach((line, index) => {
    const match = HEADING.exec(line);
    if (!match) return;
    const id = match[1] as string;
    const firstBodyLine = lines.slice(index + 1).find((next) => next.trim() !== "") ?? "";
    const isWithdrawn =
      /\bwithdrawn\b/i.test(match[2] ?? "") || /^[\s*_]*withdrawn\b/i.test(firstBodyLine);
    (isWithdrawn ? withdrawn : active).push(id);
  });

  return { active: unique(active), withdrawn: unique(withdrawn) };
}

/** The IDs a test title claims to cover: those at the start, before the first colon. */
export function leadingIds(title: string): string[] {
  const match = /^\s*(REQ-[A-Z]+-\d+(?:\s*,\s*REQ-[A-Z]+-\d+)*)\s*:/.exec(title);
  if (!match) return [];
  return unique((match[1] as string).match(REQ_ID) ?? []);
}

/** Every ID mentioned anywhere in a test title. */
export function allIds(title: string): string[] {
  return unique(title.match(REQ_ID) ?? []);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
