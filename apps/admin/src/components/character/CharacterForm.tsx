import { useState } from "react"

import { MediaPickerDialog } from "#/components/media-library/MediaPickerDialog"
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
import type {
  Character,
  CharacterSide,
  CreateCharacterInput,
} from "#/lib/types/character"
import * as m from "#/paraglide/messages.js"

interface CharacterFormProps {
  initial?: Character
  onSubmit: (values: CreateCharacterInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
}

const SIDE_NONE = "__none__"

export function CharacterForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
}: CharacterFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? "")
  const [portraitUrl, setPortraitUrl] = useState(initial?.portraitUrl ?? "")
  const [defaultSide, setDefaultSide] = useState<CharacterSide | null>(
    initial?.defaultSide ?? null,
  )
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      name: name.trim(),
      alias: alias.trim() ? alias.trim() : null,
      description: description.trim() ? description : null,
      avatarUrl: avatarUrl.trim() ? avatarUrl : null,
      portraitUrl: portraitUrl.trim() ? portraitUrl : null,
      defaultSide,
      isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <Label htmlFor="name">{m.character_field_name()}</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.character_field_name_placeholder()}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="alias">{m.character_field_alias()}</Label>
          <Input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder={m.character_field_alias_placeholder()}
          />
          <p className="text-xs text-muted-foreground">
            {m.character_field_alias_hint()}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="description">
            {m.character_field_description()}
          </Label>
          <Textarea
            id="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>{m.character_field_avatar()}</Label>
            <MediaPickerDialog
              value={avatarUrl || null}
              onChange={(url) => setAvatarUrl(url ?? "")}
            />
            <p className="text-xs text-muted-foreground">
              {m.character_field_avatar_hint()}
            </p>
          </div>

          <div className="space-y-1">
            <Label>{m.character_field_portrait()}</Label>
            <MediaPickerDialog
              value={portraitUrl || null}
              onChange={(url) => setPortraitUrl(url ?? "")}
            />
            <p className="text-xs text-muted-foreground">
              {m.character_field_portrait_hint()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>{m.character_field_default_side()}</Label>
            <Select
              value={defaultSide ?? SIDE_NONE}
              onValueChange={(v) =>
                setDefaultSide(v === SIDE_NONE ? null : (v as CharacterSide))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIDE_NONE}>
                  {m.character_side_none()}
                </SelectItem>
                <SelectItem value="left">{m.character_side_left()}</SelectItem>
                <SelectItem value="right">
                  {m.character_side_right()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3">
            <Label htmlFor="active" className="cursor-pointer">
              {m.character_field_active()}
            </Label>
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !name.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
