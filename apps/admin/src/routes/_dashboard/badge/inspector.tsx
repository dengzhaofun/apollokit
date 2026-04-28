import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { BadgeInspector } from "#/components/badge/BadgeInspector"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/badge/inspector")({
  component: BadgeInspectorPage,
})

function BadgeInspectorPage() {
  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/badge">
              <ArrowLeft className="size-4" />
              {m.badge_back_to_list()}
            </Link>
          }
          variant="ghost" size="sm"
        />
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl">
          <header className="mb-4">
            <h1 className="text-lg font-semibold">
              {m.badge_inspector_title()}
            </h1>
            <p className="text-sm text-muted-foreground">
              {m.badge_inspector_subtitle()}
            </p>
          </header>
          <BadgeInspector />
        </div>
      </main>
    </>
  )
}
