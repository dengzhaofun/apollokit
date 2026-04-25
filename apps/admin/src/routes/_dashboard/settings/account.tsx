import { AccountSettingsCards } from "@daveyplate/better-auth-ui"
import { createFileRoute } from "@tanstack/react-router"

import { seo } from "#/lib/seo"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/settings/account")({
  head: () => seo({ title: "Account settings", noindex: true }),
  component: AccountSettingsPage,
})

function AccountSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{m.settings_account()}</h1>
        <p className="text-sm text-muted-foreground">
          {m.settings_account_description()}
        </p>
      </header>
      <AccountSettingsCards />
    </div>
  )
}
