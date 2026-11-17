import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Shared flat ESLint preset. Each app/package imports it from "@medagenda/config/eslint".
const base = tseslint.config(
  {
    ignores: [
      "dist/**",
      ".next/**",
      ".next-e2e/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);

export default base;
