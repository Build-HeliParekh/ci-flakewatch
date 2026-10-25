// ESLint flat config. The rules marked "convention" protect rules from AGENTS.md §6 and §8.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const noFocusedTests = [
  { object: "it", property: "only", message: "Remove .only before committing (AGENTS.md §8)." },
  { object: "test", property: "only", message: "Remove .only before committing (AGENTS.md §8)." },
  {
    object: "describe",
    property: "only",
    message: "Remove .only before committing (AGENTS.md §8).",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "reports/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "data/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": "allow-with-description" },
      ],
      // Convention: no focused tests.
      "no-restricted-properties": ["error", ...noFocusedTests],
      // Convention: only the clock module reads "now" (REQ-STA-06, REQ-NFR-04).
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Read the time from the clock module (apps/api/src/clock.ts), not Date.now().",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Read the time from the clock module (apps/api/src/clock.ts), not new Date().",
        },
      ],
    },
  },
  {
    // The two places allowed to read the system time (PLAN §3.7).
    files: ["apps/api/src/clock.ts", "tools/seed/src/cli.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Convention: the generator must be deterministic (REQ-SEED-01).
    files: ["tools/seed/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...noFocusedTests,
        { object: "Math", property: "random", message: "Use createRng(seed) (REQ-SEED-01)." },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
