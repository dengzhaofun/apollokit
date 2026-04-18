import { useState } from "react"
import { toast } from "sonner"
import { Play } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Badge } from "#/components/ui/badge"
import { useExecuteExchange } from "#/hooks/use-exchange"
import { ItemRewardRow } from "#/components/item/ItemRewardRow"
import { ApiError } from "#/lib/api-client"
import type { ExchangeResult } from "#/lib/types/exchange"

interface ExecutePanelProps {
  optionId: string
}

export function ExecutePanel({ optionId }: ExecutePanelProps) {
  const [endUserId, setEndUserId] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [result, setResult] = useState<ExchangeResult | null>(null)

  const executeMutation = useExecuteExchange()

  async function handleExecute() {
    if (!endUserId.trim()) {
      toast.error("End User ID is required")
      return
    }
    try {
      const res = await executeMutation.mutateAsync({
        optionId,
        endUserId: endUserId.trim(),
        idempotencyKey: idempotencyKey.trim() || undefined,
      })
      setResult(res)
      toast.success("Exchange executed successfully")
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : "Failed to execute exchange",
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="exec-endUserId">{m.checkin_end_user_id()} *</Label>
          <Input
            id="exec-endUserId"
            value={endUserId}
            onChange={(e) => setEndUserId(e.target.value)}
            placeholder="e.g. user-42"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exec-idempotencyKey">Idempotency Key</Label>
          <Input
            id="exec-idempotencyKey"
            value={idempotencyKey}
            onChange={(e) => setIdempotencyKey(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      <Button
        onClick={handleExecute}
        disabled={executeMutation.isPending}
      >
        <Play className="size-4" />
        {executeMutation.isPending ? m.exchange_executing() : m.exchange_execute()}
      </Button>

      {result && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={result.success ? "default" : "destructive"}>
              {result.success ? "Success" : "Failed"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              ID: {result.exchangeId}
            </span>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Consumed</p>
              {result.costItems.map((item, i) => (
                <div key={i}>
                  <ItemRewardRow size="sm" entry={item} />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Granted</p>
              {result.rewardItems.map((item, i) => (
                <div key={i}>
                  <ItemRewardRow size="sm" entry={item} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
