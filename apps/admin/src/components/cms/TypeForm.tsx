/**
 * Form for creating / editing a CMS type.
 *
 * Wraps the universal type metadata (alias / name / description / icon /
 * groupOptions / status) plus the SchemaBuilder for the dynamic field list.
 *
 * Schema evolution constraint: when editing an existing type, the
 * SchemaBuilder runs in `evolutionMode` which surfaces a warning that
 * only additive changes are allowed. Server-side validation is the real
 * guardrail; this is just a hint.
 */

import { useState } from "react"

import { SchemaBuilder } from "#/components/cms/SchemaBuilder"
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
import { Textarea } from "#/components/ui/textarea"
import * as m from "#/paraglide/messages.js"
import type {
  CmsSchemaDef,
  CmsType,
  CmsTypeStatus,
  CreateCmsTypeInput,
} from "#/lib/types/cms"

interface TypeFormProps {
  initial?: CmsType
  onSubmit: (
    values: CreateCmsTypeInput & { status?: CmsTypeStatus },
  ) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
  /** Read-only alias when editing — alias change is not supported by the API. */
  aliasLocked?: boolean
}

export function TypeForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
  aliasLocked,
}: TypeFormProps) {
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [name, setName] = useState(initial?.name ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [schema, setSchema] = useState<CmsSchemaDef>(
    initial?.schema ?? { fields: [] },
  )
  const [groupOptionsText, setGroupOptionsText] = useState(
    (initial?.groupOptions ?? []).join(", "),
  )
  const [status, setStatus] = useState<CmsTypeStatus>(
    initial?.status ?? "active",
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const groupOptions = groupOptionsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    await onSubmit({
      alias: alias.trim(),
      name: name.trim(),
      description: description.trim() || null,
      icon: initial?.icon ?? null,
      schema,
      groupOptions: groupOptions.length > 0 ? groupOptions : null,
      status,
    })
  }

  const canSubmit =
    alias.trim().length > 0 &&
    name.trim().length > 0 &&
    schema.fields.length > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.cms_section_basic()}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="alias" className="inline-flex items-center gap-1.5">
              {m.common_alias()} *
              <FieldHint>{m.cms_type_alias_hint()}</FieldHint>
            </Label>
            <Input
              id="alias"
              required
              readOnly={aliasLocked}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="blog-post"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">{m.common_name()} *</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Blog Post"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="description">{m.common_description()}</Label>
          <Textarea
            id="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="groupOptions" className="inline-flex items-center gap-1.5">
              {m.cms_type_group_options()}
              <FieldHint>{m.cms_type_group_options_hint()}</FieldHint>
            </Label>
            <Input
              id="groupOptions"
              value={groupOptionsText}
              onChange={(e) => setGroupOptionsText(e.target.value)}
              placeholder="home-feed, support, billing"
            />
          </div>
          {initial ? (
            <div className="space-y-1">
              <Label>{m.common_status()}</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as CmsTypeStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">
                    {m.cms_type_status_active()}
                  </SelectItem>
                  <SelectItem value="archived">
                    {m.cms_type_status_archived()}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">
            {m.cms_section_schema()}
          </h2>
          <p className="text-xs text-muted-foreground">
            {m.cms_section_schema_hint()}
          </p>
        </div>
        <SchemaBuilder
          value={schema}
          onChange={setSchema}
          evolutionMode={!!initial}
        />
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
