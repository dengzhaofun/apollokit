import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus, Settings } from "lucide-react"
import { useState } from "react"

import { EntryTable } from "#/components/cms/EntryTable"
import { PageHeaderActions } from "#/components/PageHeader"
import { WriteGate } from "#/components/WriteGate"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { useCmsEntries, useCmsType } from "#/hooks/use-cms"
import * as m from "#/paraglide/messages.js"
import type { CmsEntryStatus } from "#/lib/types/cms"

export const Route = createFileRoute("/_dashboard/cms/$typeAlias/")({
  component: CmsEntryListPage,
})

function CmsEntryListPage() {
  const { typeAlias } = Route.useParams()
  const { data: type } = useCmsType(typeAlias)
  const [status, setStatus] = useState<CmsEntryStatus | "__all">("__all")
  const [groupKey, setGroupKey] = useState<string>("")
  const [tag, setTag] = useState<string>("")
  const [q, setQ] = useState<string>("")

  const { data, isPending, error } = useCmsEntries(typeAlias, {
    status: status === "__all" ? undefined : status,
    groupKey: groupKey || undefined,
    tag: tag || undefined,
    q: q || undefined,
  })

  const groupOptions = type?.groupOptions ?? null

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link
              to="/cms/types/$alias"
              params={{ alias: typeAlias }}
            >
              <Settings className="size-4" />
              {m.cms_entry_edit_type()}
            </Link>
          </Button>
          <WriteGate>
            <Button asChild size="sm">
              <Link
                to="/cms/$typeAlias/create"
                params={{ typeAlias }}
              >
                <Plus className="size-4" />
                {m.cms_entry_new()}
              </Link>
            </Button>
          </WriteGate>
        </div>
      </PageHeaderActions>

      <main className="flex-1 space-y-4 p-6">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <h1 className="text-lg font-semibold">{type?.name ?? typeAlias}</h1>
            <Badge variant="outline">{typeAlias}</Badge>
            {type ? (
              <span className="text-xs text-muted-foreground">
                v{type.schemaVersion} · {type.schema.fields.length}{" "}
                {m.cms_type_fields_count()}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as CmsEntryStatus | "__all")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{m.cms_filter_all_statuses()}</SelectItem>
                <SelectItem value="draft">{m.cms_entry_status_draft()}</SelectItem>
                <SelectItem value="published">
                  {m.cms_entry_status_published()}
                </SelectItem>
                <SelectItem value="archived">
                  {m.cms_entry_status_archived()}
                </SelectItem>
              </SelectContent>
            </Select>
            {groupOptions && groupOptions.length > 0 ? (
              <Select
                value={groupKey || "__all"}
                onValueChange={(v) => setGroupKey(v === "__all" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={m.cms_filter_group_placeholder()} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">
                    {m.cms_filter_all_groups()}
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
                placeholder={m.cms_filter_group_placeholder()}
                value={groupKey}
                onChange={(e) => setGroupKey(e.target.value)}
              />
            )}
            <Input
              placeholder={m.cms_filter_tag_placeholder()}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            />
            <Input
              placeholder={m.cms_filter_alias_placeholder()}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-card shadow-sm">
          {isPending ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : error ? (
            <div className="flex h-32 items-center justify-center text-destructive">
              {error.message}
            </div>
          ) : (
            <EntryTable
              typeAlias={typeAlias}
              data={data?.items ?? []}
            />
          )}
        </div>
      </main>
    </>
  )
}
