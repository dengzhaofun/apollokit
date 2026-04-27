import * as Sentry from "@sentry/cloudflare";

import { app } from "./index";

// Wrangler `main` 入口。把 Hono app 包一层 Sentry，让所有未捕获异常 /
// onError 触发的错误自动上报到 Sentry。
//
// 为什么单独抽一个文件而不是直接改 src/index.ts：
// - vitest 跑测试时把 `cloudflare:workers` 模块替换成 src/testing/
//   cloudflare-workers-shim.ts，但 @sentry/cloudflare 内部依赖
//   AsyncLocalStorage 等 worker-only API，shim 不一定 cover 全。
// - 把 Sentry 包装层抽到本文件，单测路径上 `import app from "./index"`
//   永远不会触发 @sentry/cloudflare 的导入，最干净。
//
// `app` 上已通过 Object.assign 挂了 scheduled handler（见 src/index.ts
// 末尾），withSentry 透传 fetch + scheduled 到 Cloudflare runtime。
//
// 配置约定：
// - `SENTRY_DSN` 是 wrangler secret，未配时 SDK 自动 no-op，本地 dev 不上报。
// - `SENTRY_ENVIRONMENT` 在 wrangler.jsonc `vars` 里固定为 "production"，
//   本地无此变量时 fallback 到 "development"。
// - release 由 `CF_VERSION_METADATA` 绑定自动检测（@sentry/cloudflare ≥
//   10.35），免维护。
// - tracesSampleRate 0.1 与 wrangler.jsonc 里 observability head_sampling_rate
//   对齐，避免双倍采样量。
export default Sentry.withSentry(
  (env: CloudflareBindings) => ({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? "development",
    sendDefaultPii: true,
    tracesSampleRate: 0.1,
  }),
  app,
);
