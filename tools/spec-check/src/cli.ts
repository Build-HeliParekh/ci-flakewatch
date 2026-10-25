// npm run spec:check [-- --strict] [-- --write-pending]
//
//   --spec <file>      Spec to read (default: docs/SPEC.md)
//   --root <dir>       Folder to search for tests (default: current folder)
//   --strict           Also fail when any requirement is only pending
//   --write-pending    Write a placeholder test for every missing requirement, then re-check
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkTraceability, exitCode, formatReport } from "./check.js";
import { findTestFiles, writePlaceholders } from "./files.js";

export interface CliOptions {
  spec: string;
  root: string;
  strict: boolean;
  writePending: boolean;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    spec: "docs/SPEC.md",
    root: ".",
    strict: false,
    writePending: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--strict") options.strict = true;
    else if (arg === "--write-pending") options.writePending = true;
    else if (arg === "--spec" || arg === "--root") {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} needs a value`);
      if (arg === "--spec") options.spec = value;
      else options.root = value;
    } else {
      throw new Error(`Unknown option: ${String(arg)}`);
    }
  }
  return options;
}

export async function runCli(
  argv: readonly string[],
  log: (text: string) => void = (text) => console.log(text),
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    log(`spec:check: ${(error as Error).message}`);
    return 2;
  }

  const root = path.resolve(options.root);
  const spec = await readFile(path.resolve(root, options.spec), "utf8");
  let result = checkTraceability(spec, await findTestFiles(root));

  if (options.writePending && result.missing.length > 0) {
    const written = await writePlaceholders(root, result.missing);
    log(`spec:check: wrote ${written.length} placeholder(s) to test/traceability/pending/`);
    result = checkTraceability(spec, await findTestFiles(root));
  }

  log(formatReport(result, options.strict));
  return exitCode(result, options.strict);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error);
      process.exitCode = 2;
    },
  );
}
