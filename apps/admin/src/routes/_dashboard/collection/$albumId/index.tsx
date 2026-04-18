import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft, Pencil, Plus, RefreshCw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { AlbumForm } from "#/components/collection/AlbumForm"
import { CollectionDeleteDialog } from "#/components/collection/DeleteDialog"
import { EntryForm } from "#/components/collection/EntryForm"
import { GroupForm } from "#/components/collection/GroupForm"
import { MilestoneForm } from "#/components/collection/MilestoneForm"
import { ItemRewardRow } from "#/components/item/ItemRewardRow"
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
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/collection/$albumId/")({
  component: CollectionAlbumDetailPage,
})

function scopeLabel(scope: string): string {
  switch (scope) {
    case "entry":
      return m.collection_scope_label_entry()
    case "group":
      return m.collection_scope_label_group()
    default:
      return m.collection_scope_label_album()
  }
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
        {m.common_loading()}
      </div>
    )
  }
  if (error || !album) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        {m.collection_failed_load()}{" "}
        {error?.message ?? m.collection_not_found()}
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
            title={m.collection_delete_album()}
            description={m.collection_delete_album_desc()}
            onConfirm={async () => {
              try {
                await deleteAlbumMutation.mutateAsync(album.id)
                toast.success(m.collection_album_deleted())
                navigate({ to: "/collection" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.collection_failed_delete())
              }
            }}
            isPending={deleteAlbumMutation.isPending}
            triggerLabel={m.collection_delete_album()}
          />
        </div>
      </header>

      <main className="flex-1 p-6">
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">{m.collection_tab_info()}</TabsTrigger>
            <TabsTrigger value="groups">
              {m.collection_tab_groups()} ({groups.length})
            </TabsTrigger>
            <TabsTrigger value="entries">
              {m.collection_tab_entries()} ({entries.length})
            </TabsTrigger>
            <TabsTrigger value="milestones">
              {m.collection_tab_milestones()} ({milestones.length})
            </TabsTrigger>
            <TabsTrigger value="stats">{m.collection_tab_stats()}</TabsTrigger>
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
        submitLabel={m.common_save_changes()}
        isPending={updateMutation.isPending}
        onSubmit={async (values) => {
          try {
            await updateMutation.mutateAsync({ id: albumId, input: values })
            toast.success(m.collection_album_saved())
          } catch (err) {
            if (err instanceof ApiError) toast.error(err.body.error)
            else toast.error(m.collection_failed_save())
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
          <Plus className="size-4" /> {m.collection_new_group()}
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common_name()}</TableHead>
              <TableHead>{m.common_sort_order()}</TableHead>
              <TableHead>{m.common_description()}</TableHead>
              <TableHead className="text-right">
                {m.common_actions()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center">
                  {m.collection_group_empty()}
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>{g.sortOrder}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {g.description ?? m.common_dash()}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(g)}
                    >
                      <Pencil className="size-4" /> {m.common_edit()}
                    </Button>
                    <CollectionDeleteDialog
                      title={m.collection_edit_group()}
                      description={m.collection_delete_group_desc()}
                      onConfirm={async () => {
                        try {
                          await deleteMutation.mutateAsync({
                            id: g.id,
                            albumKey,
                          })
                          toast.success(m.collection_group_deleted())
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
            <DialogTitle>{m.collection_new_group()}</DialogTitle>
          </DialogHeader>
          <GroupForm
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onCancel={() => setOpenCreate(false)}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync({
                  albumKey,
                  input: values,
                })
                toast.success(m.collection_group_created())
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
            <DialogTitle>{m.collection_edit_group()}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <GroupForm
              initial={editing}
              submitLabel={m.common_save_changes()}
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    albumKey,
                    input: values,
                  })
                  toast.success(m.collection_group_saved())
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
          <Plus className="size-4" /> {m.collection_new_entry()}
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common_name()}</TableHead>
              <TableHead>{m.collection_entry_col_group()}</TableHead>
              <TableHead>{m.collection_entry_col_rarity()}</TableHead>
              <TableHead>{m.collection_entry_col_trigger()}</TableHead>
              <TableHead>{m.collection_entry_col_quantity()}</TableHead>
              <TableHead>{m.collection_entry_col_hidden()}</TableHead>
              <TableHead className="text-right">
                {m.common_actions()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-20 text-center">
                  {m.collection_entry_empty()}
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>
                    {e.groupId
                      ? (groupById.get(e.groupId) ?? m.common_dash())
                      : m.common_dash()}
                  </TableCell>
                  <TableCell>
                    {e.rarity ? (
                      <Badge variant="secondary">{e.rarity}</Badge>
                    ) : (
                      m.common_dash()
                    )}
                  </TableCell>
                  <TableCell>
                    {e.triggerItemDefinitionId
                      ? (defById.get(e.triggerItemDefinitionId) ??
                        e.triggerItemDefinitionId)
                      : m.common_dash()}
                  </TableCell>
                  <TableCell>{e.triggerQuantity}</TableCell>
                  <TableCell>
                    {e.hiddenUntilUnlocked ? (
                      <Badge variant="outline">
                        {m.collection_entry_badge_hidden()}
                      </Badge>
                    ) : (
                      m.common_dash()
                    )}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(e)}
                    >
                      <Pencil className="size-4" /> {m.common_edit()}
                    </Button>
                    <CollectionDeleteDialog
                      title={m.collection_edit_entry()}
                      description={m.collection_delete_entry_desc()}
                      onConfirm={async () => {
                        try {
                          await deleteMutation.mutateAsync({
                            id: e.id,
                            albumKey,
                          })
                          toast.success(m.collection_entry_deleted())
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
            <DialogTitle>{m.collection_new_entry()}</DialogTitle>
            <DialogDescription>
              {m.collection_entry_description()}
            </DialogDescription>
          </DialogHeader>
          <EntryForm
            groups={groups}
            itemDefinitions={itemDefs}
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onCancel={() => setOpenCreate(false)}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync({
                  albumKey,
                  input: values,
                })
                toast.success(m.collection_entry_created())
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
            <DialogTitle>{m.collection_edit_entry()}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <EntryForm
              initial={editing}
              groups={groups}
              itemDefinitions={itemDefs}
              submitLabel={m.common_save_changes()}
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    albumKey,
                    input: values,
                  })
                  toast.success(m.collection_entry_saved())
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
}: {
  albumKey: string
  groups: CollectionGroup[]
  entries: CollectionEntry[]
  milestones: CollectionMilestone[]
}) {
  const [openCreate, setOpenCreate] = useState(false)
  const [editing, setEditing] = useState<CollectionMilestone | null>(null)
  const createMutation = useCreateCollectionMilestone()
  const updateMutation = useUpdateCollectionMilestone()
  const deleteMutation = useDeleteCollectionMilestone()

  const groupById = new Map(groups.map((g) => [g.id, g.name]))
  const entryById = new Map(entries.map((e) => [e.id, e.name]))

  function describeMilestone(row: CollectionMilestone): string {
    if (row.scope === "entry") {
      return m.collection_condition_entry({
        entry: entryById.get(row.entryId ?? "") ?? row.entryId ?? "",
      })
    }
    if (row.scope === "group") {
      return m.collection_condition_group({
        group: groupById.get(row.groupId ?? "") ?? row.groupId ?? "",
        threshold: row.threshold,
      })
    }
    return m.collection_condition_album({ threshold: row.threshold })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="size-4" /> {m.collection_new_milestone()}
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.collection_milestone_col_scope()}</TableHead>
              <TableHead>{m.collection_milestone_col_condition()}</TableHead>
              <TableHead>{m.collection_milestone_col_reward()}</TableHead>
              <TableHead>{m.collection_milestone_col_delivery()}</TableHead>
              <TableHead>{m.collection_milestone_col_label()}</TableHead>
              <TableHead className="text-right">
                {m.common_actions()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {milestones.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center">
                  {m.collection_milestone_empty()}
                </TableCell>
              </TableRow>
            ) : (
              milestones.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="secondary">{scopeLabel(row.scope)}</Badge>
                  </TableCell>
                  <TableCell>{describeMilestone(row)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {row.rewardItems.map((r, i) => (
                        <ItemRewardRow key={i} size="sm" entry={r} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.autoClaim ? "default" : "outline"}>
                      {row.autoClaim
                        ? m.collection_delivery_auto()
                        : m.collection_delivery_manual()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.label ?? m.common_dash()}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(row)}
                    >
                      <Pencil className="size-4" /> {m.common_edit()}
                    </Button>
                    <CollectionDeleteDialog
                      title={m.collection_edit_milestone()}
                      description={m.collection_delete_milestone_desc()}
                      onConfirm={async () => {
                        try {
                          await deleteMutation.mutateAsync({
                            id: row.id,
                            albumKey,
                          })
                          toast.success(m.collection_milestone_deleted())
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
            <DialogTitle>{m.collection_new_milestone()}</DialogTitle>
            <DialogDescription>
              {m.collection_milestone_description()}
            </DialogDescription>
          </DialogHeader>
          <MilestoneForm
            groups={groups}
            entries={entries}
            submitLabel={m.common_create()}
            isPending={createMutation.isPending}
            onCancel={() => setOpenCreate(false)}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync({
                  albumKey,
                  input: values,
                })
                toast.success(m.collection_milestone_created())
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
            <DialogTitle>{m.collection_edit_milestone()}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <MilestoneForm
              initial={editing}
              groups={groups}
              entries={entries}
              submitLabel={m.common_save_changes()}
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                try {
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
                  toast.success(m.collection_milestone_saved())
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
        {m.common_loading()}
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        {m.collection_failed_load()} {error?.message ?? ""}
      </div>
    )
  }

  async function handleRescan() {
    if (!rescanUserId.trim()) {
      toast.error(m.collection_rescan_need_user())
      return
    }
    try {
      const res = await rescanMutation.mutateAsync({
        albumKey,
        endUserId: rescanUserId.trim(),
      })
      toast.success(`${m.collection_rescan_success()} ${res.unlocked.length}`)
      refetch()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.collection_rescan_failed())
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label={m.collection_stats_users()} value={data.totalEndUsers} />
        <StatCard
          label={m.collection_stats_entries()}
          value={data.entries.length}
        />
        <StatCard
          label={m.collection_stats_milestones()}
          value={data.milestones.length}
        />
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">
          {m.collection_stats_entry_rate()}
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.collection_stats_entry_col_name()}</TableHead>
              <TableHead className="text-right">
                {m.collection_stats_entry_col_count()}
              </TableHead>
              <TableHead className="text-right">
                {m.collection_stats_entry_col_percent()}
              </TableHead>
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
                    : m.common_dash()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">
          {m.collection_stats_milestone_rate()}
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.collection_milestone_col_scope()}</TableHead>
              <TableHead>
                {m.collection_stats_milestone_col_threshold()}
              </TableHead>
              <TableHead className="text-right">
                {m.collection_stats_milestone_col_claimed()}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.milestones.map((row) => (
              <TableRow key={row.milestoneId}>
                <TableCell>{scopeLabel(row.scope)}</TableCell>
                <TableCell>{row.threshold}</TableCell>
                <TableCell className="text-right">
                  {row.claimedCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">
          {m.collection_rescan_title()}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          {m.collection_rescan_hint()}
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="rescan-user">endUserId</Label>
            <Input
              id="rescan-user"
              value={rescanUserId}
              onChange={(e) => setRescanUserId(e.target.value)}
              placeholder={m.collection_rescan_placeholder()}
            />
          </div>
          <Button
            onClick={handleRescan}
            disabled={rescanMutation.isPending || isFetching}
          >
            <RefreshCw className="size-4" />
            {rescanMutation.isPending
              ? m.collection_rescan_syncing()
              : m.collection_rescan_button()}
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
