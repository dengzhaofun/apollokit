import { AuthUIProviderTanstack as AuthUIProvider } from "@daveyplate/better-auth-ui/tanstack"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Link, useRouter } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Toaster } from "sonner"

import { TooltipProvider } from "./components/ui/tooltip"
import { authClient } from "./lib/auth-client"
import { getLocale } from './paraglide/runtime.js'
import { authLocalizationZh } from './lib/auth-localization-zh'

const queryClient = new QueryClient()

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter()
  const localization = getLocale() === 'zh' ? authLocalizationZh : undefined

  return (
    <QueryClientProvider client={queryClient}>
      <AuthUIProvider
        authClient={authClient}
        localization={localization}
        navigate={(href: string) => router.navigate({ to: href })}
        replace={(href: string) => router.navigate({ to: href, replace: true })}
        Link={({ href, ...props }: { href: string } & Record<string, unknown>) => (
          <Link to={href} {...props} />
        )}
      >
        <TooltipProvider>
          {children}
        </TooltipProvider>
        <Toaster />
      </AuthUIProvider>
    </QueryClientProvider>
  )
}
