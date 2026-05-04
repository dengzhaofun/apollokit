import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BadgeNodeForm } from "#/components/badge/BadgeNodeForm"
import { useBadgeNodeForm } from "#/components/badge/use-node-form"
import { PageHeaderActions } from "#/components/PageHeader"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import { Button } from "#/components/ui/button"
import {
  useBadgeNodes,
  useDeleteBadgeNode,
  useUpdateBadgeNode,
} from "#/hooks/use-badge"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/badge/$nodeId")({
  component: BadgeDetailPage,
})

function BadgeDetailPage() {
  const { nodeId } = Route.useParams()
  const navigate = useNavigate()
  const { data: nodes, isPending } = useBadgeNodes()
  const updateMutation = useUpdateBadgeNode()
  const deleteMutation = useDeleteBadgeNode()
  const { orgSlug, projectSlug } = useTenantParams()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const node = nodes?.find((n) => n.id === nodeId)
  const existingKeys = (nodes ?? []).map((n) => n.key)

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(nodeId)
      toast.success(m.badge_deleted())
      navigate({ to: "/o/$orgSlug/p/$projectSlug/badge" , params: { orgSlug, projectSlug }})
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.badge_failed_delete())
    }
  }

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/o/$orgSlug/p/$projectSlug/badge" params={{ orgSlug, projectSlug }}>
              <ArrowLeft className="size-4" />
              {m.badge_back_to_list()}
            </Link>
          }
          variant="ghost" size="sm"
        />
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            {m.common_delete()}
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-3xl">
          {isPending || !node ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : (
            <EditBadgePanel
              node={node}
              existingKeys={existingKeys}
              isPending={updateMutation.isPending}
              onSave={async (values) => {
                try {
                  // `key` is immutable in edit (disabled). Strip it.
                  const { key: _k, ...patch } = values
                  await updateMutation.mutateAsync({ id: nodeId, input: patch })
                  toast.success(m.badge_updated())
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                  else toast.error(m.badge_failed_update())
                }
              }}
            />
          )}
        </div>
      </main>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.badge_delete_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.badge_delete_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function EditBadgePanel({
  node,
  existingKeys,
  isPending,
  onSave,
}: {
  node: NonNullable<ReturnType<typeof useBadgeNodes>["data"]>[number]
  existingKeys: string[]
  isPending: boolean
  onSave: (values: Parameters<NonNullable<Parameters<typeof useBadgeNodeForm>[0]["onSubmit"]>>[0]) => void | Promise<void>
}) {
  const form = useBadgeNodeForm({ initial: node, onSubmit: onSave })
  return (
    <BadgeNodeForm
      form={form}
      keyLocked
      existingKeys={existingKeys}
      isPending={isPending}
      submitLabel={m.common_save_changes()}
    />
  )
}
