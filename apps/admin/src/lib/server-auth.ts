import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

type TenantParams = { orgSlug: string; projectSlug: string }

type SessionResponse = {
  session?: { activeOrganizationId?: string; activeTeamId?: string }
}
type OrgRow = { id: string; slug: string }

/**
 * SSR-only: reads the session cookie server-side and resolves the active
 * org slug + project (team) id so that `beforeLoad` can issue a 302
 * redirect before any HTML reaches the browser.
 *
 * Prod: calls the server worker via CF service binding (zero network hop).
 * Dev: falls back to a direct fetch to the wrangler dev server at :8787.
 *
 * Returns null on any failure — the client-side SignedInBouncer handles the
 * redirect as a fallback.
 */
export const checkAuthAndGetTenant = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TenantParams | null> => {
    try {
      const req = getRequest()
      const cookie = req.headers.get('cookie') ?? ''
      if (!cookie) return null

      let apiFetch: (path: string) => Promise<Response>
      try {
        const { env } = (await import('cloudflare:workers')) as {
          env: { API: { fetch: (r: Request) => Promise<Response> } }
        }
        apiFetch = (path) =>
          env.API.fetch(
            new Request(new URL(path, req.url), { headers: { cookie } }),
          )
      } catch {
        // Dev / non-CF environment — hit wrangler directly
        apiFetch = (path) =>
          fetch(`http://localhost:8787${path}`, { headers: { cookie } })
      }

      const sessionRes = await apiFetch('/api/auth/get-session')
      if (!sessionRes.ok) return null
      const sessionData = (await sessionRes.json()) as SessionResponse
      const { activeOrganizationId, activeTeamId } =
        sessionData?.session ?? {}
      if (!activeOrganizationId || !activeTeamId) return null

      const orgsRes = await apiFetch('/api/auth/organization/list')
      if (!orgsRes.ok) return null
      const orgsData = (await orgsRes.json()) as OrgRow[]
      const orgs = Array.isArray(orgsData) ? orgsData : []
      const org = orgs.find((o) => o.id === activeOrganizationId)
      if (!org?.slug) return null

      return { orgSlug: org.slug, projectSlug: activeTeamId }
    } catch {
      return null
    }
  },
)
