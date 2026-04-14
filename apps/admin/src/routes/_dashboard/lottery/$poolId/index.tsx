import { useState } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft, Plus } from "lucide-react"
import { toast } from "sonner"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { LotteryPoolForm } from "#/components/lottery/PoolForm"
import { LotteryDeleteDialog } from "#/components/lottery/DeleteDialog"
import { TierTable } from "#/components/lottery/TierTable"
import { TierForm } from "#/components/lottery/TierForm"
import { PrizeTable } from "#/components/lottery/PrizeTable"
import { PrizeForm } from "#/components/lottery/PrizeForm"
import { PityRuleTable } from "#/components/lottery/PityRuleTable"
import { PityRuleForm } from "#/components/lottery/PityRuleForm"
import {
  useLotteryPool,
  useUpdateLotteryPool,
  useDeleteLotteryPool,
  useLotteryTiers,
  useCreateLotteryTier,
  useUpdateLotteryTier,
  useDeleteLotteryTier,
  useLotteryPrizes,
  useCreateLotteryPrize,
  useUpdateLotteryPrize,
  useDeleteLotteryPrize,
  useLotteryPityRules,
  useCreateLotteryPityRule,
  useUpdateLotteryPityRule,
  useDeleteLotteryPityRule,
} from "#/hooks/use-lottery"
import { ApiError } from "#/lib/api-client"
import type { LotteryTier, LotteryPrize, LotteryPityRule } from "#/lib/types/lottery"

export const Route = createFileRoute("/_dashboard/lottery/$poolId/")({
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
  const { data: tiers, isPending: tiersPending } = useLotteryTiers(poolId)
  const createTier = useCreateLotteryTier()
  const updateTier = useUpdateLotteryTier()
  const deleteTier = useDeleteLotteryTier()
  const [showTierForm, setShowTierForm] = useState(false)
  const [editingTier, setEditingTier] = useState<LotteryTier | null>(null)

  // Prizes
  const { data: prizes, isPending: prizesPending } = useLotteryPrizes(poolId)
  const createPrize = useCreateLotteryPrize()
  const updatePrize = useUpdateLotteryPrize()
  const deletePrize = useDeleteLotteryPrize()
  const [showPrizeForm, setShowPrizeForm] = useState(false)
  const [editingPrize, setEditingPrize] = useState<LotteryPrize | null>(null)

  // Pity Rules
  const { data: pityRules, isPending: pityPending } = useLotteryPityRules(poolId)
  const createPityRule = useCreateLotteryPityRule()
  const updatePityRule = useUpdateLotteryPityRule()
  const deletePityRule = useDeleteLotteryPityRule()
  const [showPityForm, setShowPityForm] = useState(false)
  const [editingPity, setEditingPity] = useState<LotteryPityRule | null>(null)

  if (isPending) {
    return (
      <>
        <Header title="Loading..." />
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          Loading...
        </main>
      </>
    )
  }

  if (error || !pool) {
    return (
      <>
        <Header title="Error" />
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Pool not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <Header title={pool.name} />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Pool header actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/lottery">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(!editing)}
              >
                <Pencil className="size-4" />
                {editing ? "Cancel" : "Edit"}
              </Button>
              <LotteryDeleteDialog
                name={pool.name}
                description="This will permanently delete this pool, all tiers, prizes, pity rules, and pull logs. This action cannot be undone."
                isPending={deletePool.isPending}
                onConfirm={async () => {
                  try {
                    await deletePool.mutateAsync(pool.id)
                    toast.success("Pool deleted")
                    navigate({ to: "/lottery" })
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to delete pool",
                    )
                  }
                }}
              />
            </div>
          </div>

          {/* Pool info/edit */}
          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <LotteryPoolForm
                defaultValues={{
                  name: pool.name,
                  alias: pool.alias,
                  description: pool.description,
                  isActive: pool.isActive,
                  globalPullLimit: pool.globalPullLimit,
                }}
                submitLabel="Save Changes"
                isPending={updatePool.isPending}
                onSubmit={async (values) => {
                  try {
                    await updatePool.mutateAsync({ id: pool.id, ...values })
                    toast.success("Pool updated")
                    setEditing(false)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to update pool",
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

          {/* Tiers Section */}
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
                    sortOrder: editingTier.sortOrder,
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

          {/* Prizes Section */}
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
                    sortOrder: editingPrize.sortOrder,
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

          {/* Pity Rules Section (only show when tiers exist) */}
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
        </div>
      </main>
    </>
  )
}

function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <h1 className="text-sm font-semibold">{title}</h1>
    </header>
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
