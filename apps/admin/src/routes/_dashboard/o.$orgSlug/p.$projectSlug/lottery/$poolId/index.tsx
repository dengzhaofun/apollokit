import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useNavigate, Link } from "#/components/router-helpers"
import { format } from "date-fns"
import {
  ArrowLeft,
  CalendarIcon,
  DicesIcon,
  Pencil,
  Plus,
  TargetIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  DetailHeader,
  ErrorState,
  PageBody,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { Skeleton } from "#/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { LotteryPoolForm } from "#/components/lottery/PoolForm"
import { useLotteryPoolForm } from "#/components/lottery/use-pool-form"
import { LotteryDeleteDialog } from "#/components/lottery/DeleteDialog"
import { TierTable } from "#/components/lottery/TierTable"
import { TierForm } from "#/components/lottery/TierForm"
import { PrizeTable } from "#/components/lottery/PrizeTable"
import { PrizeForm } from "#/components/lottery/PrizeForm"
import { PityRuleTable } from "#/components/lottery/PityRuleTable"
import { PityRuleForm } from "#/components/lottery/PityRuleForm"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)
import {
  useLotteryPool,
  useUpdateLotteryPool,
  useDeleteLotteryPool,
  useAllLotteryTiers,
  useCreateLotteryTier,
  useUpdateLotteryTier,
  useDeleteLotteryTier,
  useAllLotteryPrizes,
  useCreateLotteryPrize,
  useUpdateLotteryPrize,
  useDeleteLotteryPrize,
  useAllLotteryPityRules,
  useCreateLotteryPityRule,
  useUpdateLotteryPityRule,
  useDeleteLotteryPityRule,
} from "#/hooks/use-lottery"
import { ApiError } from "#/lib/api-client"
import type { LotteryTier, LotteryPrize, LotteryPityRule } from "#/lib/types/lottery"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/lottery/$poolId/")({
  component: LotteryPoolDetailPage,
})

function LotteryPoolDetailPage() {
  const { poolId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  // Pool
  const { data: pool, isPending, error } = useLotteryPool(poolId)
  const updatePool = useUpdateLotteryPool()
  const deletePool = useDeleteLotteryPool()

  // Tiers
  const { data: tiers, isPending: tiersPending } = useAllLotteryTiers(poolId)
  const createTier = useCreateLotteryTier()
  const updateTier = useUpdateLotteryTier()
  const deleteTier = useDeleteLotteryTier()
  const [showTierForm, setShowTierForm] = useState(false)
  const [editingTier, setEditingTier] = useState<LotteryTier | null>(null)

  // Prizes
  const { data: prizes, isPending: prizesPending } = useAllLotteryPrizes(poolId)
  const createPrize = useCreateLotteryPrize()
  const updatePrize = useUpdateLotteryPrize()
  const deletePrize = useDeleteLotteryPrize()
  const [showPrizeForm, setShowPrizeForm] = useState(false)
  const [editingPrize, setEditingPrize] = useState<LotteryPrize | null>(null)

  // Pity Rules
  const { data: pityRules, isPending: pityPending } = useAllLotteryPityRules(poolId)
  const createPityRule = useCreateLotteryPityRule()
  const updatePityRule = useUpdateLotteryPityRule()
  const deletePityRule = useDeleteLotteryPityRule()
  const [showPityForm, setShowPityForm] = useState(false)
  const [editingPity, setEditingPity] = useState<LotteryPityRule | null>(null)

  if (isPending) {
    return (
      <PageShell>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-lg" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-72" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageShell>
    )
  }

  if (error || !pool) {
    return (
      <PageShell>
        <ErrorState
          title={t("抽奖池加载失败", "Failed to load lottery pool")}
          description={t(
            "可能是这个池被删了,或者网络异常。返回列表重新进入试试。",
            "The pool may have been removed, or the network is flaky.",
          )}
          onRetry={() => window.location.reload()}
          retryLabel={t("重试", "Retry")}
          error={error instanceof Error ? error : null}
        />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <DetailHeader
        icon={<DicesIcon className="size-6" />}
        title={pool.name}
        subtitle={pool.alias ?? undefined}
        status={
          <Badge variant={pool.isActive ? "default" : "outline"}>
            {pool.isActive ? t("活跃", "Active") : t("禁用", "Inactive")}
          </Badge>
        }
        meta={[
          {
            icon: <TargetIcon />,
            label: pool.globalPullLimit
              ? `${pool.globalPullCount} / ${pool.globalPullLimit}`
              : `${pool.globalPullCount} (${t("无上限", "unlimited")})`,
            key: t("抽取次数", "Pulls"),
          },
          {
            icon: <CalendarIcon />,
            label: format(new Date(pool.createdAt), "yyyy-MM-dd HH:mm"),
            key: t("创建时间", "Created"),
          },
        ]}
        actions={
          <>
            <Button
              render={
                <Link to="/lottery">
                  <ArrowLeft />
                  {t("返回", "Back")}
                </Link>
              }
              variant="ghost" size="sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(!editing)}
            >
              <Pencil />
              {editing ? t("取消", "Cancel") : t("编辑", "Edit")}
            </Button>
            <LotteryDeleteDialog
              name={pool.name}
              description={t(
                "删除会同时清除该抽奖池的所有 tier / prize / pity rule / 抽取日志,不可恢复。",
                "This permanently deletes the pool, all tiers, prizes, pity rules, and pull logs.",
              )}
              isPending={deletePool.isPending}
              onConfirm={async () => {
                try {
                  await deletePool.mutateAsync(pool.id)
                  toast.success(t("已删除", "Pool deleted"))
                  navigate({ to: "/o/$orgSlug/p/$projectSlug/lottery" })
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.body.error
                      : t("删除失败", "Failed to delete pool"),
                  )
                }
              }}
            />
          </>
        }
      />

      <PageBody>
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">{t("配置", "Config")}</TabsTrigger>
            <TabsTrigger value="tiers">
              {t("奖项分级", "Tiers")} ({tiers?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="prizes">
              {t("奖品", "Prizes")} ({prizes?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="pity" disabled={!tiers?.length}>
              {t("保底规则", "Pity rules")} ({pityRules?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          {/* Config Tab */}
          <TabsContent value="config" className="mt-4">
          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <EditLotteryPoolForm
                pool={pool}
                isPending={updatePool.isPending}
                onSave={async (values) => {
                  try {
                    await updatePool.mutateAsync({ id: pool.id, ...values })
                    toast.success("Pool updated")
                    setEditing(false)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError ? err.body.error : "Failed to update pool",
                    )
                  }
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label="Name" value={pool.name} />
                <DetailItem
                  label="Alias"
                  value={
                    pool.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {pool.alias}
                      </code>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem
                  label="Status"
                  value={
                    <Badge variant={pool.isActive ? "default" : "outline"}>
                      {pool.isActive ? "Active" : "Inactive"}
                    </Badge>
                  }
                />
                <DetailItem
                  label="Pulls"
                  value={
                    pool.globalPullLimit
                      ? `${pool.globalPullCount} / ${pool.globalPullLimit}`
                      : `${pool.globalPullCount} (unlimited)`
                  }
                />
                <DetailItem
                  label="Cost Per Pull"
                  value={
                    pool.costPerPull.length === 0
                      ? "Free (item-triggered)"
                      : `${pool.costPerPull.length} item(s)`
                  }
                />
                <DetailItem
                  label="Created"
                  value={format(new Date(pool.createdAt), "yyyy-MM-dd HH:mm")}
                />
                {pool.description && (
                  <div className="sm:col-span-2">
                    <DetailItem label="Description" value={pool.description} />
                  </div>
                )}
              </div>
            </div>
          )}

          </TabsContent>

          {/* Tiers Tab */}
          <TabsContent value="tiers" className="mt-4 space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Tiers</h3>
              <Button
                size="sm"
                onClick={() => {
                  setEditingTier(null)
                  setShowTierForm(!showTierForm)
                }}
              >
                <Plus className="size-4" />
                New Tier
              </Button>
            </div>
            {(showTierForm || editingTier) && (
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <TierForm
                  defaultValues={editingTier ? {
                    name: editingTier.name,
                    alias: editingTier.alias,
                    baseWeight: editingTier.baseWeight,
                    color: editingTier.color,
                    isActive: editingTier.isActive,
                  } : undefined}
                  submitLabel={editingTier ? "Save Changes" : "Create"}
                  isPending={editingTier ? updateTier.isPending : createTier.isPending}
                  onCancel={() => {
                    setShowTierForm(false)
                    setEditingTier(null)
                  }}
                  onSubmit={async (values) => {
                    try {
                      if (editingTier) {
                        await updateTier.mutateAsync({
                          tierId: editingTier.id,
                          ...values,
                        })
                        toast.success("Tier updated")
                        setEditingTier(null)
                      } else {
                        await createTier.mutateAsync({
                          poolKey: poolId,
                          ...values,
                        })
                        toast.success("Tier created")
                        setShowTierForm(false)
                      }
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? err.body.error
                          : "Failed to save tier",
                      )
                    }
                  }}
                />
              </div>
            )}
            {tiersPending ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <TierTable
                  data={tiers ?? []}
                  onEdit={(tier) => {
                    setShowTierForm(false)
                    setEditingTier(tier)
                  }}
                  onDelete={async (tier) => {
                    try {
                      await deleteTier.mutateAsync(tier.id)
                      toast.success("Tier deleted")
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? err.body.error
                          : "Failed to delete tier",
                      )
                    }
                  }}
                />
              </div>
            )}
          </div>

          </TabsContent>

          {/* Prizes Tab */}
          <TabsContent value="prizes" className="mt-4 space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Prizes</h3>
              <Button
                size="sm"
                onClick={() => {
                  setEditingPrize(null)
                  setShowPrizeForm(!showPrizeForm)
                }}
              >
                <Plus className="size-4" />
                New Prize
              </Button>
            </div>
            {(showPrizeForm || editingPrize) && (
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <PrizeForm
                  tiers={tiers}
                  defaultValues={editingPrize ? {
                    name: editingPrize.name,
                    description: editingPrize.description,
                    rewardItems: editingPrize.rewardItems,
                    weight: editingPrize.weight,
                    isRateUp: editingPrize.isRateUp,
                    rateUpWeight: editingPrize.rateUpWeight,
                    globalStockLimit: editingPrize.globalStockLimit,
                    isActive: editingPrize.isActive,
                    tierId: editingPrize.tierId,
                  } : undefined}
                  submitLabel={editingPrize ? "Save Changes" : "Create"}
                  isPending={editingPrize ? updatePrize.isPending : createPrize.isPending}
                  onCancel={() => {
                    setShowPrizeForm(false)
                    setEditingPrize(null)
                  }}
                  onSubmit={async (values) => {
                    try {
                      const { tierId, ...prizeInput } = values
                      if (editingPrize) {
                        await updatePrize.mutateAsync({
                          prizeId: editingPrize.id,
                          ...prizeInput,
                        })
                        toast.success("Prize updated")
                        setEditingPrize(null)
                      } else {
                        await createPrize.mutateAsync({
                          poolKey: poolId,
                          tierId,
                          ...prizeInput,
                        })
                        toast.success("Prize created")
                        setShowPrizeForm(false)
                      }
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? err.body.error
                          : "Failed to save prize",
                      )
                    }
                  }}
                />
              </div>
            )}
            {prizesPending ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <PrizeTable
                  data={prizes ?? []}
                  tiers={tiers}
                  onEdit={(prize) => {
                    setShowPrizeForm(false)
                    setEditingPrize(prize)
                  }}
                  onDelete={async (prize) => {
                    try {
                      await deletePrize.mutateAsync(prize.id)
                      toast.success("Prize deleted")
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? err.body.error
                          : "Failed to delete prize",
                      )
                    }
                  }}
                />
              </div>
            )}
          </div>

          </TabsContent>

          {/* Pity Rules Tab (only when tiers exist) */}
          <TabsContent value="pity" className="mt-4 space-y-3">
          {tiers && tiers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Pity Rules</h3>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingPity(null)
                    setShowPityForm(!showPityForm)
                  }}
                >
                  <Plus className="size-4" />
                  New Rule
                </Button>
              </div>
              {(showPityForm || editingPity) && (
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                  <PityRuleForm
                    tiers={tiers}
                    defaultValues={editingPity ? {
                      guaranteeTierId: editingPity.guaranteeTierId,
                      hardPityThreshold: editingPity.hardPityThreshold,
                      softPityStartAt: editingPity.softPityStartAt,
                      softPityWeightIncrement: editingPity.softPityWeightIncrement,
                      isActive: editingPity.isActive,
                    } : undefined}
                    submitLabel={editingPity ? "Save Changes" : "Create"}
                    isPending={editingPity ? updatePityRule.isPending : createPityRule.isPending}
                    disableGuaranteeTier={!!editingPity}
                    onCancel={() => {
                      setShowPityForm(false)
                      setEditingPity(null)
                    }}
                    onSubmit={async (values) => {
                      try {
                        if (editingPity) {
                          await updatePityRule.mutateAsync({
                            ruleId: editingPity.id,
                            hardPityThreshold: values.hardPityThreshold,
                            softPityStartAt: values.softPityStartAt,
                            softPityWeightIncrement: values.softPityWeightIncrement,
                            isActive: values.isActive,
                          })
                          toast.success("Pity rule updated")
                          setEditingPity(null)
                        } else {
                          await createPityRule.mutateAsync({
                            poolKey: poolId,
                            ...values,
                          })
                          toast.success("Pity rule created")
                          setShowPityForm(false)
                        }
                      } catch (err) {
                        toast.error(
                          err instanceof ApiError
                            ? err.body.error
                            : "Failed to save pity rule",
                        )
                      }
                    }}
                  />
                </div>
              )}
              {pityPending ? (
                <div className="flex h-24 items-center justify-center text-muted-foreground">
                  Loading...
                </div>
              ) : (
                <div className="rounded-xl border bg-card shadow-sm">
                  <PityRuleTable
                    data={pityRules ?? []}
                    tiers={tiers}
                    onEdit={(rule) => {
                      setShowPityForm(false)
                      setEditingPity(rule)
                    }}
                    onDelete={async (rule) => {
                      try {
                        await deletePityRule.mutateAsync(rule.id)
                        toast.success("Pity rule deleted")
                      } catch (err) {
                        toast.error(
                          err instanceof ApiError
                            ? err.body.error
                            : "Failed to delete pity rule",
                        )
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}
          </TabsContent>
        </Tabs>
      </PageBody>
    </PageShell>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}

function EditLotteryPoolForm({
  pool,
  isPending,
  onSave,
}: {
  pool: NonNullable<ReturnType<typeof useLotteryPool>["data"]>
  isPending: boolean
  onSave: (values: Parameters<NonNullable<Parameters<typeof useLotteryPoolForm>[0]["onSubmit"]>>[0]) => void | Promise<void>
}) {
  const form = useLotteryPoolForm({
    defaultValues: {
      name: pool.name,
      alias: pool.alias,
      description: pool.description,
      isActive: pool.isActive,
      globalPullLimit: pool.globalPullLimit,
    },
    onSubmit: onSave,
  })
  return (
    <LotteryPoolForm
      form={form}
      submitLabel="Save Changes"
      isPending={isPending}
    />
  )
}
