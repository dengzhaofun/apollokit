import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Search } from "lucide-react"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { PageHeaderActions } from "#/components/PageHeader"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/activity/$alias/users/")({
  component: ActivityUsersIndexPage,
})

function ActivityUsersIndexPage() {
  const { alias } = Route.useParams()
  const navigate = useNavigate()
  const { orgSlug, projectSlug } = useTenantParams()
  const [endUserId, setEndUserId] = useState("")

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/o/$orgSlug/p/$projectSlug/activity/$alias" params={{ orgSlug, projectSlug, alias }}>
              <ArrowLeft className="size-4" />
              {m.activity_users_back_to_detail()}
            </Link>
          }
          variant="ghost" size="sm"
        />
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">
            {m.activity_users_search_title()}
          </h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const id = endUserId.trim()
              if (!id) return
              navigate({
                to: "/o/$orgSlug/p/$projectSlug/activity/$alias/users/$endUserId",
                params: { orgSlug, projectSlug, alias, endUserId: id },
              })
            }}
          >
            <Input
              value={endUserId}
              onChange={(e) => setEndUserId(e.target.value)}
              placeholder={m.activity_users_search_placeholder()}
              className="flex-1"
            />
            <Button type="submit" disabled={!endUserId.trim()}>
              <Search className="size-4" />
              {m.common_search()}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            {m.activity_users_search_hint()}
          </p>
        </div>
      </main>
    </>
  )
}
