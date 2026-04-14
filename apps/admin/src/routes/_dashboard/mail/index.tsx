import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
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
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.mail_title()}</h1>
        <div className="ml-auto">
          <Button asChild size="sm">
            <Link to="/mail/create">
              <Plus className="size-4" />
              {m.mail_new_message()}
            </Link>
          </Button>
        </div>
      </header>

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
