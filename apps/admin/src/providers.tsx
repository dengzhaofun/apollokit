import { AuthUIProviderTanstack as AuthUIProvider } from "@daveyplate/better-auth-ui/tanstack"
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"
import { Link, useRouter } from "@tanstack/react-router"
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
 * Surface the server-side role gate ("your member role cannot write
 * here") as a toast so people hitting an ungated business page don't
 * see silent failure. The server returns
 *   { code: "forbidden", message, requestId }  at HTTP 403
 * for requireOrgManage denials; we only act on the `forbidden` code
 * to avoid hijacking 403s that other modules use for unrelated cases
 * (e.g. organization-scope mismatches).
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
