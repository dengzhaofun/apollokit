import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { MessageTable } from "#/components/mail/MessageTable"
import { useMailMessages } from "#/hooks/use-mail"

export const Route = createFileRoute("/_dashboard/mail/")({
  component: MailListPage,
})

function MailListPage() {
  const { data: items, isPending, error } = useMailMessages()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/mail/create">
              <Plus className="size-4" />
              {m.mail_new_message()}
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.mail_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <MessageTable data={items ?? []} />
          </div>
        )}
      </main>
    </>
  )
}
