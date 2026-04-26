import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import { MessageTable } from "#/components/mail/MessageTable"

export const Route = createFileRoute("/_dashboard/mail/")({
  component: MailListPage,
})

function MailListPage() {
  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <WriteGate>
            <Button asChild size="sm">
              <Link to="/mail/create">
                <Plus className="size-4" />
                {m.mail_new_message()}
              </Link>
            </Button>
          </WriteGate>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <MessageTable />
      </main>
    </>
  )
}
