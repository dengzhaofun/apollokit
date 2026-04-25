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
}

export default createServerEntry({
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
