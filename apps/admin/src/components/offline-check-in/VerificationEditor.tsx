/**
 * Inline editor for `OfflineCheckInVerification`.
 *
 * UX choice: methods is a flat list with per-row "kind" picker; we don't
 * collapse "static QR" and "one-time QR" into one row because the field
 * panel for each is different (mode flag) and tenants think of them as
 * distinct stations on the printed materials.
 *
 * The combinator picker is a simple two-option Select — there's no
 * default at the schema level (server's zod required it explicitly) so
 * we always show the value clearly.
 */

import { Plus, Trash2 } from "lucide-react"

import { Button } from "#/components/ui/button"
import { FieldHint } from "#/components/ui/field-hint"
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
import type {
  OfflineCheckInVerification,
  OfflineCheckInVerificationMethod,
} from "#/lib/types/offline-check-in"
import * as m from "#/paraglide/messages.js"

type MethodKindKey = "gps" | "qr_static" | "qr_one_time" | "manual_code" | "photo"

function methodKey(method: OfflineCheckInVerificationMethod): MethodKindKey {
  if (method.kind === "qr") {
    return method.mode === "one_time" ? "qr_one_time" : "qr_static"
  }
  return method.kind as MethodKindKey
}

function defaultMethod(key: MethodKindKey): OfflineCheckInVerificationMethod {
  switch (key) {
    case "gps":
      return { kind: "gps", radiusM: 100 }
    case "qr_static":
      return { kind: "qr", mode: "static" }
    case "qr_one_time":
      return { kind: "qr", mode: "one_time" }
    case "manual_code":
      return { kind: "manual_code", staffOnly: true }
    case "photo":
      return { kind: "photo", required: false }
  }
}

function methodLabel(key: MethodKindKey): string {
  switch (key) {
    case "gps":
      return m.offline_checkin_verification_method_gps()
    case "qr_static":
      return m.offline_checkin_verification_method_qr_static()
    case "qr_one_time":
      return m.offline_checkin_verification_method_qr_one_time()
    case "manual_code":
      return m.offline_checkin_verification_method_manual_code()
    case "photo":
      return m.offline_checkin_verification_method_photo()
  }
}

interface Props {
  value: OfflineCheckInVerification
  onChange: (next: OfflineCheckInVerification) => void
  disabled?: boolean
}

export function VerificationEditor({ value, onChange, disabled }: Props) {
  function setCombinator(combinator: "any" | "all") {
    onChange({ ...value, combinator })
  }

  function updateMethod(
    index: number,
    next: OfflineCheckInVerificationMethod,
  ) {
    const methods = [...value.methods]
    methods[index] = next
    onChange({ ...value, methods })
  }

  function removeMethod(index: number) {
    const methods = value.methods.filter((_, i) => i !== index)
    onChange({ ...value, methods })
  }

  function addMethod(key: MethodKindKey) {
    onChange({ ...value, methods: [...value.methods, defaultMethod(key)] })
  }

  // Avoid duplicate kind-keys to keep the editor tidy. (Server still
  // accepts duplicates but offering the same kind twice is rarely useful
  // — except for, e.g., two different QR modes, which we keep.)
  const usedKeys = new Set(value.methods.map(methodKey))
  const addable: MethodKindKey[] = (
    ["gps", "qr_static", "qr_one_time", "manual_code", "photo"] as const
  ).filter((k) => !usedKeys.has(k))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label>{m.offline_checkin_verification_combinator()}</Label>
          <Select
            value={value.combinator}
            onValueChange={(v) => setCombinator(v as "any" | "all")}
            disabled={disabled}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">
                {m.offline_checkin_verification_combinator_any()}
              </SelectItem>
              <SelectItem value="all">
                {m.offline_checkin_verification_combinator_all()}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        <Label>{m.offline_checkin_verification_methods()}</Label>
        {value.methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {m.offline_checkin_verification_no_methods()}
          </p>
        ) : null}
        {value.methods.map((method, i) => {
          const key = methodKey(method)
          return (
            <div
              key={`${key}-${i}`}
              className="rounded-md border p-3 space-y-3 bg-muted/30"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{methodLabel(key)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMethod(i)}
                  disabled={disabled}
                >
                  <Trash2 className="size-4" />
                  {m.offline_checkin_verification_remove_method()}
                </Button>
              </div>

              {method.kind === "gps" ? (
                <div>
                  <Label htmlFor={`gps-radius-${i}`}>
                    {m.offline_checkin_spot_radius()}
                  </Label>
                  <Input
                    id={`gps-radius-${i}`}
                    type="number"
                    min={1}
                    max={10000}
                    value={method.radiusM}
                    onChange={(e) =>
                      updateMethod(i, {
                        kind: "gps",
                        radiusM: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    disabled={disabled}
                    className="mt-1 w-32"
                  />
                </div>
              ) : null}

              {method.kind === "photo" ? (
                <div className="flex items-center gap-2">
                  <Switch
                    id={`photo-required-${i}`}
                    checked={!!method.required}
                    onCheckedChange={(checked) =>
                      updateMethod(i, { kind: "photo", required: checked })
                    }
                    disabled={disabled}
                  />
                  <Label htmlFor={`photo-required-${i}`}>
                    {m.offline_checkin_verification_method_photo_required()}
                  </Label>
                </div>
              ) : null}
            </div>
          )
        })}

        {addable.length > 0 && !disabled ? (
          <div className="flex flex-wrap gap-2">
            {addable.map((k) => (
              <Button
                key={k}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addMethod(k)}
              >
                <Plus className="size-4" />
                {methodLabel(k)}
              </Button>
            ))}
          </div>
        ) : null}
        <FieldHint>
          {value.combinator === "all"
            ? m.offline_checkin_verification_combinator_all()
            : m.offline_checkin_verification_combinator_any()}
        </FieldHint>
      </div>
    </div>
  )
}
