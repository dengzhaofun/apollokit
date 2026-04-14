import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { MessageForm } from "#/components/mail/MessageForm"
import { useCreateMailMessage } from "#/hooks/use-mail"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/mail/create")({
  component: MailCreatePage,
})

function MailCreatePage() {
  const navigate = useNavigate()
  const mutation = useCreateMailMessage()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.mail_new_message()}</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <MessageForm
            isPending={mutation.isPending}
            submitLabel={m.mail_send()}
            onSubmit={async (values) => {
              try {
                await mutation.mutateAsync(values)
                toast.success(m.mail_sent())
                navigate({ to: "/mail" })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error(m.mail_failed_send())
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
