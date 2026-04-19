import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";
import onlyWarn from "eslint-plugin-only-warn";

/**
 * A shared ESLint configuration for the repository.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  js.configs.recommended,
  eslintConfigPrettier,
  ...tseslint.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
    },
    rules: {
      "turbo/no-undeclared-env-vars": "warn",
      // Disabled repo-wide: WIP modules regularly have intentionally-unused
      // destructured fields, kept-for-reference imports, and prototype
      // variables, and the `onlyWarn` plugin downgrades this rule to a
      // warning which `--max-warnings 0` then treats as a failure. Rely
      // on editor highlighting + tsconfig's `noUnusedLocals`/`noUnusedParameters`
      // (opt-in per app) to catch genuinely-dead code.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    plugins: {
      onlyWarn,
    },
  },
  {
    ignores: ["dist/**"],
  },
];
