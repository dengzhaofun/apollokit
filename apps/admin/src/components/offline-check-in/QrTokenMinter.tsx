/**
 * Mint one-time QR tokens for a spot. Tokens are short-lived UUIDs the
 * tenant prints/displays at the booth — once consumed by a player's
 * check-in they're deleted from KV.
 *
 * UX:
 *   - User picks a count (1..500) and a TTL (60..7d), taps "Mint".
 *   - Result is a list of tokens displayed in a copyable textarea so
 *     the tenant can paste into a label printer / QR generator.
 */

import { useEffect, useState } from "react"
import { Loader2, ClipboardCopy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import { useMintQrTokens } from "#/hooks/use-offline-check-in"
import { ApiError } from "#/lib/api-client"
import type {
  MintQrTokensResponse,
  OfflineCheckInSpot,
} from "#/lib/types/offline-check-in"
import * as m from "#/paraglide/messages.js"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  spot: OfflineCheckInSpot | null
}

export function QrTokenMinter({ open, onOpenChange, spot }: Props) {
  const [count, setCount] = useState(10)
  const [ttl, setTtl] = useState(3600)
  const [result, setResult] = useState<MintQrTokensResponse | null>(null)
  const mutation = useMintQrTokens()

  useEffect(() => {
    if (!open) {
      setResult(null)
      setCount(10)
      setTtl(3600)
    }
  }, [open])

  async function handleMint() {
    if (!spot) return
    try {
      const r = await mutation.mutateAsync({
        spotId: spot.id,
        count,
        ttlSeconds: ttl,
      })
      setResult(r)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.offline_checkin_failed_create(),
      )
    }
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.tokens.join("\n")).then(
      () => toast.success(m.common_copied()),
      () => toast.error(m.common_copy_failed()),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.offline_checkin_qr_tokens_title()}</DialogTitle>
          <DialogDescription>
            {spot ? `${spot.name} (${spot.alias})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="qr-count">
                {m.offline_checkin_qr_tokens_count()}
              </Label>
              <Input
                id="qr-count"
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.min(500, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                disabled={mutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qr-ttl">
                {m.offline_checkin_qr_tokens_ttl()}
              </Label>
              <Input
                id="qr-ttl"
                type="number"
                min={60}
                max={7 * 24 * 3600}
                value={ttl}
                onChange={(e) =>
                  setTtl(
                    Math.min(
                      7 * 24 * 3600,
                      Math.max(60, Number(e.target.value) || 60),
                    ),
                  )
                }
                disabled={mutation.isPending}
              />
            </div>
          </div>

          {result ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {m.offline_checkin_qr_tokens_minted({
                  count: result.tokens.length,
                  expiresAt: new Date(result.expiresAt).toLocaleString(),
                })}
              </p>
              <Textarea
                rows={6}
                readOnly
                value={result.tokens.join("\n")}
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <ClipboardCopy className="size-4" />
                {m.common_copy()}
              </Button>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            {m.common_close()}
          </Button>
          <Button onClick={handleMint} disabled={mutation.isPending || !spot}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {m.offline_checkin_qr_tokens_mint()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
