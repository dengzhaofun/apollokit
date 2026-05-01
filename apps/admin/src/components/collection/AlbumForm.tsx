import { useState } from "react"

import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
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
import { Textarea } from "#/components/ui/textarea"
import * as m from "#/paraglide/messages.js"
import type {
  AlbumScope,
  CollectionAlbum,
  CreateAlbumInput,
} from "#/lib/types/collection"

interface AlbumFormProps {
  initial?: CollectionAlbum
  onSubmit: (values: CreateAlbumInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
}

export function AlbumForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
}: AlbumFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? "")
  const [icon, setIcon] = useState(initial?.icon ?? "")
  const [scope, setScope] = useState<AlbumScope>(
    (initial?.scope as AlbumScope) ?? "custom",
  )
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      name,
      alias: alias || null,
      description: description || null,
      coverImage: coverImage || null,
      icon: icon || null,
      scope,
      isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="name">{m.collection_field_name()}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="alias" className="inline-flex items-center gap-1.5">
            {m.collection_field_alias()}
            <FieldHint>{m.collection_field_alias_hint()}</FieldHint>
          </Label>
          <Input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="dragons"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="description">{m.collection_field_description()}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>{m.collection_field_cover()}</Label>
          <MediaPickerDialog
            value={coverImage || null}
            onChange={setCoverImage}
          />
        </div>
        <div className="space-y-2">
          <Label>{m.collection_field_icon()}</Label>
          <MediaPickerDialog value={icon || null} onChange={setIcon} />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="scope">{m.collection_field_scope()}</Label>
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as AlbumScope)}
          >
            <SelectTrigger id="scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hero">{m.collection_scope_hero()}</SelectItem>
              <SelectItem value="monster">
                {m.collection_scope_monster()}
              </SelectItem>
              <SelectItem value="equipment">
                {m.collection_scope_equipment()}
              </SelectItem>
              <SelectItem value="custom">
                {m.collection_scope_custom()}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Switch
            id="isActive"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="isActive">{m.collection_field_enabled()}</Label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? m.collection_saving() : submitLabel}
        </Button>
      </div>
    </form>
  )
}
