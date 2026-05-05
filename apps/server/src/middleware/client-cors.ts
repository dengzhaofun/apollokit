/**
 * CORS middleware for `/api/v1/client/*` routes.
 *
 * Background — historically all client-API traffic reached the server
 * worker via Cloudflare service binding from the admin worker (see
 * `apps/admin/wrangler.jsonc#services`), so the server bypassed CORS
 * entirely. With the apollokit-pages worker added (PR 3) and end-user
 * landing pages live at `<slug>.pages.apollokit.dev`, the browser now
 * fetches `/api/v1/client/*` cross-origin and CORS becomes mandatory.
 *
 * Origin allow-list:
 *   - `*.pages.apollokit.dev`           — production wildcard subdomain
 *   - `<slug>.localhost:<port>` /
 *     `<slug>.lvh.me:<port>`            — dev subdomains (matches the
 *                                          pages worker's host parser)
 *   - `apollokit-admin.<account>.workers.dev` — admin's prod URL
 *   - `localhost:<port>` (any)          — admin / pages dev servers
 *
 * Anything else → no `Access-Control-Allow-Origin` header → browser
 * blocks. The middleware never echoes a request's Origin verbatim;
 * each path goes through one of these allow rules so a forged Origin
 * never gets reflected.
 *
 * Mounted in `src/index.ts` BEFORE any `requireClientCredential` /
 * `requireClientUser` middleware. Reasoning: the browser sends a
 * preflight OPTIONS request without auth headers; auth gates would
 * 401 it and the actual request never fires. CORS must run first,
 * answer the preflight, and only then let the auth pipeline see the
 * real request.
 *
 * `credentials: true` is required because end-user Better Auth uses
 * `Set-Cookie: Domain=.pages.apollokit.dev` for cross-subdomain
 * sessions. The Origin echo (rather than `*`) is also required for
 * cookie-bearing requests.
 */

import { cors } from "hono/cors";

const PAGES_PROD_HOST_RE = /^https:\/\/[a-z0-9-]+\.pages\.apollokit\.dev$/;
const ADMIN_PROD_HOST_RE =
  /^https:\/\/apollokit-admin\.[a-z0-9-]+\.workers\.dev$/;
const PAGES_DEV_HOST_RE =
  /^http:\/\/(?:[a-z0-9-]+\.)?(?:localhost|lvh\.me|127\.0\.0\.1)(?::\d+)?$/;

export function isAllowedClientOrigin(origin: string): boolean {
  if (!origin) return false;
  if (PAGES_PROD_HOST_RE.test(origin)) return true;
  if (ADMIN_PROD_HOST_RE.test(origin)) return true;
  if (PAGES_DEV_HOST_RE.test(origin)) return true;
  return false;
}

/**
 * `hono/cors` — wired so the response echoes the request's Origin only
 * when it matches the allow regex. Returning `null` lets hono drop the
 * `Access-Control-Allow-Origin` header entirely for unmatched origins,
 * which is what the browser interprets as "not allowed".
 */
export const clientCors = cors({
  origin: (origin) => (isAllowedClientOrigin(origin) ? origin : null),
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: [
    "content-type",
    "x-api-key",
    "x-end-user-id",
    "x-user-hash",
    "authorization",
  ],
  exposeHeaders: ["x-request-id"],
  maxAge: 600,
});
