import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import base from "@medagenda/config/eslint";
import globals from "globals";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  ...base,
  ...compat.extends("next/core-web-vitals"),
  { languageOptions: { globals: globals.browser } },
];

export default config;
