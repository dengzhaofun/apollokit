import { useEffect, useState } from "react"
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router"
import { ArrowLeft, Pencil, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { CampaignForm } from "#/components/offline-check-in/CampaignForm"
import { ProgressTable } from "#/components/offline-check-in/ProgressTable"
import { SpotList } from "#/components/offline-check-in/SpotList"
import { useCampaignForm } from "#/components/offline-check-in/use-campaign-form"
import { PageBody, PageHeader, PageShell } from "#/components/patterns"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import {
  useDeleteOfflineCheckInCampaign,
  useOfflineCheckInCampaign,
  useUpdateOfflineCheckInCampaign,
} from "#/hooks/use-offline-check-in"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import * as m from "#/paraglide/messages.js"
import { z } from "zod"

const detailSearch = z
  .object({ delete: z.boolean().optional() })
  .merge(listSearchSchema)
  .passthrough()

export const Route = createFileRoute("/_dashboard/offline-check-in/$campaignId/")(
  {
    component: OfflineCheckInDetailPage,
    validateSearch: detailSearch,
  },
)

function statusVariant(status: string) {
  if (status === "active") return "default" as const
  if (status === "draft") return "outline" as const
  return "secondary" as const
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
      return m.offline_checkin_status_draft()
    case "published":
      return m.offline_checkin_status_published()
    case "active":
      return m.offline_checkin_status_active()
    case "ended":
      return m.offline_checkin_status_ended()
    default:
      return status
  }
}

function OfflineCheckInDetailPage() {
  const { campaignId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [editing, setEditing] = useState(false)

  const { data: campaign, isPending, error } = useOfflineCheckInCampaign(campaignId)
  const updateMutation = useUpdateOfflineCheckInCampaign()
  const deleteMutation = useDeleteOfflineCheckInCampaign()

  const form = useCampaignForm({
    defaultValues: campaign ?? undefined,
    onSubmit: async (values) => {
      if (!campaign) return
      try {
        await updateMutation.mutateAsync({ id: campaign.id, ...values })
        toast.success(m.offline_checkin_campaign_updated())
        setEditing(false)
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.body.error
            : m.offline_checkin_failed_update(),
        )
      }
    },
  })

  // Re-seed the form when the campaign data lands or changes. The form
  // controller's `reset` accepts any subset that maps onto its values
  // shape; we lift the editable fields out by name (skipping server-only
  // fields like id/tenantId/status).
  useEffect(() => {
    if (!campaign) return
    form.reset({
      name: campaign.name,
      alias: campaign.alias ?? "",
      description: campaign.description ?? "",
      bannerImage: campaign.bannerImage ?? "",
      mode: campaign.mode,
      completionRule: campaign.completionRule,
      completionRewards: campaign.completionRewards,
      startAt: campaign.startAt ?? "",
      endAt: campaign.endAt ?? "",
      timezone: campaign.timezone,
      collectionAlbumId: campaign.collectionAlbumId ?? "",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, campaign?.updatedAt])

  function handleStatus(next: "published" | "active" | "ended") {
    if (!campaign) return
    updateMutation
      .mutateAsync({ id: campaign.id, status: next })
      .then(() => toast.success(m.offline_checkin_campaign_updated()))
      .catch((err) => {
        toast.error(
          err instanceof ApiError
            ? err.body.error
            : m.offline_checkin_failed_update(),
        )
      })
  }

  if (isPending) {
    return (
      <PageShell>
        <PageBody>
          <p className="text-muted-foreground">{m.common_loading()}</p>
        </PageBody>
      </PageShell>
    )
  }
  if (error || !campaign) {
    return (
      <PageShell>
        <PageBody>
          <p className="text-destructive">
            {error?.message ?? m.offline_checkin_failed_load()}
          </p>
        </PageBody>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title={campaign.name}
        description={campaign.description ?? undefined}
        actions={
          <>
            <Badge variant={statusVariant(campaign.status)}>
              {statusLabel(campaign.status)}
            </Badge>
            <Button
              render={
                <Link to="/offline-check-in">
                  <ArrowLeft className="size-4" />
                  {m.common_back()}
                </Link>
              }
              variant="outline"
              size="sm"
            />
            {campaign.status === "draft" ? (
              <Button
                size="sm"
                onClick={() => handleStatus("active")}
                disabled={updateMutation.isPending}
              >
                {m.offline_checkin_publish()}
              </Button>
            ) : null}
            {campaign.status === "active" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStatus("ended")}
                disabled={updateMutation.isPending}
              >
                {m.offline_checkin_end_campaign()}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="size-4" />
              {editing ? m.common_cancel() : m.common_edit()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navigate({
                  search: (prev) => ({ ...prev, delete: true }),
                })
              }
            >
              <Trash2 className="size-4" />
              {m.common_delete()}
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="space-y-8">
          {editing ? (
            <div className="rounded-md border p-4 space-y-4">
              <CampaignForm
                form={form}
                isPending={updateMutation.isPending}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditing(false)}
                  disabled={updateMutation.isPending}
                >
                  {m.common_cancel()}
                </Button>
                <Button
                  onClick={() => form.handleSubmit()}
                  disabled={updateMutation.isPending}
                >
                  <Save className="size-4" />
                  {updateMutation.isPending
                    ? m.common_saving()
                    : m.common_save()}
                </Button>
              </div>
            </div>
          ) : null}

          <SpotList campaignId={campaign.id} />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              {m.offline_checkin_progress_title()}
            </h2>
            <ProgressTable campaignKey={campaign.id} route={Route} />
          </section>
        </div>
      </PageBody>

      <Dialog
        open={!!search.delete}
        onOpenChange={(o) => {
          if (!o)
            void navigate({
              search: (prev) => ({ ...prev, delete: undefined }),
            })
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{m.common_delete()}</DialogTitle>
            <DialogDescription>{campaign.name}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                void navigate({
                  search: (prev) => ({ ...prev, delete: undefined }),
                })
              }
            >
              {m.common_cancel()}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteMutation
                  .mutateAsync(campaign.id)
                  .then(() => {
                    toast.success(m.offline_checkin_campaign_deleted())
                    void navigate({ to: "/offline-check-in" })
                  })
                  .catch((err) => {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : m.offline_checkin_failed_delete(),
                    )
                  })
              }
            >
              {m.common_delete()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

