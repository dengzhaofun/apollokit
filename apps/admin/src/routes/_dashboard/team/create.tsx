import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Checkbox } from "#/components/ui/checkbox"
import { useCreateTeamConfig } from "#/hooks/use-team"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/team/create")({
  component: TeamCreatePage,
})

function TeamCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateTeamConfig()

  const [name, setName] = useState("")
  const [alias, setAlias] = useState("")
  const [maxMembers, setMaxMembers] = useState(4)
  const [autoDissolveOnLeaderLeave, setAutoDissolveOnLeaderLeave] =
    useState(false)
  const [allowQuickMatch, setAllowQuickMatch] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createMutation.mutateAsync({
        name,
        alias: alias || null,
        maxMembers,
        autoDissolveOnLeaderLeave,
        allowQuickMatch,
      })
      toast.success(m.team_config_created())
      navigate({ to: "/team" })
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error("Failed to create team config")
      }
    }
  }

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.team_new_config()}</h1>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{m.common_name()}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="alias">{m.common_alias()}</Label>
              <Input
                id="alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxMembers">{m.team_max_members()}</Label>
              <Input
                id="maxMembers"
                type="number"
                min={1}
                value={maxMembers}
                onChange={(e) => setMaxMembers(Number(e.target.value))}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="autoDissolve"
                checked={autoDissolveOnLeaderLeave}
                onCheckedChange={(v) =>
                  setAutoDissolveOnLeaderLeave(v === true)
                }
              />
              <Label htmlFor="autoDissolve">
                {m.team_auto_dissolve()}
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="quickMatch"
                checked={allowQuickMatch}
                onCheckedChange={(v) => setAllowQuickMatch(v === true)}
              />
              <Label htmlFor="quickMatch">{m.team_quick_match()}</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate({ to: "/team" })}
              >
                {m.common_cancel()}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? m.common_saving()
                  : m.common_create()}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </>
  )
}
