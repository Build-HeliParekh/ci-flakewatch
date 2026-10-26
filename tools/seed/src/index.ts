// ShopLite synthetic data generator (SPEC §12).
export { catalog, MODULES, PLANTED } from "./catalog.js";
export { toJUnitXml } from "./junit-writer.js";
export { parseArgs, type CliOptions } from "./options.js";
export { fileNameOf, manifestOf, writeOutput, type ManifestEntry } from "./output.js";
export { createRng, roundHalfUp, type Rng } from "./rng.js";
export {
  DEFAULT_OPTIONS,
  FEATURE_BRANCHES,
  generateCommits,
  generateScenario,
  plantFlakiness,
  REPO,
  type GeneratedAttempt,
  type GeneratedCase,
  type GeneratedCommit,
  type SeedOptions,
} from "./scenario.js";
export { uploadAll, type UploadReport } from "./upload.js";
