import { createFileRoute, useNavigate } from "@tanstack/react-router"
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
import { useCreateAssistPoolConfig } from "#/hooks/use-assist-pool"
import { ApiError } from "#/lib/api-client"
import type {
  AssistContributionPolicy,
  AssistPoolMode,
  CreateAssistPoolConfigInput,
} from "#/lib/types/assist-pool"

export const Route = createFileRoute("/_dashboard/assist-pool/create")({
  component: AssistPoolCreatePage,
})

type PolicyKind = AssistContributionPolicy["kind"]

function AssistPoolCreatePage() {
  const navigate = useNavigate()
  const createMutation = useCreateAssistPoolConfig()

  const [name, setName] = useState("")
  const [alias, setAlias] = useState("")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<AssistPoolMode>("decrement")
  const [targetAmount, setTargetAmount] = useState(100)
  const [policyKind, setPolicyKind] = useState<PolicyKind>("fixed")
  const [fixedAmount, setFixedAmount] = useState(20)
  const [uniformMin, setUniformMin] = useState(5)
  const [uniformMax, setUniformMax] = useState(30)
  const [decayBase, setDecayBase] = useState(30)
  const [decayTailRatio, setDecayTailRatio] = useState(0.1)
  const [decayTailFloor, setDecayTailFloor] = useState(1)
  const [perAssisterLimit, setPerAssisterLimit] = useState(1)
  const [initiatorCanAssist, setInitiatorCanAssist] = useState(false)
  const [expiresInSeconds, setExpiresInSeconds] = useState(86400)
  const [isActive, setIsActive] = useState(true)

  function buildPolicy(): AssistContributionPolicy {
    if (policyKind === "fixed") return { kind: "fixed", amount: fixedAmount }
    if (policyKind === "uniform")
      return { kind: "uniform", min: uniformMin, max: uniformMax }
    return {
      kind: "decaying",
      base: decayBase,
      tailRatio: decayTailRatio,
      tailFloor: decayTailFloor,
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input: CreateAssistPoolConfigInput = {
      name,
      alias: alias || null,
      description: description || null,
      mode,
      targetAmount,
      contributionPolicy: buildPolicy(),
      perAssisterLimit,
      initiatorCanAssist,
      expiresInSeconds,
      isActive,
    }
    try {
      await createMutation.mutateAsync(input)
      toast.success("Assist-pool config created")
      navigate({ to: "/assist-pool" })
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
      else toast.error("Failed to create assist-pool config")
    }
  }

  return (
    <main className="flex-1 p-6">
      <form
        onSubmit={onSubmit}
        className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cut a Slice"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="alias">Alias (optional)</Label>
          <Input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="cut-a-slice"
          />
          <p className="text-xs text-muted-foreground">
            Human-readable key, unique within your organization.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as AssistPoolMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="decrement">decrement (砍价)</SelectItem>
                <SelectItem value="accumulate">accumulate (集气)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target">Target amount</Label>
            <Input
              id="target"
              type="number"
              min={1}
              required
              value={targetAmount}
              onChange={(e) => setTargetAmount(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <Label>Contribution policy</Label>
          <Select
            value={policyKind}
            onValueChange={(v) => setPolicyKind(v as PolicyKind)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">fixed — each assist = N</SelectItem>
              <SelectItem value="uniform">uniform — random [min, max]</SelectItem>
              <SelectItem value="decaying">decaying — 砍一刀 tail throttle</SelectItem>
            </SelectContent>
          </Select>

          {policyKind === "fixed" && (
            <div className="space-y-2">
              <Label htmlFor="fixed-amount">Amount per assist</Label>
              <Input
                id="fixed-amount"
                type="number"
                min={1}
                value={fixedAmount}
                onChange={(e) => setFixedAmount(Number(e.target.value))}
              />
            </div>
          )}

          {policyKind === "uniform" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="uniform-min">Min</Label>
                <Input
                  id="uniform-min"
                  type="number"
                  min={1}
                  value={uniformMin}
                  onChange={(e) => setUniformMin(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="uniform-max">Max</Label>
                <Input
                  id="uniform-max"
                  type="number"
                  min={1}
                  value={uniformMax}
                  onChange={(e) => setUniformMax(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          {policyKind === "decaying" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="decay-base">Base</Label>
                <Input
                  id="decay-base"
                  type="number"
                  min={1}
                  value={decayBase}
                  onChange={(e) => setDecayBase(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decay-tail-ratio">Tail ratio</Label>
                <Input
                  id="decay-tail-ratio"
                  type="number"
                  step="0.01"
                  min={0}
                  max={1}
                  value={decayTailRatio}
                  onChange={(e) => setDecayTailRatio(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="decay-floor">Tail floor</Label>
                <Input
                  id="decay-floor"
                  type="number"
                  min={1}
                  value={decayTailFloor}
                  onChange={(e) => setDecayTailFloor(Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="per-assister">Per-assister limit</Label>
            <Input
              id="per-assister"
              type="number"
              min={1}
              value={perAssisterLimit}
              onChange={(e) => setPerAssisterLimit(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ttl">Expires in (seconds)</Label>
            <Input
              id="ttl"
              type="number"
              min={1}
              value={expiresInSeconds}
              onChange={(e) => setExpiresInSeconds(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="initiator-can-assist">Initiator can assist</Label>
            <p className="text-xs text-muted-foreground">
              Allow the initiator to contribute to their own pool.
            </p>
          </div>
          <Switch
            id="initiator-can-assist"
            checked={initiatorCanAssist}
            onCheckedChange={setInitiatorCanAssist}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="active">Active</Label>
            <p className="text-xs text-muted-foreground">
              Inactive configs reject new instance creation.
            </p>
          </div>
          <Switch
            id="active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/assist-pool" })}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </main>
  )
}
