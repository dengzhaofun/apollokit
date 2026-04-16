import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import { useCreateLevelConfig } from "#/hooks/use-level"
import { ApiError } from "#/lib/api-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/level/create")({
  component: LevelCreatePage,
})

function LevelCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateLevelConfig()

  const [name, setName] = useState("")
  const [alias, setAlias] = useState("")
  const [description, setDescription] = useState("")
  const [coverImage, setCoverImage] = useState("")
  const [icon, setIcon] = useState("")
  const [hasStages, setHasStages] = useState(false)
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const row = await createMutation.mutateAsync({
        name,
        alias: alias || null,
        description: description || null,
        coverImage: coverImage || null,
        icon: icon || null,
        hasStages,
        sortOrder,
        isActive,
      })
      toast.success(m.level_config_created())
      navigate({
        to: "/level/$configId",
        params: { configId: row.id },
      })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error(m.level_failed_create())
    }
  }

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Button asChild variant="ghost" size="icon">
          <Link to="/level">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">{m.level_create_config()}</h1>
      </header>

      <main className="flex-1 p-6">
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl space-y-6 rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="space-y-2">
            <Label>{m.level_config_name()}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{m.level_config_alias()}</Label>
            <Input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
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
            <Input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={hasStages} onCheckedChange={setHasStages} />
            <Label>{m.level_config_has_stages()}</Label>
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
              <Link to="/level">{m.common_cancel()}</Link>
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
