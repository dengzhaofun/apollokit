import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import * as Sentry from '@sentry/react'
import { routeTree } from './routeTree.gen'
import { deLocalizeUrl, localizeUrl } from './paraglide/runtime.js'

// 前端 Sentry DSN 是公开值（任何打开页面的用户都能从 bundle 里翻出来），
// Sentry 设计上就允许硬编码，社区惯例也是直接写字面量。这样省掉一层
// build-time env var 链路，CF Workers Builds dashboard 也不用配。
// 想换 DSN 改这里一行即可（dzfun/apollokit-admin 项目）。
const ADMIN_BROWSER_DSN =
  'https://f31d6a34a1a7c0ded80dfafc6ab71b4a@o356368.ingest.us.sentry.io/4511289756418048'

// 浏览器端 Sentry 只 init 一次。getRouter 在 dev HMR / SSR/CSR 双跑时
// 会被调多次，用模块级标志兜住，避免重复 init 把 integrations 注册多次。
let sentryInited = false

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
  })

  // 浏览器端才 init —— SSR 在 worker 里跑（那边走 src/server.ts 的
  // @sentry/cloudflare 路径），不要在 SSR 里 init 浏览器 SDK。
  // 用 Vite 内置 import.meta.env.MODE：dev=development、build=production，
  // 跟我们要的环境标签语义对齐，不需要再单独维护一个 env var。
  if (typeof window !== 'undefined' && !sentryInited) {
    sentryInited = true
    Sentry.init({
      dsn: ADMIN_BROWSER_DSN,
      environment: import.meta.env.MODE,
      sendDefaultPii: true,
      tracesSampleRate: 0.1,
      integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    })
  }

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
