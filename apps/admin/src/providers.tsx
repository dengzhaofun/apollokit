import { AuthUIProviderTanstack as AuthUIProvider } from "@daveyplate/better-auth-ui/tanstack"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { useRouter, Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { toast, Toaster } from "sonner"

import { ConfirmHost } from "./components/patterns/confirm"
import { TooltipProvider } from "./components/ui/tooltip"
import { authClient } from "./lib/auth-client"
import { getLocale } from './paraglide/runtime.js'
import { authLocalizationZh } from './lib/auth-localization-zh'
import { authLocalizationEn } from './lib/auth-localization-en'
import * as m from "./paraglide/messages.js"

/**
 * Surface the server-side permission gate ("your role cannot write
 * here") as a toast so people hitting an ungated business page don't
 * see silent failure. The server returns
 *   { code: "forbidden", message, requestId }  at HTTP 403
 * for `requirePermission` / `requirePermissionByMethod` denials; we
 * only act on the `forbidden` code to avoid hijacking 403s that other
 * modules use for unrelated cases (e.g. organization-scope mismatches).
 *
 * Works for both TanStack Query queries (the `useXxx` hooks) and
 * mutations (the form submissions). Duplicate-toast suppression comes
 * from sonner's built-in `id`-based dedupe.
 */
type EnvelopeError = {
  code?: string
  data?: unknown
  message?: string
}

function handleEnvelopeError(err: unknown): void {
  const body = (err as { body?: EnvelopeError })?.body
  if (body?.code === "forbidden") {
    toast.error(m.role_write_denied_toast(), {
      id: "role-write-denied",
    })
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleEnvelopeError,
  }),
  mutationCache: new MutationCache({
    onError: handleEnvelopeError,
  }),
})

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter()
  const localization = getLocale() === 'zh' ? authLocalizationZh : authLocalizationEn

  return (
    <QueryClientProvider client={queryClient}>
      <AuthUIProvider
        authClient={authClient}
        localization={localization}
        // Default is "/" (landing). After sign-in we want the admin
        // dashboard; `_dashboard.tsx` takes it from there (redirects
        // to `/onboarding/create-project` if the user has no active project).
        redirectTo="/dashboard"
        // Social providers must be enumerated explicitly — the UI lib
        // does NOT auto-discover providers from the server. Server-side
        // socialProviders.google is configured in apps/server/src/auth.ts.
        social={{
          providers: ["google"],
        }}
        // Expose the four-role matrix to daveyplate's invite dialog +
        // member-list role dropdown. `customRoles` is APPENDED to its
        // built-in owner/admin/member trio — and we keep `member` here
        // as a backward-compat alias (the server-side `ac.ts` registers
        // it as an alias of operator), so existing rows render with a
        // sane label until the prod migration flips them.
        // Organization-scoped views: keep custom role labels AND mount
        // every internal daveyplate link under /settings/* — without
        // basePath/viewPaths the library generates `/organization/*`
        // links that 404 in our router. SETTINGS / MEMBERS land on the
        // same `/settings/organization` (one combined page); TEAMS link
        // resolves to `/settings/project` (current project settings).
        organization={{
          basePath: "/settings",
          viewPaths: {
            SETTINGS: "organization",
            MEMBERS: "organization",
            TEAMS: "project",
          },
          customRoles: [
            { role: "operator", label: m.role_label_operator() },
            { role: "viewer", label: m.role_label_viewer() },
          ],
        }}
        // Mount account-scoped views under /settings/* so the UserButton
        // dropdown links to our own settings layout instead of the
        // library default `/account/*` (which doesn't exist here).
        // SETTINGS defaults to "settings" — we override to "account" to
        // avoid the double `/settings/settings` segment.
        // Note: `_dashboard` is a pathless TanStack layout, so the URL
        // does NOT contain a `/dashboard` prefix. The route file is at
        // `routes/_dashboard/settings/account.tsx` → URL `/settings/account`.
        account={{
          basePath: "/settings",
          viewPaths: {
            SETTINGS: "account",
            SECURITY: "security",
            API_KEYS: "api-keys",
            ORGANIZATIONS: "projects",
          },
        }}
        navigate={(href: string) => router.navigate({ to: href })}
        replace={(href: string) => router.navigate({ to: href, replace: true })}
        Link={({ href, ...props }: { href: string } & Record<string, unknown>) => (
          <Link to={href} {...props} />
        )}
      >
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <ConfirmHost />
        <Toaster />
      </AuthUIProvider>
    </QueryClientProvider>
  )
}
