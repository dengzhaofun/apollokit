/**
 * Spot create / edit dialog for the offline-check-in module.
 *
 * State is local (`useState`) — the parent decides when to open it and
 * which spot to seed from. Submission triggers the appropriate
 * create / update mutation; success fires `onSaved` so the parent can
 * close the dialog and refresh.
 *
 * The form intentionally does not use TanStack Form — there are <10
 * fields with simple shape, and a controlled object is easier to read
 * for a one-off editor.
 */

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { RewardEntryEditor } from "#/components/rewards/RewardEntryEditor"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { FieldHint } from "#/components/ui/field-hint"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { Textarea } from "#/components/ui/textarea"
import {
  useCreateOfflineCheckInSpot,
  useUpdateOfflineCheckInSpot,
} from "#/hooks/use-offline-check-in"
import { ApiError } from "#/lib/api-client"
import type { RewardEntry } from "#/lib/types/rewards"
import type {
  CreateSpotInput,
  OfflineCheckInSpot,
  OfflineCheckInVerification,
} from "#/lib/types/offline-check-in"
import * as m from "#/paraglide/messages.js"

import { VerificationEditor } from "./VerificationEditor"

interface DraftState {
  alias: string
  name: string
  description: string
  coverImage: string
  latitude: number
  longitude: number
  geofenceRadiusM: number
  verification: OfflineCheckInVerification
  spotRewards: RewardEntry[]
  collectionEntryAliases: string
  isActive: boolean
}

function blankDraft(): DraftState {
  return {
    alias: "",
    name: "",
    description: "",
    coverImage: "",
    latitude: 0,
    longitude: 0,
    geofenceRadiusM: 100,
    verification: {
      methods: [{ kind: "gps", radiusM: 100 }],
      combinator: "any",
    },
    spotRewards: [],
    collectionEntryAliases: "",
    isActive: true,
  }
}

function fromSpot(spot: OfflineCheckInSpot): DraftState {
  return {
    alias: spot.alias,
    name: spot.name,
    description: spot.description ?? "",
    coverImage: spot.coverImage ?? "",
    latitude: spot.latitude,
    longitude: spot.longitude,
    geofenceRadiusM: spot.geofenceRadiusM,
    verification: spot.verification,
    spotRewards: spot.spotRewards,
    collectionEntryAliases: spot.collectionEntryAliases.join(", "),
    isActive: spot.isActive,
  }
}

function toCreateInput(d: DraftState): CreateSpotInput {
  return {
    alias: d.alias,
    name: d.name,
    description: d.description || null,
    coverImage: d.coverImage || null,
    latitude: d.latitude,
    longitude: d.longitude,
    geofenceRadiusM: d.geofenceRadiusM,
    verification: d.verification,
    spotRewards: d.spotRewards,
    collectionEntryAliases: d.collectionEntryAliases
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    isActive: d.isActive,
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  /** When set, the dialog is in "edit" mode for this spot; otherwise create. */
  spot?: OfflineCheckInSpot | null
  onSaved?: () => void
}

export function SpotEditor({
  open,
  onOpenChange,
  campaignId,
  spot,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<DraftState>(blankDraft())
  const createMutation = useCreateOfflineCheckInSpot(campaignId)
  const updateMutation = useUpdateOfflineCheckInSpot(campaignId)
  const isPending = createMutation.isPending || updateMutation.isPending
  const isEdit = !!spot

  useEffect(() => {
    if (!open) return
    setDraft(spot ? fromSpot(spot) : blankDraft())
  }, [open, spot])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (draft.verification.methods.length === 0) {
      toast.error(m.offline_checkin_verification_no_methods())
      return
    }
    const payload = toCreateInput(draft)
    try {
      if (isEdit && spot) {
        await updateMutation.mutateAsync({ id: spot.id, ...payload })
        toast.success(m.offline_checkin_spot_updated())
      } else {
        await createMutation.mutateAsync(payload)
        toast.success(m.offline_checkin_spot_created())
      }
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.offline_checkin_failed_create(),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? m.offline_checkin_edit_spot()
              : m.offline_checkin_add_spot()}
          </DialogTitle>
          <DialogDescription>
            {m.offline_checkin_spots_count({
              count: 1,
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="spot-alias">
                {m.offline_checkin_spot_alias()} *
              </Label>
              <Input
                id="spot-alias"
                value={draft.alias}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, alias: e.target.value }))
                }
                placeholder="main-stage"
                disabled={isPending || isEdit}
              />
              <FieldHint>{m.offline_checkin_spot_alias_hint()}</FieldHint>
            </div>
            <div className="space-y-2">
              <Label htmlFor="spot-name">
                {m.offline_checkin_spot_name()} *
              </Label>
              <Input
                id="spot-name"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spot-desc">
              {m.offline_checkin_spot_description()}
            </Label>
            <Textarea
              id="spot-desc"
              rows={2}
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="spot-lat">
                {m.offline_checkin_spot_lat()} *
              </Label>
              <Input
                id="spot-lat"
                type="number"
                step="any"
                value={draft.latitude}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    latitude: Number(e.target.value),
                  }))
                }
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spot-lng">
                {m.offline_checkin_spot_lng()} *
              </Label>
              <Input
                id="spot-lng"
                type="number"
                step="any"
                value={draft.longitude}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    longitude: Number(e.target.value),
                  }))
                }
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spot-radius">
                {m.offline_checkin_spot_radius()}
              </Label>
              <Input
                id="spot-radius"
                type="number"
                min={1}
                max={10000}
                value={draft.geofenceRadiusM}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    geofenceRadiusM: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
                disabled={isPending}
              />
              <FieldHint>{m.offline_checkin_spot_radius_hint()}</FieldHint>
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3 bg-muted/20">
            <Label>{m.offline_checkin_verification()} *</Label>
            <VerificationEditor
              value={draft.verification}
              onChange={(verification) =>
                setDraft((d) => ({ ...d, verification }))
              }
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="spot-aliases">
              {m.offline_checkin_spot_collection_aliases()}
            </Label>
            <Input
              id="spot-aliases"
              value={draft.collectionEntryAliases}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  collectionEntryAliases: e.target.value,
                }))
              }
              placeholder="stamp-a, stamp-b"
              disabled={isPending}
            />
            <FieldHint>
              {m.offline_checkin_spot_collection_aliases_hint()}
            </FieldHint>
          </div>

          <RewardEntryEditor
            label={m.offline_checkin_spot_rewards()}
            entries={draft.spotRewards}
            onChange={(entries) =>
              setDraft((d) => ({ ...d, spotRewards: entries }))
            }
            hint={m.offline_checkin_spot_rewards_hint()}
            disabled={isPending}
          />

          <div className="flex items-center gap-2">
            <Switch
              id="spot-active"
              checked={draft.isActive}
              onCheckedChange={(checked) =>
                setDraft((d) => ({ ...d, isActive: checked }))
              }
              disabled={isPending}
            />
            <Label htmlFor="spot-active">
              {m.offline_checkin_spot_active()}
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {m.common_cancel()}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? m.common_save() : m.common_create()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
