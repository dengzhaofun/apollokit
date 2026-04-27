import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import mdx from 'fumadocs-mdx/vite'
import * as MdxConfig from './source.config'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// cloudflare/vite-plugin 在 dev 时把 SSR 请求 dispatch 进 Miniflare
// (workerd),用来模拟生产 Worker runtime。但它对 fumadocs 的虚拟模块
// (`collections/server`、`collections/browser`)解析不了,会让首次 SSR
// 请求 hang 60s+ 直到 timeout 500——把开发体验整个废掉。
//
// build 时 rollup 走另一条路径,fumadocs-mdx 的 vite 插件能正常 emit
// 真实模块,Worker bundle 完全没问题(已实测 prod build 通过)。
//
// 所以条件挂载:仅 build 时启用,dev 走 vite 默认 Node SSR。
// 代价是 dev 与 prod 的 SSR runtime 微小差异(纯 Node API + Web fetch
// 没问题,不要在 dev-time 路径上引 `cloudflare:*` 内置模块——`src/server.ts`
// 已经只在 build 后的 Worker bundle 里被调用,dev 不执行它)。
export default defineConfig(({ command }) => ({
  build: {
    // 生成 .map 但不在 bundle 末尾留 //# sourceMappingURL 引用,避免线上
    // 暴露源码;Sentry 的 vite plugin 会把 .map 单独上传给 Sentry。
    sourcemap: 'hidden',
  },
  plugins: [
    devtools(),
    mdx(MdxConfig),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      cookieName: 'PARAGLIDE_LOCALE',
      strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
    }),
    ...(command === 'build'
      ? [cloudflare({ viteEnvironment: { name: 'ssr' } })]
      : []),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Sentry 必须排在所有 plugin 最后(官方要求)。SENTRY_AUTH_TOKEN 缺失
    // 时 disable —— 本地 build 不会报错,也不会尝试上传。CF Workers Builds
    // 上需要在 dashboard 把 SENTRY_AUTH_TOKEN 放进 build env vars。
    sentryVitePlugin({
      org: 'dzfun',
      project: 'apollokit-admin',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        // 上传完就删,不带进 worker bundle 部署体积
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    }),
  ],
  server: {
    // dev 时把 `/api/*` 转发到本地 server worker(:8787),让浏览器把
    // admin + server 视为同 origin —— 这跟 prod 用 service binding
    // 的行为是等价的,统一掉跨域 cookie 策略的差异。
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: false,
      },
    },
  },
  // `cloudflare:workers` 只在 worker runtime 存在;dev SSR 跑在 Node
  // 里没有这个模块。dev 时标 external 让 vite 不去 resolve 它,配合
  // `src/server.ts` 里 dynamic import + dev 永远走 vite proxy 不命中
  // 那条分支,Node SSR 才能正常启动。
  // build 时 cloudflare-vite-plugin 自己接管这个 specifier,显式设
  // `ssr.external` 反而会被拒绝。
  ...(command === 'serve' ? { ssr: { external: ['cloudflare:workers'] } } : {}),
}))
