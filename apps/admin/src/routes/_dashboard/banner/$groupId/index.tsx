import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BannerTable } from "#/components/banner/BannerTable"
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
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  useBannerGroup,
  useBanners,
  useDeleteBanner,
  useDeleteBannerGroup,
  useReorderBanners,
} from "#/hooks/use-banner"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/banner/$groupId/")({
  component: BannerGroupDetailPage,
})

function BannerGroupDetailPage() {
  const { groupId } = Route.useParams()
  const navigate = useNavigate()
  const { data: group } = useBannerGroup(groupId)
  const { data: banners, isPending, error } = useBanners(groupId)
  const reorderMutation = useReorderBanners()
  const deleteBannerMutation = useDeleteBanner()
  const deleteGroupMutation = useDeleteBannerGroup()
  const [groupDeleteOpen, setGroupDeleteOpen] = useState(false)
  const [bannerDeleteId, setBannerDeleteId] = useState<string | null>(null)

  async function handleMove(bannerId: string, direction: "up" | "down") {
    if (!banners) return
    const idx = banners.findIndex((b) => b.id === bannerId)
    if (idx < 0) return
    const swap = direction === "up" ? idx - 1 : idx + 1
    if (swap < 0 || swap >= banners.length) return
    const reordered = [...banners]
    ;[reordered[idx], reordered[swap]] = [reordered[swap]!, reordered[idx]!]
    try {
      await reorderMutation.mutateAsync({
        groupId,
        bannerIds: reordered.map((b) => b.id),
      })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
    }
  }

  async function handleDeleteBanner() {
    if (!bannerDeleteId) return
    try {
      await deleteBannerMutation.mutateAsync({
        id: bannerDeleteId,
        groupId,
      })
      toast.success(m.banner_banner_deleted())
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.banner_failed_delete_banner())
    } finally {
      setBannerDeleteId(null)
    }
  }

  async function handleDeleteGroup() {
    try {
      await deleteGroupMutation.mutateAsync(groupId)
      toast.success(m.banner_group_deleted())
      navigate({ to: "/banner" })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.banner_failed_delete_group())
    }
  }

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="sm">
          <Link to="/banner">
            <ArrowLeft className="size-4" />
            {m.banner_back_to_groups()}
          </Link>
        </Button>
        {group && !group.alias ? (
          <Badge variant="outline">{m.banner_draft_badge()}</Badge>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              to="/banner/$groupId/edit"
              params={{ groupId }}
            >
              <Pencil className="size-4" />
              {m.banner_edit_group()}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => setGroupDeleteOpen(true)}
          >
            <Trash2 className="size-4" />
            {m.common_delete()}
          </Button>
          <Button asChild size="sm">
            <Link
              to="/banner/$groupId/banners/create"
              params={{ groupId }}
            >
              <Plus className="size-4" />
              {m.banner_new_banner()}
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 space-y-4 p-6">
        {group ? (
          <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
            <div className="flex flex-wrap gap-4">
              <div>
                <span className="text-muted-foreground">
                  {m.common_alias()}:{" "}
                </span>
                {group.alias ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {group.alias}
                  </code>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {m.banner_field_layout()}:{" "}
                </span>
                {group.layout}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {m.banner_field_interval()}:{" "}
                </span>
                {group.intervalMs}
              </div>
              <div>
                <span className="text-muted-foreground">
                  {m.common_status()}:{" "}
                </span>
                <Badge variant={group.isActive ? "default" : "outline"}>
                  {group.isActive
                    ? m.banner_status_active()
                    : m.banner_status_inactive()}
                </Badge>
              </div>
            </div>
            {group.description ? (
              <p className="mt-2 text-muted-foreground">{group.description}</p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border bg-card shadow-sm">
          {isPending ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-destructive">
              {error.message}
            </div>
          ) : (
            <BannerTable
              data={banners ?? []}
              groupId={groupId}
              onMove={handleMove}
              onDelete={(id) => setBannerDeleteId(id)}
              isBusy={
                reorderMutation.isPending || deleteBannerMutation.isPending
              }
            />
          )}
        </div>
      </main>

      <AlertDialog
        open={bannerDeleteId !== null}
        onOpenChange={(open) => !open && setBannerDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.banner_delete_banner_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.banner_delete_banner_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBanner}
              className="bg-destructive text-destructive-foreground"
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={groupDeleteOpen} onOpenChange={setGroupDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.banner_delete_group_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.banner_delete_group_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGroup}
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
