import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "app/**/*.test.{js,ts,jsx,tsx}",
      "components/**/*.test.{js,ts,jsx,tsx}",
      "lib/**/*.test.{js,ts,jsx,tsx}",
      "lib/**/tests/**/*.test.{js,ts,jsx,tsx}",
      "lib/**/__tests__/**/*.test.{js,ts,jsx,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",

        "vitest.config.ts",
        "vitest.setup.ts",
        "next.config.ts",
        "eslint.config.mjs",
        "postcss.config.mjs",
        "**/types.ts",
        "**/index.ts",
        "scripts/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
