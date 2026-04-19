import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    // Tool config files run in Node at build time (tinybird, drizzle-kit,
    // vitest, etc.), not inside the Worker bundle — give them the Node
    // globals so `process.env` etc don't trip `no-undef`.
    files: ["*.config.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: { process: "readonly" },
    },
  },
  {
    ignores: [
      "worker-configuration.d.ts",
      ".wrangler/**",
      "drizzle/**",
      "node_modules/**",
    ],
  },
];
