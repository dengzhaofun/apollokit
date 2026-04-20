import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

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
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import { useCreateLevel, useLevelConfig, useLevelStages } from "#/hooks/use-level"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute(
  "/_dashboard/level/$configId/levels/create",
)({
  component: LevelCreatePage,
})

function LevelCreatePage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const { data: config } = useLevelConfig(configId)
  const { data: stages = [] } = useLevelStages(configId)
  const createMutation = useCreateLevel()

  const [name, setName] = useState("")
  const [alias, setAlias] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [maxStars, setMaxStars] = useState(3)
  const [stageId, setStageId] = useState<string>("")
  const [unlockRule, setUnlockRule] = useState("")
  const [clearRewards, setClearRewards] = useState("")
  const [starRewards, setStarRewards] = useState("")
  const [metadata, setMetadata] = useState("")
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const row = await createMutation.mutateAsync({
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
      toast.success(m.level_level_created())
      navigate({
        to: "/level/$configId/levels/$levelId",
        params: { configId, levelId: row.id },
      })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.level_failed_create())
    }
  }

  return (
    <>
      <PageHeaderActions>
        <Button asChild variant="ghost" size="icon">
          <Link to="/level/$configId" params={{ configId }}>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="space-y-2">
            <Label>{m.level_field_name()}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{m.level_field_alias()}</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
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

          {config?.hasStages && stages.length > 0 && (
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
                {m.common_cancel()}
              </Link>
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? m.common_loading()
                : m.common_create()}
            </Button>
          </div>
        </form>
      </main>
    </>
  )
}
