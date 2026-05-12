import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Additional ignores for Vercel and generated files
    ".vercel/**",
    // Broken script — pre-existing parse error, not part of app
    "scripts/apply-migration.mjs",
  ]),
  // Downgrade TypeScript strict rules to warnings for gradual migration
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Allow @ts-nocheck in test files for pre-existing type errors (monorepo consolidation technical debt)
  // Allow require() in test files — vi.mock() factories must use require() since they run before
  // ES module imports are resolved. vi.hoisted() is preferred but require() is also necessary.
  {
    files: ["**/__tests__/**/*.ts", "**/__tests__/**/*.tsx", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        {
          "ts-nocheck": true,
        },
      ],
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
