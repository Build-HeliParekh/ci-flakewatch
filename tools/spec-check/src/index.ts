// Requirement traceability checker (REQ-NFR-05, PLAN §3.5 and §3.7).
export { extractSpecIds, leadingIds, allIds, REQ_ID } from "./ids.js";
export { extractTestTitles, type TestTitle, type TitleKind } from "./titles.js";
export {
  checkTraceability,
  exitCode,
  formatReport,
  type SourceFile,
  type SpecCheckResult,
  type UnknownReference,
} from "./check.js";
export { findTestFiles, placeholderSource, writePlaceholders, PENDING_DIR } from "./files.js";
export { parseArgs, runCli, type CliOptions } from "./cli.js";
