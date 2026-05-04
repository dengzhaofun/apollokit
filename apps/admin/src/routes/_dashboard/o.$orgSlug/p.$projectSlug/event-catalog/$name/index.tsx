import { useTenantParams } from "#/hooks/use-tenant-params";
import { createFileRoute, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { ArrowLeft } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { FieldEditor } from "#/components/event-catalog/FieldEditor"
import { Alert, AlertDescription } from "#/components/ui/alert"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Label } from "#/components/ui/label"
import { Textarea } from "#/components/ui/textarea"
import {
  useEventCatalogEntry,
  useUpdateEventCatalogEntry,
} from "#/hooks/use-event-catalog"
import { ApiError } from "#/lib/api-client"
import type { EventFieldRow } from "#/lib/types/event-catalog"
import * as m from "#/paraglide/messages.js"
import { PageHeader } from "#/components/patterns"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/event-catalog/$name/")({
  component: EventCatalogDetailPage,
})

function EventCatalogDetailPage() {
  const { name } = Route.useParams()
  const { data: entry, isPending, error } = useEventCatalogEntry(name)
  const updateMut = useUpdateEventCatalogEntry()

  const readOnly = entry?.source === "internal"
  const { orgSlug, projectSlug } = useTenantParams()
  const [description, setDescription] = useState("")
  const [fields, setFields] = useState<EventFieldRow[]>([])

  // Sync local edit state when the server entry changes (or on first load).
  // We leave the form dirty only after an edit — the moment the server
  // returns a newer row we re-seed both the description and fields.
  useEffect(() => {
    if (!entry) return
    setDescription(entry.description ?? "")
    setFields(entry.fields)
  }, [entry])

  async function handleSave() {
    try {
      await updateMut.mutateAsync({
        name,
        input: {
          description: description.trim() === "" ? null : description,
          fields,
        },
      })
      toast.success(m.event_catalog_save_success())
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.body.error)
      } else {
        toast.error(m.event_catalog_save_failed())
      }
    }
  }

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{name}</span>}
        actions={
          <Button
            render={
              <Link to="/o/$orgSlug/p/$projectSlug/event-catalog" params={{ orgSlug, projectSlug }}>
                <ArrowLeft className="size-4" />
                {m.common_back()}
              </Link>
            }
            variant="ghost"
            size="sm"
          />
        }
      />

      <main className="flex-1 space-y-6 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.event_catalog_failed_load()} {error.message}
          </div>
        ) : entry ? (
          <>
            {/* Meta panel */}
            <div className="grid grid-cols-2 gap-4 rounded-xl border bg-card p-6 shadow-sm md:grid-cols-4">
              <MetaItem label={m.event_catalog_field_source()}>
                <Badge variant={entry.source === "internal" ? "secondary" : "outline"}>
                  {entry.source === "internal"
                    ? m.event_catalog_source_internal()
                    : m.event_catalog_source_external()}
                </Badge>
              </MetaItem>
              <MetaItem label={m.event_catalog_field_owner()}>
                <span className="text-sm">{entry.owner ?? "—"}</span>
              </MetaItem>
              <MetaItem label={m.event_catalog_field_status()}>
                {entry.status === null ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : entry.status === "canonical" ? (
                  <Badge variant="default">
                    {m.event_catalog_status_canonical()}
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    {m.event_catalog_status_inferred()}
                  </Badge>
                )}
              </MetaItem>
              <MetaItem label={m.event_catalog_field_last_seen()}>
                <span className="text-sm text-muted-foreground">
                  {entry.lastSeenAt
                    ? format(new Date(entry.lastSeenAt), "yyyy-MM-dd HH:mm")
                    : m.event_catalog_never_seen()}
                </span>
              </MetaItem>
              <MetaItem label={m.event_catalog_field_forwards()}>
                {entry.forwardToTask ? (
                  <Badge variant="secondary">
                    {m.event_catalog_forwards_yes()}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {m.event_catalog_forwards_no()}
                  </span>
                )}
              </MetaItem>
            </div>

            {readOnly ? (
              <Alert>
                <AlertDescription>
                  {m.event_catalog_read_only_hint()}
                </AlertDescription>
              </Alert>
            ) : entry.status === "inferred" ? (
              <Alert>
                <AlertDescription>
                  {m.event_catalog_inferred_hint()}
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Description */}
            <div className="space-y-2 rounded-xl border bg-card p-6 shadow-sm">
              <Label htmlFor="description">
                {m.event_catalog_description_label()}
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={m.event_catalog_description_placeholder()}
                rows={3}
                disabled={readOnly}
              />
            </div>

            {/* Fields editor */}
            <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
              <div>
                <h2 className="text-sm font-semibold">
                  {m.event_catalog_fields_heading()}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.event_catalog_fields_hint()}
                </p>
              </div>
              <FieldEditor
                value={fields}
                onChange={setFields}
                disabled={readOnly}
              />
            </div>

            {/* Sample payload */}
            {entry.sampleEventData ? (
              <div className="space-y-2 rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="text-sm font-semibold">
                  {m.event_catalog_sample_heading()}
                </h2>
                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(entry.sampleEventData, null, 2)}
                </pre>
              </div>
            ) : null}

            {!readOnly && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  onClick={handleSave}
                  disabled={updateMut.isPending}
                >
                  {updateMut.isPending
                    ? m.common_saving()
                    : m.event_catalog_save_canonical()}
                </Button>
              </div>
            )}
          </>
        ) : null}
      </main>
    </>
  )
}

function MetaItem({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}

