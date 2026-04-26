import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BannerForm } from "#/components/banner/BannerForm"
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
import { FormDrawer } from "#/components/ui/form-drawer"
import {
  useAllBanners,
  useBanner,
  useBannerGroup,
  useCreateBanner,
  useDeleteBanner,
  useDeleteBannerGroup,
  useReorderBanners,
  useUpdateBanner,
} from "#/hooks/use-banner"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateChildModal,
} from "#/lib/modal-search"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"

const FORM_ID = "banner-item-form"

export const Route = createFileRoute("/_dashboard/banner/$groupId/")({
  component: BannerGroupDetailPage,
  validateSearch: modalSearchSchema,
})

function BannerGroupDetailPage() {
  const { groupId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const navigateLocal = useNavigate({ from: Route.fullPath })
  const { data: group } = useBannerGroup(groupId)
  const { data: banners, isPending, error } = useAllBanners(groupId)
  const reorderMutation = useReorderBanners()
  const deleteBannerMutation = useDeleteBanner()
  const deleteGroupMutation = useDeleteBannerGroup()
  const [groupDeleteOpen, setGroupDeleteOpen] = useState(false)
  const [bannerDeleteId, setBannerDeleteId] = useState<string | null>(null)

  const bannerModal =
    search.kind === "banner" && (search.modal === "create" || search.modal === "edit")
      ? search.modal
      : undefined
  const editingBannerId = bannerModal === "edit" ? search.id : undefined

  function closeBannerModal() {
    void navigateLocal({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreateBanner() {
    void navigateLocal({
      search: (prev) => ({ ...prev, ...openCreateChildModal("banner") }),
    })
  }

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
          <Button size="sm" onClick={openCreateBanner}>
            <Plus className="size-4" />
            {m.banner_new_banner()}
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

      {bannerModal === "create" ? (
        <CreateBannerDrawer groupId={groupId} onClose={closeBannerModal} />
      ) : null}
      {bannerModal === "edit" && editingBannerId ? (
        <EditBannerDrawer
          groupId={groupId}
          bannerId={editingBannerId}
          onClose={closeBannerModal}
        />
      ) : null}

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

function CreateBannerDrawer({
  groupId,
  onClose,
}: {
  groupId: string
  onClose: () => void
}) {
  const mutation = useCreateBanner()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  return (
    <FormDrawer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.banner_new_banner()}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <BannerForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={mutation.isPending}
        submitLabel={m.common_create()}
        onSubmit={async (values) => {
          try {
            await mutation.mutateAsync({ groupId, input: values })
            toast.success(m.banner_banner_created())
            onClose()
          } catch (err) {
            toast.error(
              err instanceof ApiError ? err.body.error : m.banner_failed_create_banner(),
            )
          }
        }}
      />
    </FormDrawer>
  )
}

function EditBannerDrawer({
  groupId,
  bannerId,
  onClose,
}: {
  groupId: string
  bannerId: string
  onClose: () => void
}) {
  const { data: banner, isPending: loading, error } = useBanner(bannerId)
  const mutation = useUpdateBanner()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  return (
    <FormDrawer
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !mutation.isPending}
      title={m.common_edit()}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!banner || !formState.canSubmit || mutation.isPending}
          >
            {mutation.isPending ? m.common_saving() : m.common_save_changes()}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error || !banner ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error?.message ?? "Banner not found"}
        </div>
      ) : (
        <BannerForm
          id={FORM_ID}
          hideSubmitButton
          onStateChange={setFormState}
          initial={banner}
          isPending={mutation.isPending}
          submitLabel={m.common_save_changes()}
          onSubmit={async (values) => {
            try {
              await mutation.mutateAsync({
                id: banner.id,
                groupId,
                input: values,
              })
              toast.success("Banner updated")
              onClose()
            } catch (err) {
              toast.error(
                err instanceof ApiError ? err.body.error : "Failed to update",
              )
            }
          }}
        />
      )}
    </FormDrawer>
  )
}
