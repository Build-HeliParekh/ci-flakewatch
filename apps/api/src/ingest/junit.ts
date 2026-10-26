// Parses a JUnit XML report into test case results (SPEC REQ-ING-02 to ING-06, ING-08).
// Pure: no I/O and no clock, so the rules can be unit-tested directly.
import type { ResultStatus } from "@flakewatch/shared";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface ParsedTestCase {
  /** 1-based position of the `<testcase>` in the whole report, in document order (PQ-19). */
  position: number;
  file: string;
  classname: string;
  name: string;
  status: ResultStatus;
  durationMs: number;
  /** The first `<failure>`/`<error>` message for failed results; otherwise null (PQ-12d). */
  message: string | null;
}

export type ParseResult = { ok: true; cases: ParsedTestCase[] } | { ok: false; message: string };

/** Longest stored error message, in code points (REQ-ING-05, SPEC §2 conventions). */
export const MAX_MESSAGE_CODE_POINTS = 2000;

/** An element in fast-xml-parser's `preserveOrder` output. */
type OrderedNode = Record<string, unknown>;

const ATTRIBUTES = ":@";
const CDATA_OR_COMMENT = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->/g;
const BARE_AMPERSAND = /&(?!(?:[A-Za-z_][\w.-]*|#[0-9]+|#x[0-9A-Fa-f]+);)/;
const TEXT = "#text";

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
});

export function parseJUnit(xml: string): ParseResult {
  const source = xml.replace(/^\uFEFF/, "");
  if (source.trim() === "") return invalid("The report is empty.");

  const validation = XMLValidator.validate(source);
  if (validation !== true) {
    return invalid(
      `The report isn't well-formed XML: ${validation.err.msg} (line ${validation.err.line}).`,
    );
  }

  // The validator accepts a bare "&"; well-formed XML doesn't (REQ-ING-08).
  if (BARE_AMPERSAND.test(source.replace(CDATA_OR_COMMENT, ""))) {
    return invalid('The report isn\'t well-formed XML: "&" must be written as "&amp;".');
  }

  const roots = elements(parser.parse(source) as unknown);
  const [root] = roots;
  if (roots.length !== 1 || !root) return invalid("The report must have exactly one root element.");
  const rootName = tagOf(root);
  if (rootName !== "testsuite" && rootName !== "testsuites") {
    return invalid(`The report's root must be <testsuite> or <testsuites>, not <${rootName}>.`);
  }

  const cases: ParsedTestCase[] = [];
  let problem: string | null = null;

  const visit = (node: OrderedNode, suite: Record<string, string> | null) => {
    for (const child of elements(node[tagOf(node)])) {
      if (problem) return;
      const tag = tagOf(child);
      if (tag === "testsuite") visit(child, attributesOf(child));
      else if (tag === "testsuites") visit(child, suite);
      else if (tag === "testcase") {
        const position = cases.length + 1;
        const parsed = readTestCase(child, suite, position);
        if (typeof parsed === "string") problem = parsed;
        else cases.push(parsed);
      }
    }
  };
  visit(root, rootName === "testsuite" ? attributesOf(root) : null);

  if (problem) return invalid(problem);
  if (cases.length === 0) return invalid("The report contains no <testcase> elements.");
  return { ok: true, cases };
}

function readTestCase(
  node: OrderedNode,
  suite: Record<string, string> | null,
  position: number,
): ParsedTestCase | string {
  const attrs = attributesOf(node);
  const name = attrs.name;
  if (name === undefined || name.trim() === "") return `Test case ${position} has no name.`;

  const children = elements(node.testcase);
  const failure = children.find((child) => ["failure", "error"].includes(tagOf(child)));
  const skipped = children.some((child) => tagOf(child) === "skipped");
  const status: ResultStatus = failure ? "failed" : skipped ? "skipped" : "passed";

  return {
    position,
    file: attrs.file ?? suite?.file ?? "",
    classname: attrs.classname ?? suite?.name ?? "",
    name,
    status,
    durationMs: durationMsFromTime(attrs.time),
    message: failure ? messageOf(failure) : null,
  };
}

function messageOf(node: OrderedNode): string | null {
  const attribute = attributesOf(node).message;
  if (attribute !== undefined && attribute.trim() !== "") return truncateMessage(attribute);
  const text = textOf(node).trim();
  return text === "" ? null : truncateMessage(text);
}

/** Seconds as written in `time` → whole milliseconds, rounded half up; 0 if missing or invalid. */
export function durationMsFromTime(time: string | undefined): number {
  if (time === undefined) return 0;
  const text = time.trim();
  if (text === "") return 0;
  // Plain decimals are rounded from their digits, so floating point can't move a half.
  const decimal = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (decimal && (decimal[1] !== "" || (decimal[2] ?? "") !== "")) {
    const whole = Number(decimal[1] || "0");
    const fraction = (decimal[2] ?? "").padEnd(4, "0");
    const ms = whole * 1000 + Number(fraction.slice(0, 3));
    return Number(fraction[3]) >= 5 ? ms + 1 : ms;
  }
  const seconds = Number(text);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.floor(seconds * 1000 + 0.5);
}

/** The first `maxCodePoints` code points of `message`. */
export function truncateMessage(message: string, maxCodePoints = MAX_MESSAGE_CODE_POINTS): string {
  const codePoints = Array.from(message);
  return codePoints.length <= maxCodePoints ? message : codePoints.slice(0, maxCodePoints).join("");
}

function invalid(message: string): ParseResult {
  return { ok: false, message };
}

function elements(value: unknown): OrderedNode[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is OrderedNode =>
      typeof item === "object" && item !== null && tagOf(item as OrderedNode) !== "",
  );
}

function tagOf(node: OrderedNode): string {
  return (
    Object.keys(node).find((key) => key !== ATTRIBUTES && key !== TEXT && !key.startsWith("?")) ??
    ""
  );
}

function attributesOf(node: OrderedNode): Record<string, string> {
  const attrs = node[ATTRIBUTES];
  if (typeof attrs !== "object" || attrs === null) return {};
  return Object.fromEntries(
    Object.entries(attrs).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function textOf(node: OrderedNode): string {
  const children = node[tagOf(node)];
  if (!Array.isArray(children)) return "";
  return children
    .map((child: unknown) => {
      if (typeof child !== "object" || child === null) return "";
      const text = (child as OrderedNode)[TEXT];
      return typeof text === "string" || typeof text === "number"
        ? String(text)
        : textOf(child as OrderedNode);
    })
    .join("");
}
