import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import * as m from "#/paraglide/messages.js"
import type {
  CollectionGroup,
  CreateGroupInput,
} from "#/lib/types/collection"

interface GroupFormProps {
  initial?: CollectionGroup
  onSubmit: (values: CreateGroupInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
  onCancel?: () => void
}

export function GroupForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
  onCancel,
}: GroupFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [icon, setIcon] = useState(initial?.icon ?? "")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      name,
      description: description || null,
      icon: icon || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="g-name">{m.collection_field_name()}</Label>
        <Input
          id="g-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="g-description">{m.collection_field_description()}</Label>
        <Textarea
          id="g-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="g-icon">{m.collection_field_icon()}</Label>
          <Input
            id="g-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {m.common_cancel()}
          </Button>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? m.collection_saving() : submitLabel}
        </Button>
      </div>
    </form>
  )
}
