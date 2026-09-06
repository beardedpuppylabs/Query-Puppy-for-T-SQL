import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".build/**",
      "node_modules/**",
      "tests/fixtures/mssql-stub/extension.cjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/no-confusing-void-expression": "off" },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
  {
    files: ["benchmarks/**/*.ts"],
    rules: {
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        Buffer: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
      },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      "@typescript-eslint/no-dynamic-delete": "off",
    },
  },
);
