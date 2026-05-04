import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { RedDot, type RedDotDisplayType } from "#/components/ui/red-dot"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import type {
  BadgeFromTemplateInput,
  BadgeTemplate,
} from "#/lib/types/badge"
import * as m from "#/paraglide/messages.js"

type Props = {
  templates: BadgeTemplate[]
  existingKeys: string[]
  onSubmit: (input: BadgeFromTemplateInput) => void | Promise<void>
  isPending?: boolean
}

const NO_PARENT = "__none__"

export function BadgeTemplatePicker({
  templates,
  existingKeys,
  onSubmit,
  isPending,
}: Props) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "")
  const [key, setKey] = useState("")
  const [parentKey, setParentKey] = useState<string | null>(null)
  const [signalKey, setSignalKey] = useState("")
  const [signalKeyPrefix, setSignalKeyPrefix] = useState("")

  const selected = templates.find((t) => t.id === templateId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    await onSubmit({
      templateId: selected.id,
      key: key.trim(),
      parentKey,
      signalKey:
        selected.requires.includes("signalKey") && signalKey.trim()
          ? signalKey.trim()
          : null,
      signalKeyPrefix:
        selected.requires.includes("signalKeyPrefix") && signalKeyPrefix.trim()
          ? signalKeyPrefix.trim()
          : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <Label className="mb-2 block">{m.badge_template_pick()}</Label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className={`flex items-start gap-3 rounded-md border p-3 text-left hover:bg-muted ${
                templateId === t.id ? "border-primary bg-primary/5" : ""
              }`}
            >
              <RedDot
                displayType={t.displayType as RedDotDisplayType}
                count={3}
                forceVisible
              />
              <div className="flex-1 space-y-0.5">
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">
                  {t.description}
                </div>
                <div className="flex gap-1 pt-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {t.dismissMode}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {t.signalMatchMode}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {selected ? (
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="space-y-1">
            <Label htmlFor="tpl-key">{m.badge_field_key()} *</Label>
            <Input
              id="tpl-key"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={m.badge_node_path_placeholder()}
              className="font-mono"
            />
          </div>

          <div className="space-y-1">
            <Label>{m.badge_field_parent()}</Label>
            <Select
              value={parentKey ?? NO_PARENT}
              onValueChange={(v) => setParentKey(v === NO_PARENT ? null : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>
                  {m.badge_parent_none()}
                </SelectItem>
                {existingKeys.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected.requires.includes("signalKey") ? (
            <div className="space-y-1">
              <Label htmlFor="tpl-signalKey">
                {m.badge_field_signal_key()} *
              </Label>
              <Input
                id="tpl-signalKey"
                required
                value={signalKey}
                onChange={(e) => setSignalKey(e.target.value)}
                placeholder={m.badge_template_metric_placeholder()}
                className="font-mono"
              />
            </div>
          ) : null}

          {selected.requires.includes("signalKeyPrefix") ? (
            <div className="space-y-1">
              <Label htmlFor="tpl-signalKeyPrefix">
                {m.badge_field_signal_key_prefix()} *
              </Label>
              <Input
                id="tpl-signalKeyPrefix"
                required
                value={signalKeyPrefix}
                onChange={(e) => setSignalKeyPrefix(e.target.value)}
                placeholder={m.badge_template_prefix_placeholder()}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {m.badge_field_signal_key_prefix_hint()}
              </p>
            </div>
          ) : null}

          <Button type="submit" disabled={isPending || !key.trim()}>
            {m.badge_template_create()}
          </Button>
        </section>
      ) : null}
    </form>
  )
}
