// npm run seed / npm run seed:demo (REQ-SEED-02). The only seed module that reads the clock.
import { parseArgs } from "./options.js";
import { writeOutput } from "./output.js";
import { generateScenario } from "./scenario.js";
import { uploadAll } from "./upload.js";

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2), process.env, () => new Date());
  const attempts = generateScenario(options);
  if (options.out !== undefined) {
    const files = writeOutput(options.out, attempts);
    console.log(`seed: wrote ${files} reports and manifest.json to ${options.out}`);
    return;
  }
  const report = await uploadAll(attempts, { api: options.api, token: options.token });
  console.log(
    `seed: uploaded ${report.attempts} attempts (${report.results} results) in ${(report.elapsedMs / 1000).toFixed(1)} s`,
  );
}

main().catch((error: unknown) => {
  console.error(`seed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
