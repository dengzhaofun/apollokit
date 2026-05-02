/**
 * Inline spot list for the campaign edit page. Each row exposes:
 *   - inline edit (opens SpotEditor with the spot pre-filled)
 *   - delete (with confirm)
 *   - mint one-time QR tokens (opens QrTokenMinter)
 *   - rotate manual code (opens ManualCodeDialog)
 *
 * The list is intentionally NOT paginated — a campaign typically has
 * dozens of spots, not thousands. If that ever stops being true we'll
 * add a paginated `/spots` table similar to ConfigTable.
 */

import { useState } from "react"
import {
  KeyRound,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import {
  useDeleteOfflineCheckInSpot,
  useOfflineCheckInSpots,
} from "#/hooks/use-offline-check-in"
import { ApiError } from "#/lib/api-client"
import type { OfflineCheckInSpot } from "#/lib/types/offline-check-in"
import * as m from "#/paraglide/messages.js"

import { ManualCodeDialog } from "./ManualCodeDialog"
import { QrTokenMinter } from "./QrTokenMinter"
import { SpotEditor } from "./SpotEditor"

interface Props {
  campaignId: string
}

type DialogTarget =
  | { kind: "edit"; spot: OfflineCheckInSpot }
  | { kind: "delete"; spot: OfflineCheckInSpot }
  | { kind: "qr"; spot: OfflineCheckInSpot }
  | { kind: "manual"; spot: OfflineCheckInSpot }
  | null

export function SpotList({ campaignId }: Props) {
  const { data: spots, isPending } = useOfflineCheckInSpots(campaignId)
  const [createOpen, setCreateOpen] = useState(false)
  const [target, setTarget] = useState<DialogTarget>(null)
  const deleteMutation = useDeleteOfflineCheckInSpot(campaignId)

  async function handleDelete(spot: OfflineCheckInSpot) {
    try {
      await deleteMutation.mutateAsync(spot.id)
      toast.success(m.offline_checkin_spot_deleted())
      setTarget(null)
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.body.error
          : m.offline_checkin_failed_delete(),
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{m.offline_checkin_spots()}</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {m.offline_checkin_add_spot()}
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">{m.common_loading()}</p>
      ) : !spots || spots.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {m.offline_checkin_no_spots()}
        </p>
      ) : (
        <div className="space-y-3">
          {spots.map((spot) => (
            <SpotRow
              key={spot.id}
              spot={spot}
              onEdit={() => setTarget({ kind: "edit", spot })}
              onDelete={() => setTarget({ kind: "delete", spot })}
              onQr={() => setTarget({ kind: "qr", spot })}
              onManual={() => setTarget({ kind: "manual", spot })}
            />
          ))}
        </div>
      )}

      <SpotEditor
        open={createOpen}
        onOpenChange={setCreateOpen}
        campaignId={campaignId}
      />
      <SpotEditor
        open={target?.kind === "edit"}
        onOpenChange={(o) => {
          if (!o) setTarget(null)
        }}
        campaignId={campaignId}
        spot={target?.kind === "edit" ? target.spot : null}
      />

      <Dialog
        open={target?.kind === "delete"}
        onOpenChange={(o) => {
          if (!o) setTarget(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{m.common_delete()}</DialogTitle>
            <DialogDescription>
              {target?.kind === "delete"
                ? `${target.spot.name} (${target.spot.alias})`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              {m.common_cancel()}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (target?.kind === "delete") void handleDelete(target.spot)
              }}
              disabled={deleteMutation.isPending}
            >
              {m.common_delete()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QrTokenMinter
        open={target?.kind === "qr"}
        onOpenChange={(o) => {
          if (!o) setTarget(null)
        }}
        spot={target?.kind === "qr" ? target.spot : null}
      />
      <ManualCodeDialog
        open={target?.kind === "manual"}
        onOpenChange={(o) => {
          if (!o) setTarget(null)
        }}
        spot={target?.kind === "manual" ? target.spot : null}
      />
    </div>
  )
}

interface RowProps {
  spot: OfflineCheckInSpot
  onEdit: () => void
  onDelete: () => void
  onQr: () => void
  onManual: () => void
}

function SpotRow({ spot, onEdit, onDelete, onQr, onManual }: RowProps) {
  const methodKinds = spot.verification.methods.map((m) => {
    if (m.kind === "qr") return `qr_${m.mode}`
    return m.kind
  })
  return (
    <div className="rounded-md border p-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{spot.name}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {spot.alias}
          </code>
          {!spot.isActive ? (
            <Badge variant="outline">{m.common_inactive()}</Badge>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {spot.latitude.toFixed(5)}, {spot.longitude.toFixed(5)} (±
            {spot.geofenceRadiusM}m)
          </span>
          <span>·</span>
          <span>
            {spot.verification.combinator}: {methodKinds.join(", ")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onQr}>
          <QrCode className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onManual}>
          <KeyRound className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  )
}
