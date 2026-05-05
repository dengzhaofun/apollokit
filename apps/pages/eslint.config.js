import { config as reactInternalConfig } from "@repo/eslint-config/react-internal";

export default [
  ...reactInternalConfig,
  {
    ignores: [
      "dist/**",
      ".output/**",
      ".tanstack/**",
      ".wrangler/**",
      ".vinxi/**",
      ".nitro/**",
      "node_modules/**",
      // wrangler types --env-interface generated file.
      "worker-configuration.d.ts",
      // TanStack Router file-based generated route tree.
      "src/routeTree.gen.ts",
    ],
  },
];
