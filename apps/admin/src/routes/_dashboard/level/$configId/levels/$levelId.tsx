import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { CollectionDeleteDialog } from "#/components/collection/DeleteDialog"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import {
  useDeleteLevel,
  useLevel,
  useLevelConfig,
  useLevelStages,
  useUpdateLevel,
} from "#/hooks/use-level"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute(
  "/_dashboard/level/$configId/levels/$levelId",
)({
  component: LevelDetailPage,
})

function LevelDetailPage() {
  const { configId, levelId } = Route.useParams()
  const navigate = useNavigate()
  const { data: config } = useLevelConfig(configId)
  const { data: level, isPending, error } = useLevel(levelId)
  const { data: stages = [] } = useLevelStages(configId)
  const updateMutation = useUpdateLevel()
  const deleteMutation = useDeleteLevel()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.common_loading()}
      </div>
    )
  }
  if (error || !level) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        {m.level_failed_load()} {error?.message ?? m.level_not_found()}
      </div>
    )
  }

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Button asChild variant="ghost" size="icon">
          <Link to="/level/$configId" params={{ configId }}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">
          {level.name}
          {config ? ` - ${config.name}` : ""}
        </h1>
        <div className="ml-auto">
          <CollectionDeleteDialog
            title={m.level_edit_level()}
            description={m.level_delete_level_desc()}
            onConfirm={async () => {
              try {
                await deleteMutation.mutateAsync({ id: levelId, configId })
                toast.success(m.level_level_deleted())
                navigate({ to: "/level/$configId", params: { configId } })
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
                else toast.error(m.level_failed_delete())
              }
            }}
            isPending={deleteMutation.isPending}
          />
        </div>
      </header>

      <main className="flex-1 p-6">
        <LevelEditForm
          configId={configId}
          levelId={levelId}
          initial={level}
          stages={stages}
          hasStages={config?.hasStages ?? false}
          updateMutation={updateMutation}
        />
      </main>
    </>
  )
}

function LevelEditForm({
  configId,
  levelId,
  initial,
  stages,
  hasStages,
  updateMutation,
}: {
  configId: string
  levelId: string
  initial: NonNullable<ReturnType<typeof useLevel>["data"]>
  stages: NonNullable<ReturnType<typeof useLevelStages>["data"]>
  hasStages: boolean
  updateMutation: ReturnType<typeof useUpdateLevel>
}) {
  const [name, setName] = useState(initial.name)
  const [alias, setAlias] = useState(initial.alias ?? "")
  const [description, setDescription] = useState(initial.description ?? "")
  const [icon, setIcon] = useState(initial.icon ?? "")
  const [difficulty, setDifficulty] = useState(initial.difficulty ?? "")
  const [maxStars, setMaxStars] = useState(initial.maxStars)
  const [stageId, setStageId] = useState(initial.stageId ?? "")
  const [unlockRule, setUnlockRule] = useState(
    initial.unlockRule ? JSON.stringify(initial.unlockRule, null, 2) : "",
  )
  const [clearRewards, setClearRewards] = useState(
    initial.clearRewards ? JSON.stringify(initial.clearRewards, null, 2) : "",
  )
  const [starRewards, setStarRewards] = useState(
    initial.starRewards ? JSON.stringify(initial.starRewards, null, 2) : "",
  )
  const [metadata, setMetadata] = useState(
    initial.metadata ? JSON.stringify(initial.metadata, null, 2) : "",
  )
  const [sortOrder, setSortOrder] = useState(initial.sortOrder)
  const [isActive, setIsActive] = useState(initial.isActive)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateMutation.mutateAsync({
        id: levelId,
        configId,
        input: {
          name,
          alias: alias || null,
          description: description || null,
          icon: icon || null,
          difficulty: difficulty || null,
          maxStars,
          stageId: stageId || null,
          unlockRule: unlockRule ? JSON.parse(unlockRule) : null,
          clearRewards: clearRewards ? JSON.parse(clearRewards) : null,
          starRewards: starRewards ? JSON.parse(starRewards) : null,
          metadata: metadata ? JSON.parse(metadata) : null,
          sortOrder,
          isActive,
        },
      })
      toast.success(m.level_level_saved())
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
        <Label>{m.level_field_name()}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label>{m.level_field_alias()}</Label>
        <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>{m.level_field_description()}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label>{m.common_icon()}</Label>
        <Input value={icon} onChange={(e) => setIcon(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>{m.level_field_difficulty()}</Label>
        <Input
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          placeholder="easy / normal / hard"
        />
      </div>

      <div className="space-y-2">
        <Label>{m.level_field_max_stars()}</Label>
        <Input
          type="number"
          min={0}
          value={maxStars}
          onChange={(e) => setMaxStars(Number(e.target.value))}
        />
      </div>

      {hasStages && stages.length > 0 && (
        <div className="space-y-2">
          <Label>{m.level_field_stage()}</Label>
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger>
              <SelectValue placeholder={m.level_field_stage_none()} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{m.level_field_stage_none()}</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
        <Label>{m.level_field_clear_rewards()}</Label>
        <Textarea
          value={clearRewards}
          onChange={(e) => setClearRewards(e.target.value)}
          rows={4}
          placeholder='[{"type":"item","id":"...","count":1}]'
        />
      </div>

      <div className="space-y-2">
        <Label>{m.level_field_star_rewards()}</Label>
        <Textarea
          value={starRewards}
          onChange={(e) => setStarRewards(e.target.value)}
          rows={4}
          placeholder='[{"stars":3,"rewards":[{"type":"item","id":"...","count":1}]}]'
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

      <div className="space-y-2">
        <Label>{m.common_sort_order()}</Label>
        <Input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        <Label>{m.common_active()}</Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link to="/level/$configId" params={{ configId }}>
            {m.level_back_to_list()}
          </Link>
        </Button>
        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending
            ? m.common_saving()
            : m.common_save_changes()}
        </Button>
      </div>
    </form>
  )
}
