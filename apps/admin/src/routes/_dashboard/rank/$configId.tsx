import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import { TierConfigForm } from "#/components/rank/TierConfigForm"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog"
import { Button } from "#/components/ui/button"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  useDeleteRankTierConfig,
  useRankTierConfig,
  useUpdateRankTierConfig,
} from "#/hooks/use-rank"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/rank/$configId")({
  component: RankConfigDetailPage,
})

function RankConfigDetailPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const { data, isPending, error } = useRankTierConfig(configId)
  const updateMutation = useUpdateRankTierConfig()
  const deleteMutation = useDeleteRankTierConfig()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">
          {m.rank_edit_config()}
          {data ? (
            <span className="ml-2 text-muted-foreground">
              · {data.name}{" "}
              <code className="rounded bg-muted px-1 text-xs">{data.alias}</code>
            </span>
          ) : null}
        </h1>
        <div className="ml-auto">
          {data ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="size-4" />
                  {m.rank_delete_config()}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {m.rank_delete_config_title()}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {m.rank_delete_config_desc()}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{m.rank_cancel()}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      try {
                        await deleteMutation.mutateAsync(data.id)
                        toast.success(m.rank_config_deleted())
                        navigate({ to: "/rank" })
                      } catch (err) {
                        if (err instanceof ApiError)
                          toast.error(err.body.error)
                        else toast.error((err as Error).message)
                      }
                    }}
                  >
                    {m.rank_delete_confirm()}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </header>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.rank_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.rank_failed_load()} {error.message}
          </div>
        ) : data ? (
          <div className="mx-auto max-w-4xl rounded-xl border bg-card p-6 shadow-sm">
            <TierConfigForm
              initial={data}
              isPending={updateMutation.isPending}
              submitLabel={m.rank_save()}
              onSubmit={async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    key: data.id,
                    input: values,
                  })
                  toast.success(m.rank_config_updated())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error((err as Error).message)
                }
              }}
            />
          </div>
        ) : null}
      </main>
    </>
  )
}
