import { useTenantParams } from "#/hooks/use-tenant-params";
import {
  ArchiveX,
  ArrowLeft,
  Copy,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { z } from "zod"

import { AnalyticsPanel } from "#/components/experiment/AnalyticsPanel"
import { BucketingPreview } from "#/components/experiment/BucketingPreview"
import { PreflightDialog } from "#/components/experiment/PreflightDialog"
import { RunningBanner } from "#/components/experiment/RunningBanner"
import { ExperimentStatusBadge } from "#/components/experiment/StatusBadge"
import { TargetingPreview } from "#/components/experiment/TargetingPreview"
import { TargetingRuleEditor } from "#/components/experiment/TargetingRuleEditor"
import { VariantTable } from "#/components/experiment/VariantTable"
import {
  DetailHeader,
  DetailLayout,
  PageBody,
  PageShell,
  confirm,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { Skeleton } from "#/components/ui/skeleton"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "#/components/ui/tabs"
import {
  useDeleteExperiment,
  useExperiment,
  useExperimentVariants,
  useTransitionExperiment,
  useUpdateExperiment,
} from "#/hooks/use-experiment"
import { ApiError } from "#/lib/api-client"
import type {
  Experiment,
  ExperimentTargetingRules,
} from "#/lib/types/experiment"
import * as m from "#/paraglide/messages.js"

const detailSearchSchema = z
  .object({
    tab: z.enum(["config", "analytics"]).optional(),
  })
  .passthrough()

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/experiment/$experimentKey")({
  component: ExperimentDetailPage,
  validateSearch: detailSearchSchema,
})

function ExperimentDetailPage() {
  const { experimentKey } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const expQuery = useExperiment(experimentKey)
  const variantsQuery = useExperimentVariants(experimentKey)
  const transition = useTransitionExperiment()
  const updateExp = useUpdateExperiment()
  const { orgSlug, projectSlug } = useTenantParams()
  const [draftTargeting, setDraftTargeting] =
    useState<ExperimentTargetingRules | undefined>(undefined)

  const tab = (search.tab ?? "config") as "config" | "analytics"

  function setTab(next: "config" | "analytics") {
    void navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        tab: next === "config" ? undefined : next,
      }),
    })
  }

  // Pause handler shared by both the dropdown and the inline
  // RunningBanner. Lifted here so the banner's `onPause` calls the
  // same mutation instance.
  async function pauseFromBanner() {
    if (!expQuery.data) return
    const ok = await confirm({
      title: m.experiment_pause_title(),
      description: m.experiment_pause_body({
        count: (expQuery.data.assignedUsers ?? 0).toLocaleString(),
      }),
      confirmLabel: m.experiment_action_pause(),
    })
    if (!ok) return
    try {
      await transition.mutateAsync({ id: expQuery.data.id, to: "paused" })
      toast.success(
        m.experiment_paused({ name: expQuery.data.name }),
      )
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.body.message
          : m.experiment_failed_generic(),
      )
    }
  }

  if (expQuery.isLoading || !expQuery.data) {
    return (
      <PageShell>
        <Skeleton className="h-12 w-full max-w-md" />
        <PageBody>
          <Skeleton className="h-64 w-full" />
        </PageBody>
      </PageShell>
    )
  }
  if (expQuery.isError) {
    return (
      <PageShell>
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {expQuery.error?.message ?? m.experiment_failed_generic()}
        </div>
      </PageShell>
    )
  }

  const experiment = expQuery.data
  const variants = variantsQuery.data ?? []
  const locked = experiment.status === "running"

  const targetingValue =
    draftTargeting !== undefined ? draftTargeting : experiment.targetingRules
  const targetingDirty =
    JSON.stringify(targetingValue ?? {}) !==
    JSON.stringify(experiment.targetingRules ?? {})

  async function saveTargeting() {
    try {
      await updateExp.mutateAsync({
        id: experiment.id,
        targetingRules: targetingValue,
      })
      setDraftTargeting(undefined)
      toast.success(m.experiment_targeting_saved())
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.body.message
          : m.experiment_failed_generic(),
      )
    }
  }

  return (
    <PageShell>
      <DetailHeader
        icon={
          <Link
            to="/o/$orgSlug/p/$projectSlug/experiment" params={{ orgSlug, projectSlug }}
            className="flex size-full items-center justify-center hover:opacity-80"
          >
            <ArrowLeft className="size-5" />
          </Link>
        }
        title={experiment.name}
        subtitle={experiment.key}
        status={<ExperimentStatusBadge status={experiment.status} />}
        actions={
          <ActionsBar
            experiment={experiment}
            variants={variants}
          />
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="config">{m.experiment_tab_config()}</TabsTrigger>
          <TabsTrigger value="analytics">
            {m.experiment_tab_analytics()}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <PageBody>
        {tab === "config" ? (
          <DetailLayout
            side={
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {m.experiment_bucketing_section()}
                  </CardTitle>
                  <CardDescription>
                    {m.experiment_bucketing_section_hint()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BucketingPreview experiment={experiment} />
                </CardContent>
              </Card>
            }
          >
            {locked && <RunningBanner onPause={pauseFromBanner} />}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {m.experiment_basic_info_title()}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Field
                  label={m.experiment_field_description()}
                  value={experiment.description || "—"}
                />
                <Field
                  label={m.experiment_field_control_variant()}
                  value={
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {experiment.controlVariantKey}
                    </code>
                  }
                />
                {experiment.startedAt && (
                  <Field
                    label={m.experiment_field_started_at()}
                    value={new Date(experiment.startedAt).toLocaleString()}
                  />
                )}
                {experiment.endedAt && (
                  <Field
                    label={m.experiment_field_ended_at()}
                    value={new Date(experiment.endedAt).toLocaleString()}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {m.experiment_variants_section()}
                </CardTitle>
                <CardDescription>
                  {m.experiment_variants_section_hint()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {variantsQuery.isLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : (
                  <VariantTable
                    experiment={experiment}
                    variants={variants}
                    locked={locked}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {m.experiment_targeting_section()}
                </CardTitle>
                <CardDescription>
                  {m.experiment_targeting_section_hint()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <TargetingRuleEditor
                  value={targetingValue}
                  onChange={setDraftTargeting}
                  disabled={updateExp.isPending}
                />
                <TargetingPreview
                  experiment={experiment}
                  draftRules={targetingValue}
                />
                {targetingDirty && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDraftTargeting(undefined)}
                      disabled={updateExp.isPending}
                    >
                      {m.common_reset()}
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveTargeting}
                      disabled={updateExp.isPending}
                    >
                      {updateExp.isPending ? m.common_saving() : m.common_save()}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </DetailLayout>
        ) : (
          <AnalyticsPanel experiment={experiment} />
        )}
      </PageBody>
    </PageShell>
  )
}

function Field({
  label,
  value,
}: {
  label: React.ReactNode
  value: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  )
}

function ActionsBar({
  experiment,
  variants,
}: {
  experiment: Experiment
  variants: import("#/lib/types/experiment").ExperimentVariant[]
}) {
    const { orgSlug, projectSlug } = useTenantParams()
  const transition = useTransitionExperiment()
  const del = useDeleteExperiment()
  const navigate = useNavigate()
  const [preflightOpen, setPreflightOpen] = useState(false)

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(experiment.key)
      toast.success(m.experiment_key_copied())
    } catch {
      toast.error(m.experiment_failed_generic())
    }
  }

  async function handlePause() {
    const ok = await confirm({
      title: m.experiment_pause_title(),
      description: m.experiment_pause_body({
        count: (experiment.assignedUsers ?? 0).toLocaleString(),
      }),
      confirmLabel: m.experiment_action_pause(),
    })
    if (!ok) return
    try {
      await transition.mutateAsync({ id: experiment.id, to: "paused" })
      toast.success(m.experiment_paused({ name: experiment.name }))
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.message : m.experiment_failed_generic(),
      )
    }
  }

  async function handleArchive() {
    const ok = await confirm({
      title: m.experiment_archive_title(),
      description: m.experiment_archive_body({
        users: (experiment.assignedUsers ?? 0).toLocaleString(),
      }),
      confirmLabel: m.experiment_action_archive(),
      danger: true,
    })
    if (!ok) return
    try {
      await transition.mutateAsync({ id: experiment.id, to: "archived" })
      toast.success(m.experiment_archived({ name: experiment.name }))
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.message : m.experiment_failed_generic(),
      )
    }
  }

  async function handleRestore() {
    try {
      await transition.mutateAsync({ id: experiment.id, to: "draft" })
      toast.success(m.experiment_restored({ name: experiment.name }))
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.message : m.experiment_failed_generic(),
      )
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: m.experiment_delete_confirm_title({ name: experiment.name }),
      description: m.experiment_delete_confirm_body(),
      confirmLabel: m.common_delete(),
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(experiment.id)
      void navigate({ to: "/o/$orgSlug/p/$projectSlug/experiment" , params: { orgSlug, projectSlug }})
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.message : m.experiment_failed_generic(),
      )
    }
  }

  const canStart = experiment.status === "draft"
  const canPause = experiment.status === "running"
  const canArchive =
    experiment.status === "running" || experiment.status === "paused"
  const canRestore = experiment.status === "archived"
  const canDelete =
    experiment.status === "draft" || experiment.status === "archived"

  return (
    <>
      {canStart && (
        <Button size="sm" onClick={() => setPreflightOpen(true)}>
          <Play className="size-4" />
          {m.experiment_action_start()}
        </Button>
      )}
      {canPause && (
        <Button size="sm" variant="outline" onClick={handlePause}>
          <Pause className="size-4" />
          {m.experiment_action_pause()}
        </Button>
      )}
      {experiment.status === "paused" && (
        <Button size="sm" onClick={() => setPreflightOpen(true)}>
          <Play className="size-4" />
          {m.experiment_action_resume()}
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">{m.common_actions()}</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={copyKey}>
            <Copy className="size-4" />
            {m.experiment_action_copy_key()}
          </DropdownMenuItem>
          {canArchive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleArchive}>
                <ArchiveX className="size-4" />
                {m.experiment_action_archive()}
              </DropdownMenuItem>
            </>
          )}
          {canRestore && (
            <DropdownMenuItem onClick={handleRestore}>
              <RotateCcw className="size-4" />
              {m.experiment_action_restore()}
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete}>
                <Trash2 className="size-4" />
                {m.common_delete()}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {(experiment.status === "draft" || experiment.status === "paused") && (
        <PreflightDialog
          experiment={experiment}
          variants={variants}
          open={preflightOpen}
          onClose={() => setPreflightOpen(false)}
        />
      )}
    </>
  )
}

