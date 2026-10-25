// Test titles from test source files, read with the TypeScript compiler API (PLAN §3.7).
import ts from "typescript";

export type TitleKind = "test" | "todo" | "skip";

export interface TestTitle {
  title: string;
  kind: TitleKind;
  line: number;
}

const TEST_FUNCTIONS = new Set(["it", "test", "bench"]);

/**
 * Finds every `it` / `test` / `bench` call whose title is a string literal, including chained
 * forms such as `it.skip`, `it.todo`, `it.concurrent`, and `it.each(table)("title", fn)`.
 * `describe` blocks and titles built from variables or `${}` templates are ignored.
 */
export function extractTestTitles(source: string, fileName: string): TestTitle[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const titles: TestTitle[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const found = asTestCall(node);
      if (found) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
        titles.push({ title: found.title, kind: found.kind, line: line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return titles;
}

function asTestCall(call: ts.CallExpression): { title: string; kind: TitleKind } | null {
  const chain = calleeChain(call.expression);
  if (!chain) return null;
  const [root, ...modifiers] = chain;
  if (!root || !TEST_FUNCTIONS.has(root)) return null;

  // `it.each(table)` returns the real test function, which is called with the title. Skip the
  // inner `it.each(table)` call itself; the outer call (whose callee is a call) is the test.
  if (modifiers.includes("each") && !ts.isCallExpression(call.expression)) return null;

  const first = call.arguments[0];
  if (!first || !(ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) {
    return null;
  }

  const kind: TitleKind = modifiers.includes("todo")
    ? "todo"
    : modifiers.includes("skip")
      ? "skip"
      : "test";
  return { title: first.text, kind };
}

/** `it.concurrent.skip` → ["it", "concurrent", "skip"]; `it.each(t)` → ["it", "each"]. */
function calleeChain(expression: ts.Expression): string[] | null {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) {
    const left = calleeChain(expression.expression);
    return left ? [...left, expression.name.text] : null;
  }
  if (ts.isCallExpression(expression)) return calleeChain(expression.expression);
  return null;
}
