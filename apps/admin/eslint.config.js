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
      // 生成文件:paraglide-js 编译消息模块、wrangler 生成的 worker
      // bindings 类型 — 都不该被 lint 卡。仓库里 .gitignore 已忽略,
      // 但 ESLint 不读 .gitignore,需要在这里显式排除。
      "src/paraglide/**",
      "worker-configuration.d.ts",
      // fumadocs-mdx 编译期生成的入口模块。
      ".source/**",
    ],
  },
];
