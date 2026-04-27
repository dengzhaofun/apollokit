import * as Sentry from '@sentry/cloudflare'
import { paraglideMiddleware } from './paraglide/server.js'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

// Service binding declared in `wrangler.jsonc` → `services[].binding`.
// Forwards `/api/*` to the server worker without leaving the worker
// runtime — same-origin from the browser, cookies stay default
// SameSite=Lax + host-only.
//
// `cloudflare:workers` is a worker-runtime-only module. We import it
// lazily inside the prod-only branch and mark it external in
// `vite.config.ts` so dev (Node SSR, after we conditionally drop
// cloudflare-vite-plugin) doesn't try to resolve it. In dev, `/api/*`
// is intercepted by vite's `server.proxy` before reaching this handler.
interface AdminEnv {
  API: { fetch: (req: Request) => Promise<Response> }
  SENTRY_DSN?: string
  SENTRY_ENVIRONMENT?: string
  CF_VERSION_METADATA?: { id: string }
}

const tanstackHandler = createServerEntry({
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/')) {
      const { env } = (await import('cloudflare:workers')) as unknown as {
        env: AdminEnv
      }
      return env.API.fetch(req)
    }
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
})

// Sentry 包装层：把 worker 的 fetch handler 套一层，未捕获异常自动上报。
// SENTRY_DSN 未配时 SDK no-op，本地 dev 不上报。release 由
// CF_VERSION_METADATA 自动检测（@sentry/cloudflare ≥ 10.35）。
// tracesSampleRate 0.1 与 wrangler.jsonc observability head_sampling_rate 对齐。
export default Sentry.withSentry(
  (env: AdminEnv) => ({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? 'development',
    sendDefaultPii: true,
    tracesSampleRate: 0.1,
  }),
  tanstackHandler,
)
