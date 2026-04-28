/**
 * Form for creating / editing a CMS entry of a given type.
 *
 * Wraps:
 *   - Universal entry meta (alias / groupKey / tags / status)
 *   - The DynamicForm rendered against the type's schema for the actual
 *     `data` payload
 *
 * On edit, `version` is threaded through so optimistic-concurrency
 * mismatches surface as a server 409.
 */

import { useState } from "react"

import { DynamicForm } from "#/components/cms/DynamicForm"
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
import * as m from "#/paraglide/messages.js"
import type {
  CmsEntry,
  CmsEntryStatus,
  CmsType,
  CreateCmsEntryInput,
  UpdateCmsEntryInput,
} from "#/lib/types/cms"

interface EntryFormProps {
  type: CmsType
  initial?: CmsEntry
  onSubmit: (
    values: CreateCmsEntryInput | UpdateCmsEntryInput,
  ) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
  aliasLocked?: boolean
}

export function EntryForm({
  type,
  initial,
  onSubmit,
  submitLabel,
  isPending,
  aliasLocked,
}: EntryFormProps) {
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [groupKey, setGroupKey] = useState<string>(initial?.groupKey ?? "")
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "))
  const [status, setStatus] = useState<CmsEntryStatus>(
    initial?.status ?? "draft",
  )
  const [data, setData] = useState<Record<string, unknown>>(
    initial?.data ?? {},
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const tags = tagsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    if (initial) {
      const update: UpdateCmsEntryInput = {
        groupKey: groupKey || null,
        tags,
        data,
        status,
        version: initial.version,
      }
      await onSubmit(update)
    } else {
      const create: CreateCmsEntryInput = {
        alias: alias.trim(),
        groupKey: groupKey || null,
        tags,
        data,
        status,
      }
      await onSubmit(create)
    }
  }

  const canSubmit = !!initial || alias.trim().length > 0
  const groupOptions = type.groupOptions ?? null

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.cms_section_meta()}
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="entry-alias">{m.common_alias()} *</Label>
            <Input
              id="entry-alias"
              required
              readOnly={aliasLocked}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="hello-world"
            />
          </div>
          <div className="space-y-1">
            <Label>{m.common_status()}</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as CmsEntryStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{m.cms_entry_status_draft()}</SelectItem>
                <SelectItem value="published">
                  {m.cms_entry_status_published()}
                </SelectItem>
                <SelectItem value="archived">
                  {m.cms_entry_status_archived()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="entry-group">{m.cms_entry_group()}</Label>
            {groupOptions && groupOptions.length > 0 ? (
              <Select
                value={groupKey || "__none"}
                onValueChange={(v) => setGroupKey(!v || v === "__none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={m.cms_entry_group_none()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">
                    {m.cms_entry_group_none()}
                  </SelectItem>
                  {groupOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="entry-group"
                value={groupKey}
                onChange={(e) => setGroupKey(e.target.value)}
                placeholder="home-feed"
              />
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="entry-tags">{m.cms_entry_tags()}</Label>
            <Input
              id="entry-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="welcome, tutorial"
            />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {m.cms_section_data()}
        </h2>
        {type.schema.fields.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            {m.cms_entry_no_fields()}
          </p>
        ) : (
          <DynamicForm
            schema={type.schema}
            value={data}
            onChange={setData}
          />
        )}
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || !canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
