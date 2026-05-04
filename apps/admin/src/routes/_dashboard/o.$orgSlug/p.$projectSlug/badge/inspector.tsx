import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { BadgeInspector } from "#/components/badge/BadgeInspector"
import { PageHeader } from "#/components/patterns"
import { Button } from "#/components/ui/button"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/badge/inspector")({
  component: BadgeInspectorPage,
})

function BadgeInspectorPage() {
  const { orgSlug, projectSlug } = useTenantParams()
  return (
    <>
      <PageHeader
        title={m.badge_inspector_title()}
        description={m.badge_inspector_subtitle()}
        actions={
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/badge" params={{ orgSlug, projectSlug }}>
                <ArrowLeft className="size-4" />
                {m.badge_back_to_list()}
              </Link>
            }
            variant="ghost" size="sm"
          />
        }
      />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-5xl">
          <BadgeInspector />
        </div>
      </main>
    </>
  )
}
