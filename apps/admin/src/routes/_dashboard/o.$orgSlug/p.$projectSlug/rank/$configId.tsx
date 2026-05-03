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
import {
  useDeleteRankTierConfig,
  useRankTierConfig,
  useUpdateRankTierConfig,
} from "#/hooks/use-rank"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/rank/$configId")({
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
      {data ? (
        <PageHeaderActions>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="size-4" />
                  {m.rank_delete_config()}
                </Button>
              }
            />
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
        </PageHeaderActions>
      ) : null}

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
