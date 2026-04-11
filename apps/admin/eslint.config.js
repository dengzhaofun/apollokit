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
    ],
  },
];
