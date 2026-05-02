/**
 * Display and rotate the staff-issued manual check-in code for a spot.
 *
 * The code is short (6 digits) and short-lived (60s by default — server
 * controls the TTL). Rotation issues a fresh code and invalidates the
 * previous one.
 */

import { useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
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
import { useRotateManualCode } from "#/hooks/use-offline-check-in"
import { ApiError } from "#/lib/api-client"
import type {
  ManualCodeResponse,
  OfflineCheckInSpot,
} from "#/lib/types/offline-check-in"
import * as m from "#/paraglide/messages.js"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  spot: OfflineCheckInSpot | null
}

export function ManualCodeDialog({ open, onOpenChange, spot }: Props) {
  const [code, setCode] = useState<ManualCodeResponse | null>(null)
  const mutation = useRotateManualCode()

  async function handleRotate() {
    if (!spot) return
    try {
      const r = await mutation.mutateAsync(spot.id)
      setCode(r)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.offline_checkin_failed_create(),
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setCode(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{m.offline_checkin_manual_code_title()}</DialogTitle>
          <DialogDescription>
            {spot ? `${spot.name} (${spot.alias})` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {m.offline_checkin_manual_code_hint()}
          </p>
          {code ? (
            <div className="rounded-md border bg-muted/30 p-4 text-center space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {m.offline_checkin_manual_code_current()}
              </p>
              <p className="text-4xl font-mono font-bold tracking-widest">
                {code.code}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.offline_checkin_manual_code_rotates_at()}:{" "}
                {new Date(code.rotatesAt).toLocaleString()}
              </p>
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
          <Button
            onClick={handleRotate}
            disabled={mutation.isPending || !spot}
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {m.offline_checkin_manual_code_rotate()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
