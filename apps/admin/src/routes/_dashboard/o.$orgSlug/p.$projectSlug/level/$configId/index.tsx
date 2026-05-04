import { createFileRoute } from "@tanstack/react-router"
import { Link, useNavigate } from "#/components/router-helpers"
import { ArrowLeft, Pencil, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { CollectionDeleteDialog } from "#/components/collection/DeleteDialog"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { Textarea } from "#/components/ui/textarea"
import {
  useCreateLevelStage,
  useDeleteLevelConfig,
  useDeleteLevelStage,
  useLevelConfig,
  useLevelStages,
  useLevels,
  useDeleteLevel,
  useUpdateLevelConfig,
  useUpdateLevelStage,
} from "#/hooks/use-level"
import { ApiError } from "#/lib/api-client"
import type { LevelStage, UnlockRule } from "#/lib/types/level"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/level/$configId/")({
  component: LevelConfigDetailPage,
})

function LevelConfigDetailPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()

  const { data: config, isPending, error } = useLevelConfig(configId)
  const { data: stages = [] } = useLevelStages(configId)
  const { data: levels = [] } = useLevels(configId)

  const deleteConfigMutation = useDeleteLevelConfig()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !config) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        {m.level_failed_load()} {error?.message ?? m.level_not_found()}
      </div>
    )
  }

  return (
    <>
      <PageHeaderActions>
        <Button
          render={
            <Link to="/level">
              <ArrowLeft className="size-4" />
            </Link>
          }
          variant="ghost" size="icon"
        />
        <div className="ml-auto">
          <CollectionDeleteDialog
            title={m.level_delete_config()}
            description={m.level_delete_config_desc()}
            onConfirm={async () => {
              try {
                await deleteConfigMutation.mutateAsync(config.id)
                toast.success(m.level_config_deleted())
                navigate({ to: "/o/$orgSlug/p/$projectSlug/level" })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.level_failed_delete())
              }
            }}
            isPending={deleteConfigMutation.isPending}
            triggerLabel={m.level_delete_config()}
          />
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">{m.level_tab_info()}</TabsTrigger>
            {config.hasStages && (
              <TabsTrigger value="stages">
                {m.level_tab_stages()} ({stages.length})
              </TabsTrigger>
            )}
            <TabsTrigger value="levels">
              {m.level_tab_levels()} ({levels.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4">
            <ConfigInfoTab configId={config.id} initial={config} />
          </TabsContent>

          {config.hasStages && (
            <TabsContent value="stages" className="mt-4">
              <StagesTab configId={config.id} stages={stages} />
            </TabsContent>
          )}

          <TabsContent value="levels" className="mt-4">
            <LevelsTab
              configId={config.id}
              stages={config.hasStages ? stages : []}
              levels={levels}
            />
          </TabsContent>
        </Tabs>
      </main>
    </>
  )
}

// ─── Info tab ────────────────────────────────────────────────────

function ConfigInfoTab({
  configId,
  initial,
}: {
  configId: string
  initial: NonNullable<ReturnType<typeof useLevelConfig>["data"]>
}) {
  const updateMutation = useUpdateLevelConfig()

  const [name, setName] = useState(initial.name)
  const [alias, setAlias] = useState(initial.alias ?? "")
  const [description, setDescription] = useState(initial.description ?? "")
  const [coverImage, setCoverImage] = useState(initial.coverImage ?? "")
  const [icon, setIcon] = useState(initial.icon ?? "")
  const [hasStages, setHasStages] = useState(initial.hasStages)
  const [isActive, setIsActive] = useState(initial.isActive)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateMutation.mutateAsync({
        id: configId,
        input: {
          name,
          alias: alias || null,
          description: description || null,
          coverImage: coverImage || null,
          icon: icon || null,
          hasStages,
          isActive,
        },
      })
      toast.success(m.level_config_saved())
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.level_failed_save())
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-6 shadow-sm"
    >
      <div className="space-y-2">
        <Label>{m.level_config_name()}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>{m.level_config_alias()}</Label>
        <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>{m.level_config_description()}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>{m.level_config_cover_image()}</Label>
        <Input
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>{m.level_config_icon()}</Label>
        <Input value={icon} onChange={(e) => setIcon(e.target.value)} />
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={hasStages} onCheckedChange={setHasStages} />
        <Label>{m.level_config_has_stages()}</Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <Label>{m.common_active()}</Label>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending
            ? m.common_saving()
            : m.common_save_changes()}
        </Button>
      </div>
    </form>
  )
}

// ─── Stages tab ─────────────────────────────────────────────────

function StagesTab({
  configId,
  stages,
}: {
  configId: string
  stages: LevelStage[]
}) {
  const [openCreate, setOpenCreate] = useState(false)
  const [editing, setEditing] = useState<LevelStage | null>(null)
  const createMutation = useCreateLevelStage()
  const updateMutation = useUpdateLevelStage()
  const deleteMutation = useDeleteLevelStage()

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="size-4" /> {m.level_new_stage()}
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.common_name()}</TableHead>
              <TableHead>{m.common_sort_order()}</TableHead>
              <TableHead>{m.common_description()}</TableHead>
              <TableHead className="text-right">{m.common_actions()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center">
                  {m.level_stage_empty()}
                </TableCell>
              </TableRow>
            ) : (
              stages.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.sortOrder}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.description ?? m.common_dash()}
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(s)}
                    >
                      <Pencil className="size-4" /> {m.common_edit()}
                    </Button>
                    <CollectionDeleteDialog
                      title={m.level_edit_stage()}
                      description={m.level_delete_stage_desc()}
                      onConfirm={async () => {
                        try {
                          await deleteMutation.mutateAsync({
                            id: s.id,
                            configId,
                          })
                          toast.success(m.level_stage_deleted())
                        } catch (err) {
                          if (err instanceof ApiError)
                            toast.error(err.body.error)
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
            <DialogTitle>{m.level_new_stage()}</DialogTitle>
          </DialogHeader>
          <StageForm
            isPending={createMutation.isPending}
            onCancel={() => setOpenCreate(false)}
            onSubmit={async (values) => {
              try {
                await createMutation.mutateAsync({
                  configId,
                  input: values,
                })
                toast.success(m.level_stage_created())
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
            <DialogTitle>{m.level_edit_stage()}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <StageForm
              initial={editing}
              isPending={updateMutation.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                try {
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    configId,
                    input: values,
                  })
                  toast.success(m.level_stage_saved())
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

function StageForm({
  initial,
  isPending,
  onCancel,
  onSubmit,
}: {
  initial?: LevelStage
  isPending: boolean
  onCancel: () => void
  onSubmit: (values: {
    name: string
    description: string | null
    icon: string | null
    unlockRule: UnlockRule | null
    metadata: Record<string, unknown> | null
  }) => void
}) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [icon, setIcon] = useState(initial?.icon ?? "")
  const [unlockRule, setUnlockRule] = useState(
    initial?.unlockRule ? JSON.stringify(initial.unlockRule, null, 2) : "",
  )
  const [metadata, setMetadata] = useState(
    initial?.metadata ? JSON.stringify(initial.metadata, null, 2) : "",
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name,
      description: description || null,
      icon: icon || null,
      unlockRule: unlockRule ? JSON.parse(unlockRule) : null,
      metadata: metadata ? JSON.parse(metadata) : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{m.level_field_name()}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>{m.level_field_description()}</Label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>{m.common_icon()}</Label>
        <Input value={icon} onChange={(e) => setIcon(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>{m.level_field_unlock_rule()}</Label>
        <Textarea
          value={unlockRule}
          onChange={(e) => setUnlockRule(e.target.value)}
          rows={4}
          placeholder='{"type":"auto"}'
        />
      </div>
      <div className="space-y-2">
        <Label>{m.level_field_metadata()}</Label>
        <Textarea
          value={metadata}
          onChange={(e) => setMetadata(e.target.value)}
          rows={3}
          placeholder="{}"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.common_cancel()}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? m.common_saving() : m.common_save_changes()}
        </Button>
      </div>
    </form>
  )
}

// ─── Levels tab ─────────────────────────────────────────────────

function LevelsTab({
  configId,
  stages,
  levels,
}: {
  configId: string
  stages: LevelStage[]
  levels: ReturnType<typeof useLevels>["data"] & unknown[]
}) {
  const [filterStage, setFilterStage] = useState<string>("all")
  const deleteMutation = useDeleteLevel()

  const stageById = new Map(stages.map((s) => [s.id, s.name]))

  const filtered =
    filterStage === "all"
      ? levels
      : levels.filter((l) => l.stageId === filterStage)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        {stages.length > 0 && (
          <Select value={filterStage} onValueChange={(v) => setFilterStage(v ?? "")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {m.level_filter_all_stages()}
              </SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          render={
            <Link
              to="/level/$configId/levels/create"
              params={{ configId }}
            >
              <Plus className="size-4" /> {m.level_new_level()}
            </Link>
          }
          size="sm"
        />
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.level_col_name()}</TableHead>
              <TableHead>{m.level_col_alias()}</TableHead>
              {stages.length > 0 && (
                <TableHead>{m.level_col_stage()}</TableHead>
              )}
              <TableHead>{m.level_col_difficulty()}</TableHead>
              <TableHead>{m.level_col_max_stars()}</TableHead>
              <TableHead>{m.common_status()}</TableHead>
              <TableHead>{m.common_sort_order()}</TableHead>
              <TableHead className="text-right">{m.common_actions()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={stages.length > 0 ? 8 : 7}
                  className="h-20 text-center"
                >
                  {m.level_level_empty()}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((lvl) => (
                <TableRow key={lvl.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/level/$configId/levels/$levelId"
                      params={{ configId, levelId: lvl.id }}
                      className="hover:underline"
                    >
                      {lvl.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lvl.alias ?? m.common_dash()}
                  </TableCell>
                  {stages.length > 0 && (
                    <TableCell>
                      {lvl.stageId
                        ? (stageById.get(lvl.stageId) ?? m.common_dash())
                        : m.common_dash()}
                    </TableCell>
                  )}
                  <TableCell>
                    {lvl.difficulty ? (
                      <Badge variant="secondary">{lvl.difficulty}</Badge>
                    ) : (
                      m.common_dash()
                    )}
                  </TableCell>
                  <TableCell>{lvl.maxStars}</TableCell>
                  <TableCell>
                    <Badge variant={lvl.isActive ? "default" : "outline"}>
                      {lvl.isActive ? m.common_active() : m.common_inactive()}
                    </Badge>
                  </TableCell>
                  <TableCell>{lvl.sortOrder}</TableCell>
                  <TableCell className="flex justify-end gap-2">
                    <Button
                      render={
                        <Link
                          to="/level/$configId/levels/$levelId"
                          params={{ configId, levelId: lvl.id }}
                        >
                          <Pencil className="size-4" /> {m.common_edit()}
                        </Link>
                      }
                      variant="outline" size="sm"
                    />
                    <CollectionDeleteDialog
                      title={m.level_edit_level()}
                      description={m.level_delete_level_desc()}
                      onConfirm={async () => {
                        try {
                          await deleteMutation.mutateAsync({
                            id: lvl.id,
                            configId,
                          })
                          toast.success(m.level_level_deleted())
                        } catch (err) {
                          if (err instanceof ApiError)
                            toast.error(err.body.error)
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
    </div>
  )
}
