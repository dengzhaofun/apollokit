import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { LotteryPoolForm } from "#/components/lottery/PoolForm"
import { useCreateLotteryPool } from "#/hooks/use-lottery"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/lottery/create")({
  component: LotteryCreatePage,
})

function LotteryCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateLotteryPool()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">New Lottery Pool</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <LotteryPoolForm
            submitLabel="Create"
            isPending={createMutation.isPending}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync(values)
                toast.success("Lottery pool created successfully")
                navigate({ to: "/lottery" })
              } catch (err) {
                if (err instanceof ApiError) {
                  toast.error(err.body.error)
                } else {
                  toast.error("Failed to create pool")
                }
              }
            }}
          />
        </div>
      </main>
    </>
  )
}
