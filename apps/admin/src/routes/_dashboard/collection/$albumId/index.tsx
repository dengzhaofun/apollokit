import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Pencil, Plus, RefreshCw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AlbumForm } from "#/components/collection/AlbumForm"
import { CollectionDeleteDialog } from "#/components/collection/DeleteDialog"
import { EntryForm } from "#/components/collection/EntryForm"
import { GroupForm } from "#/components/collection/GroupForm"
import { MilestoneForm } from "#/components/collection/MilestoneForm"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import {
  useCollectionAlbum,
  useCollectionEntries,
  useCollectionGroups,
  useCollectionMilestones,
  useCollectionRescan,
  useCollectionStats,
  useCreateCollectionEntry,
  useCreateCollectionGroup,
  useCreateCollectionMilestone,
  useDeleteCollectionAlbum,
  useDeleteCollectionEntry,
  useDeleteCollectionGroup,
  useDeleteCollectionMilestone,
  useUpdateCollectionAlbum,
  useUpdateCollectionEntry,
  useUpdateCollectionGroup,
  useUpdateCollectionMilestone,
} from "#/hooks/use-collection"
import { useItemDefinitions } from "#/hooks/use-item"
import { ApiError } from "#/lib/api-client"
import type {
  CollectionEntry,
  CollectionGroup,
  CollectionMilestone,
} from "#/lib/types/collection"
import type { ItemDefinition } from "#/lib/types/item"

export const Route = createFileRoute("/_dashboard/collection/$albumId/")({
  component: CollectionAlbumDetailPage,
})

const SCOPE_LABELS: Record<string, string> = {
  entry: "条目",
  group: "分组",
  album: "整本",
}

function CollectionAlbumDetailPage() {
  const { albumId } = Route.useParams()
  const navigate = useNavigate()

  const { data: album, isPending, error } = useCollectionAlbum(albumId)
  const { data: groups = [] } = useCollectionGroups(albumId)
  const { data: entries = [] } = useCollectionEntries(albumId)
  const { data: milestones = [] } = useCollectionMilestones(albumId)
  const { data: itemDefs = [] } = useItemDefinitions()

  const deleteAlbumMutation = useDeleteCollectionAlbum()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        加载中...
      </div>
    )
  }
  if (error || !album) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        加载失败: {error?.message ?? "未找到图鉴"}
      </div>
    )
  }

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Button asChild variant="ghost" size="icon">
          <Link to="/collection">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">{album.name}</h1>
        <div className="ml-auto">
          <CollectionDeleteDialog
            title="删除图鉴"
            description={`确定要删除「${album.name}」吗？该操作不可恢复，关联的所有分组、条目、里程碑和玩家进度都会被清除。`}
            onConfirm={async () => {
              try {
                await deleteAlbumMutation.mutateAsync(album.id)
                toast.success("图鉴已删除")
                navigate({ to: "/collection" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error("删除失败")
              }
            }}
            isPending={deleteAlbumMutation.isPending}
            triggerLabel="删除图鉴"
          />
        </div>
      </header>

      <main className="flex-1 p-6">
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">基本信息</TabsTrigger>
            <TabsTrigger value="groups">分组 ({groups.length})</TabsTrigger>
            <TabsTrigger value="entries">条目 ({entries.length})</TabsTrigger>
            <TabsTrigger value="milestones">
              里程碑 ({milestones.length})
            </TabsTrigger>
            <TabsTrigger value="stats">数据</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <AlbumInfoTab albumId={album.id} initial={album} />
          </TabsContent>

          <TabsContent value="groups" className="mt-4">
            <GroupsTab albumKey={album.id} groups={groups} />
          </TabsContent>

          <TabsContent value="entries" className="mt-4">
            <EntriesTab
              albumKey={album.id}
              groups={groups}
              entries={entries}
              itemDefs={itemDefs}
            />
          </TabsContent>

          <TabsContent value="milestones" className="mt-4">
            <MilestonesTab
              albumKey={album.id}
              groups={groups}
              entries={entries}
              milestones={milestones}
              itemDefs={itemDefs}
            />
          </TabsContent>

          <TabsContent value="stats" className="mt-4">
            <StatsTab albumKey={album.id} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}

// ─── Info tab ────────────────────────────────────────────────────

function AlbumInfoTab({
  albumId,
  initial,
}: {
  albumId: string
  initial: NonNullable<ReturnType<typeof useCollectionAlbum>["data"]>
}) {
  const updateMutation = useUpdateCollectionAlbum()
  return (
    <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 shadow-sm">
      <AlbumForm
        initial={initial}
        submitLabel="保存"
        isPending={updateMutation.isPending}
        onSubmit={async (values) => {
          try {
            await updateMutation.mutateAsync({ id: albumId, input: values })
            toast.success("已保存")
          } catch (err) {
            if (err instanceof ApiError) toast.error(err.body.error)
            else toast.error("保存失败")
          }
        }}
      />
    </div>
  )
}

// ─── Groups tab ──────────────────────────────────────────────────

function GroupsTab({
  albumKey,
  groups,
}: {
  albumKey: string
  groups: CollectionGroup[]
}) {
  const [openCreate, setOpenCreate] = useState(false)
  const [editing, setEditing] = useState<CollectionGroup | null>(null)
  const createMutation = useCreateCollectionGroup()
  const updateMutation = useUpdateCollectionGroup()
  const deleteMutation = useDeleteCollectionGroup()

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="size-4" /> 新建分组
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>排序</TableHead>
              <TableHead>描述</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center">
                  暂无分组
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>{g.sortOrder}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {g.description ?? "-"}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(g)}
                    >
                      <Pencil className="size-4" /> 编辑
                    </Button>
                    <CollectionDeleteDialog
                      title="删除分组"
                      description={`确定要删除「${g.name}」吗？该分组下的条目会被移到未分组。`}
                      onConfirm={async () => {
                        try {
                          await deleteMutation.mutateAsync({
                            id: g.id,
                            albumKey,
                          })
                          toast.success("分组已删除")
                        } catch (err) {
                          if (err instanceof ApiError) toast.error(err.body.error)
                        }
                      }}
                      isPending={deleteMutation.isPending}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建分组</DialogTitle>
          </DialogHeader>
          <GroupForm
            submitLabel="创建"
            isPending={createMutation.isPending}
            onCancel={() => setOpenCreate(false)}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync({
                  albumKey,
                  input: values,
                })
                toast.success("分组已创建")
                setOpenCreate(false)
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑分组</DialogTitle>
          </DialogHeader>
          {editing ? (
            <GroupForm
              initial={editing}
              submitLabel="保存"
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    albumKey,
                    input: values,
                  })
                  toast.success("已保存")
                  setEditing(null)
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Entries tab ─────────────────────────────────────────────────

function EntriesTab({
  albumKey,
  groups,
  entries,
  itemDefs,
}: {
  albumKey: string
  groups: CollectionGroup[]
  entries: CollectionEntry[]
  itemDefs: ItemDefinition[]
}) {
  const [openCreate, setOpenCreate] = useState(false)
  const [editing, setEditing] = useState<CollectionEntry | null>(null)
  const createMutation = useCreateCollectionEntry()
  const updateMutation = useUpdateCollectionEntry()
  const deleteMutation = useDeleteCollectionEntry()

  const groupById = new Map(groups.map((g) => [g.id, g.name]))
  const defById = new Map(itemDefs.map((d) => [d.id, d.name]))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="size-4" /> 新建条目
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>分组</TableHead>
              <TableHead>稀有度</TableHead>
              <TableHead>触发物品</TableHead>
              <TableHead>所需数量</TableHead>
              <TableHead>隐藏</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-20 text-center">
                  暂无条目
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    {e.groupId ? groupById.get(e.groupId) ?? "-" : "-"}
                  </TableCell>
                  <TableCell>
                    {e.rarity ? (
                      <Badge variant="secondary">{e.rarity}</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {e.triggerItemDefinitionId
                      ? defById.get(e.triggerItemDefinitionId) ?? e.triggerItemDefinitionId
                      : "-"}
                  </TableCell>
                  <TableCell>{e.triggerQuantity}</TableCell>
                  <TableCell>
                    {e.hiddenUntilUnlocked ? (
                      <Badge variant="outline">隐藏</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(e)}
                    >
                      <Pencil className="size-4" /> 编辑
                    </Button>
                    <CollectionDeleteDialog
                      title="删除条目"
                      description={`确定要删除「${e.name}」吗？玩家的解锁进度会一并清除。`}
                      onConfirm={async () => {
                        try {
                          await deleteMutation.mutateAsync({
                            id: e.id,
                            albumKey,
                          })
                          toast.success("条目已删除")
                        } catch (err) {
                          if (err instanceof ApiError) toast.error(err.body.error)
                        }
                      }}
                      isPending={deleteMutation.isPending}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建条目</DialogTitle>
            <DialogDescription>
              绑定一个物品定义，玩家获得该物品数量达到阈值时自动解锁
            </DialogDescription>
          </DialogHeader>
          <EntryForm
            groups={groups}
            itemDefinitions={itemDefs}
            submitLabel="创建"
            isPending={createMutation.isPending}
            onCancel={() => setOpenCreate(false)}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync({
                  albumKey,
                  input: values,
                })
                toast.success("条目已创建")
                setOpenCreate(false)
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑条目</DialogTitle>
          </DialogHeader>
          {editing ? (
            <EntryForm
              initial={editing}
              groups={groups}
              itemDefinitions={itemDefs}
              submitLabel="保存"
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    albumKey,
                    input: values,
                  })
                  toast.success("已保存")
                  setEditing(null)
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Milestones tab ──────────────────────────────────────────────

function MilestonesTab({
  albumKey,
  groups,
  entries,
  milestones,
  itemDefs,
}: {
  albumKey: string
  groups: CollectionGroup[]
  entries: CollectionEntry[]
  milestones: CollectionMilestone[]
  itemDefs: ItemDefinition[]
}) {
  const [openCreate, setOpenCreate] = useState(false)
  const [editing, setEditing] = useState<CollectionMilestone | null>(null)
  const createMutation = useCreateCollectionMilestone()
  const updateMutation = useUpdateCollectionMilestone()
  const deleteMutation = useDeleteCollectionMilestone()

  const groupById = new Map(groups.map((g) => [g.id, g.name]))
  const entryById = new Map(entries.map((e) => [e.id, e.name]))
  const defById = new Map(itemDefs.map((d) => [d.id, d.name]))

  function describeMilestone(m: CollectionMilestone): string {
    if (m.scope === "entry") {
      return `解锁「${entryById.get(m.entryId ?? "") ?? m.entryId}」`
    }
    if (m.scope === "group") {
      return `在「${groupById.get(m.groupId ?? "") ?? m.groupId}」中集齐 ${m.threshold} 个`
    }
    return `整本集齐 ${m.threshold} 个`
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="size-4" /> 新建里程碑
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>范围</TableHead>
              <TableHead>达成条件</TableHead>
              <TableHead>奖励</TableHead>
              <TableHead>发放方式</TableHead>
              <TableHead>文案</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {milestones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center">
                  暂无里程碑
                </TableCell>
              </TableRow>
            ) : (
              milestones.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Badge variant="secondary">
                      {SCOPE_LABELS[m.scope] ?? m.scope}
                    </Badge>
                  </TableCell>
                  <TableCell>{describeMilestone(m)}</TableCell>
                  <TableCell>
                    {m.rewardItems
                      .map(
                        (r) =>
                          `${defById.get(r.definitionId) ?? r.definitionId} ×${r.quantity}`,
                      )
                      .join(", ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.autoClaim ? "default" : "outline"}>
                      {m.autoClaim ? "自动 (邮件)" : "手动领取"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.label ?? "-"}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(m)}
                    >
                      <Pencil className="size-4" /> 编辑
                    </Button>
                    <CollectionDeleteDialog
                      title="删除里程碑"
                      description="确定要删除这个里程碑吗？已领取过的玩家记录保留。"
                      onConfirm={async () => {
                        try {
                          await deleteMutation.mutateAsync({
                            id: m.id,
                            albumKey,
                          })
                          toast.success("里程碑已删除")
                        } catch (err) {
                          if (err instanceof ApiError) toast.error(err.body.error)
                        }
                      }}
                      isPending={deleteMutation.isPending}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>新建里程碑</DialogTitle>
            <DialogDescription>
              配置解锁奖励：可按单个条目、某分组集齐、或整本集齐来给玩家发奖
            </DialogDescription>
          </DialogHeader>
          <MilestoneForm
            groups={groups}
            entries={entries}
            itemDefinitions={itemDefs}
            submitLabel="创建"
            isPending={createMutation.isPending}
            onCancel={() => setOpenCreate(false)}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync({
                  albumKey,
                  input: values,
                })
                toast.success("里程碑已创建")
                setOpenCreate(false)
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑里程碑</DialogTitle>
          </DialogHeader>
          {editing ? (
            <MilestoneForm
              initial={editing}
              groups={groups}
              entries={entries}
              itemDefinitions={itemDefs}
              submitLabel="保存"
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                try {
                  // Update only accepts a subset — send just the mutable fields.
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    albumKey,
                    input: {
                      threshold: values.threshold,
                      label: values.label,
                      rewardItems: values.rewardItems,
                      autoClaim: values.autoClaim,
                      sortOrder: values.sortOrder,
                    },
                  })
                  toast.success("已保存")
                  setEditing(null)
                } catch (err) {
                  if (err instanceof ApiError) toast.error(err.body.error)
                }
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Stats tab ───────────────────────────────────────────────────

function StatsTab({ albumKey }: { albumKey: string }) {
  const { data, isPending, error, refetch, isFetching } =
    useCollectionStats(albumKey)
  const [rescanUserId, setRescanUserId] = useState("")
  const rescanMutation = useCollectionRescan()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        加载中...
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        加载失败: {error?.message ?? "未知错误"}
      </div>
    )
  }

  async function handleRescan() {
    if (!rescanUserId.trim()) {
      toast.error("请输入 endUserId")
      return
    }
    try {
      const res = await rescanMutation.mutateAsync({
        albumKey,
        endUserId: rescanUserId.trim(),
      })
      toast.success(`同步成功，新解锁 ${res.unlocked.length} 个条目`)
      refetch()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error("同步失败")
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="解锁用户总数" value={data.totalEndUsers} />
        <StatCard label="条目数" value={data.entries.length} />
        <StatCard label="里程碑数" value={data.milestones.length} />
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">按条目解锁率</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>条目</TableHead>
              <TableHead className="text-right">解锁人数</TableHead>
              <TableHead className="text-right">解锁率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.map((e) => (
              <TableRow key={e.entryId}>
                <TableCell>{e.name}</TableCell>
                <TableCell className="text-right">{e.unlockedCount}</TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {data.totalEndUsers > 0
                    ? `${Math.round(
                        (e.unlockedCount / data.totalEndUsers) * 100,
                      )}%`
                    : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">按里程碑领取数</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>范围</TableHead>
              <TableHead>阈值</TableHead>
              <TableHead className="text-right">已领取/已发放</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.milestones.map((m) => (
              <TableRow key={m.milestoneId}>
                <TableCell>{SCOPE_LABELS[m.scope] ?? m.scope}</TableCell>
                <TableCell>{m.threshold}</TableCell>
                <TableCell className="text-right">{m.claimedCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">手动同步某玩家</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          扫描玩家库存，补齐因异常丢失的解锁（不会补发邮件，仅点亮条目）
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="rescan-user">endUserId</Label>
            <Input
              id="rescan-user"
              value={rescanUserId}
              onChange={(e) => setRescanUserId(e.target.value)}
              placeholder="例如 player-42"
            />
          </div>
          <Button
            onClick={handleRescan}
            disabled={rescanMutation.isPending || isFetching}
          >
            <RefreshCw className="size-4" />
            {rescanMutation.isPending ? "同步中..." : "同步"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}
