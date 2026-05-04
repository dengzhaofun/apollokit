import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appVersion: string = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
).version ?? '0.0.0'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import mdx from 'fumadocs-mdx/vite'
import * as MdxConfig from './source.config'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// Dev SSR 跑在 Node 里,不会经过 cloudflare-vite-plugin 的 .dev.vars
// 自动注入。Ask-AI 的 `/api/chat` 在 admin 路由内执行,需要
// `process.env.OPENROUTER_API_KEY`,不然每次提问会 500。
//
// 这里在 vite 启动时一次性把 server 的 `.dev.vars`(KEY=VAL,无引号、
// 无 export 前缀)装进 process.env,缺失的 key 不覆盖既有 shell env。
// build 路径不需要,生产由 wrangler secrets / Cloudflare vars 提供。
function loadDevVars() {
  const candidates = [
    resolve(__dirname, '.dev.vars'),
    resolve(__dirname, '../server/.dev.vars'),
  ]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx <= 0) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}
loadDevVars()

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
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
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
      disable: !process.env.SENTRY_AUTH_TOKEN || process.env.CI !== 'true',
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
    //
    // 例外:`/api/search` 和 `/api/chat` 是 admin 自家的 docs 端点
    //(Orama 搜索 + Fumadocs Ask-AI),必须留在 admin 进程里,
    // bypass 返回 req.url 即可让 vite 跳过代理、转交给 TanStack
    // Start 的路由处理。这条豁免逻辑在 `src/server.ts` 里有镜像。
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: false,
        bypass: (req) => {
          const url = req.url ?? ''
          if (
            url === '/api/search' ||
            url.startsWith('/api/search?') ||
            url === '/api/chat' ||
            url.startsWith('/api/chat?') ||
            url.startsWith('/api/_')
          ) {
            return url
          }
        },
      },
    },
  },
  // `cloudflare:workers` 只在 worker runtime 存在;dev SSR 跑在 Node
  // 里没有这个模块。dev 时标 external 让 vite 不去 resolve 它,配合
  // `src/server.ts` 里 dynamic import + dev 永远走 vite proxy 不命中
  // 那条分支,Node SSR 才能正常启动。
  // build 时 cloudflare-vite-plugin 自己接管这个 specifier,显式设
  // `ssr.external` 反而会被拒绝。
  ...(command === 'serve'
    ? {
        ssr: { external: ['cloudflare:workers'] },
        // dev 期 esbuild 依赖扫描会逐文件抓 import,看到 routes/api/chat.ts
        // 里的 `await import('cloudflare:workers')` 后会试图把它当成 npm
        // 包预构建,失败抛 "could not be resolved"。把这个 specifier 显式
        // 加到 exclude,让扫描器跳过。
        optimizeDeps: { exclude: ['cloudflare:workers'] },
      }
    : {}),
}))
