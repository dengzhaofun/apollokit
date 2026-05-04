import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  Copy,
  List,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Textarea } from "#/components/ui/textarea"
import { Can } from "#/components/auth/Can"
import {
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useReplayWebhookDelivery,
  useRotateWebhookSecret,
  useUpdateWebhookEndpoint,
  useWebhookDeliveries,
  useWebhookEndpoints,
} from "#/hooks/use-webhooks"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import type {
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEndpoint,
  WebhookEndpointStatus,
} from "#/lib/types/webhooks"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/settings/webhooks")({
  component: WebhooksPage,
  validateSearch: listSearchSchema.passthrough(),
})

function WebhooksPage() {
  const list = useWebhookEndpoints(Route)
  const [showCreate, setShowCreate] = useState(false)
  const [createdSecret, setCreatedSecret] = useState<{
    name: string
    secret: string
  } | null>(null)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{m.webhooks_title()}</h1>
          <p className="text-sm text-muted-foreground">
            {m.webhooks_description()}
          </p>
        </div>
        <Can resource="webhooks" action="write" mode="disable">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            {m.webhooks_create_endpoint()}
          </Button>
        </Can>
      </div>

      {list.isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : list.error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.common_failed_to_load({
              resource: m.webhooks_title(),
              error: list.error.message,
            })}
          </div>
        ) : list.items.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border bg-card text-muted-foreground">
            {m.webhooks_no_endpoints()}
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{m.webhooks_column_name()}</TableHead>
                    <TableHead>{m.webhooks_column_url()}</TableHead>
                    <TableHead>{m.webhooks_column_events()}</TableHead>
                    <TableHead>{m.webhooks_column_status()}</TableHead>
                    <TableHead>{m.webhooks_column_last_delivery()}</TableHead>
                    <TableHead className="w-40 text-right">
                      {m.webhooks_column_actions()}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.items.map((e) => (
                    <EndpointRow key={e.id} endpoint={e} />
                  ))}
                </TableBody>
              </Table>
            </div>
            {(list.canPrev || list.canNext) && (
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={list.prevPage}
                  disabled={!list.canPrev || list.isFetching}
                >
                  {m.data_table_prev()}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={list.nextPage}
                  disabled={!list.canNext || list.isFetching}
                >
                  {m.data_table_next()}
                </Button>
              </div>
            )}
          </>
        )}

      <CreateEndpointDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(name, secret) => {
          setShowCreate(false)
          setCreatedSecret({ name, secret })
        }}
      />

      {createdSecret && (
        <SecretRevealDialog
          title={m.webhooks_secret_created_title()}
          description={m.webhooks_secret_created_desc()}
          secret={createdSecret.secret}
          onClose={() => setCreatedSecret(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function EndpointRow({ endpoint }: { endpoint: WebhookEndpoint }) {
  const [showEdit, setShowEdit] = useState(false)
  const [showRotate, setShowRotate] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [showDeliveries, setShowDeliveries] = useState(false)
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null)

  const rotate = useRotateWebhookSecret()
  const remove = useDeleteWebhookEndpoint()

  const lastDelivery =
    endpoint.lastSuccessAt ?? endpoint.lastFailureAt ?? null

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          <div className="flex flex-col">
            <span>{endpoint.name}</span>
            <code className="text-[10px] text-muted-foreground">
              {endpoint.secretHint}
            </code>
          </div>
        </TableCell>
        <TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
          {endpoint.url}
        </TableCell>
        <TableCell className="text-xs">
          {endpoint.eventTypes.length === 0 ? (
            <Badge variant="outline">{m.webhooks_events_all()}</Badge>
          ) : (
            <div className="flex flex-wrap gap-1">
              {endpoint.eventTypes.map((t) => (
                <Badge key={t} variant="secondary" className="font-mono">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </TableCell>
        <TableCell>
          <StatusBadge status={endpoint.status} />
          {endpoint.status === "paused_failing" && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {m.webhooks_paused_warning({
                count: endpoint.consecutiveFailures,
              })}
            </p>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {lastDelivery ? new Date(lastDelivery).toLocaleString() : m.webhooks_never()}
        </TableCell>
        <TableCell>
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              title={m.webhooks_action_deliveries()}
              onClick={() => setShowDeliveries(true)}
            >
              <List className="size-4" />
            </Button>
            <Can resource="webhooks" action="write" mode="disable">
              <Button
                variant="ghost"
                size="sm"
                title={m.webhooks_action_edit()}
                onClick={() => setShowEdit(true)}
              >
                <Pencil className="size-4" />
              </Button>
            </Can>
            <Can resource="webhooks" action="write" mode="disable">
              <Button
                variant="ghost"
                size="sm"
                title={m.webhooks_action_rotate()}
                onClick={() => setShowRotate(true)}
              >
                <RotateCw className="size-4" />
              </Button>
            </Can>
            <Can resource="webhooks" action="write" mode="disable">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                title={m.webhooks_action_delete()}
                onClick={() => setShowDelete(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            </Can>
          </div>
        </TableCell>
      </TableRow>

      <EditEndpointDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        endpoint={endpoint}
      />

      <AlertDialog open={showRotate} onOpenChange={setShowRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.webhooks_rotate_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.webhooks_rotate_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const res = await rotate.mutateAsync(endpoint.id)
                  setRotatedSecret(res.secret)
                } catch (err) {
                  toast.error(
                    err instanceof ApiError ? err.body.message : String(err),
                  )
                }
              }}
            >
              {m.webhooks_rotate_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {rotatedSecret && (
        <SecretRevealDialog
          title={m.webhooks_secret_rotated_title()}
          description={m.webhooks_secret_rotated_desc()}
          secret={rotatedSecret}
          onClose={() => setRotatedSecret(null)}
        />
      )}

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.webhooks_delete_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.webhooks_delete_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => remove.mutate(endpoint.id)}
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeliveriesDialog
        open={showDeliveries}
        onOpenChange={setShowDeliveries}
        endpoint={endpoint}
      />
    </>
  )
}

function StatusBadge({ status }: { status: WebhookEndpointStatus }) {
  if (status === "active")
    return <Badge variant="default">{m.webhooks_status_active()}</Badge>
  if (status === "disabled")
    return <Badge variant="secondary">{m.webhooks_status_disabled()}</Badge>
  return <Badge variant="destructive">{m.webhooks_status_paused()}</Badge>
}

// ---------------------------------------------------------------------------
// Create / Edit dialogs
// ---------------------------------------------------------------------------

function CreateEndpointDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (name: string, secret: string) => void
}) {
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [eventTypesRaw, setEventTypesRaw] = useState("")
  const create = useCreateWebhookEndpoint()

  const handleCreate = async () => {
    const eventTypes = eventTypesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        url: url.trim(),
        description: description.trim() || null,
        eventTypes,
      })
      setName("")
      setUrl("")
      setDescription("")
      setEventTypesRaw("")
      onCreated(res.name, res.secret)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.body.message : String(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.webhooks_create_title()}</DialogTitle>
          <DialogDescription>{m.webhooks_create_desc()}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <EndpointFormFields
            name={name}
            url={url}
            description={description}
            eventTypesRaw={eventTypesRaw}
            onNameChange={setName}
            onUrlChange={setUrl}
            onDescriptionChange={setDescription}
            onEventTypesChange={setEventTypesRaw}
          />
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !url.trim() || create.isPending}
          >
            {create.isPending ? m.common_loading() : m.webhooks_create_endpoint()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditEndpointDialog({
  open,
  onOpenChange,
  endpoint,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint: WebhookEndpoint
}) {
  const [name, setName] = useState(endpoint.name)
  const [url, setUrl] = useState(endpoint.url)
  const [description, setDescription] = useState(endpoint.description ?? "")
  const [eventTypesRaw, setEventTypesRaw] = useState(
    endpoint.eventTypes.join(", "),
  )
  const [status, setStatus] = useState<"active" | "disabled">(
    endpoint.status === "paused_failing" ? "active" : endpoint.status,
  )
  const update = useUpdateWebhookEndpoint()

  const handleSave = async () => {
    const eventTypes = eventTypesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    try {
      await update.mutateAsync({
        id: endpoint.id,
        name: name.trim(),
        url: url.trim(),
        description: description.trim() || null,
        eventTypes,
        status,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.body.message : String(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.webhooks_edit_title()}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <EndpointFormFields
            name={name}
            url={url}
            description={description}
            eventTypesRaw={eventTypesRaw}
            onNameChange={setName}
            onUrlChange={setUrl}
            onDescriptionChange={setDescription}
            onEventTypesChange={setEventTypesRaw}
          />
          <div className="grid gap-2">
            <Label>{m.webhooks_column_status()}</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "active" | "disabled")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">
                  {m.webhooks_status_active()}
                </SelectItem>
                <SelectItem value="disabled">
                  {m.webhooks_status_disabled()}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !url.trim() || update.isPending}
          >
            {update.isPending ? m.common_loading() : m.common_save()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EndpointFormFields({
  name,
  url,
  description,
  eventTypesRaw,
  onNameChange,
  onUrlChange,
  onDescriptionChange,
  onEventTypesChange,
}: {
  name: string
  url: string
  description: string
  eventTypesRaw: string
  onNameChange: (v: string) => void
  onUrlChange: (v: string) => void
  onDescriptionChange: (v: string) => void
  onEventTypesChange: (v: string) => void
}) {
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="webhook-name">{m.webhooks_field_name()}</Label>
        <Input
          id="webhook-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={m.webhooks_field_name_placeholder()}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="webhook-url">{m.webhooks_field_url()}</Label>
        <Input
          id="webhook-url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder={m.webhooks_field_url_placeholder()}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="webhook-description">
          {m.webhooks_field_description()}
        </Label>
        <Input
          id="webhook-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={m.webhooks_field_description_placeholder()}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="webhook-events">
          {m.webhooks_field_event_types()}
        </Label>
        <Textarea
          id="webhook-events"
          value={eventTypesRaw}
          onChange={(e) => onEventTypesChange(e.target.value)}
          placeholder={m.webhooks_events_placeholder()}
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          {m.webhooks_field_event_types_hint()}
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Secret reveal dialog (used by create + rotate)
// ---------------------------------------------------------------------------

function SecretRevealDialog({
  title,
  description,
  secret,
  onClose,
}: {
  title: string
  description: string
  secret: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-4">
          <Label className="text-xs text-muted-foreground">
            {m.webhooks_field_name()} / secret
          </Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all">
              {secret}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="size-3" />
              {copied ? m.common_copied() : m.common_copy()}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{m.common_done()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Deliveries dialog
// ---------------------------------------------------------------------------

function DeliveriesDialog({
  open,
  onOpenChange,
  endpoint,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint: WebhookEndpoint
}) {
  const [status, setStatus] = useState<WebhookDeliveryStatus | "all">("all")
  const { data, isFetching, refetch } = useWebhookDeliveries(
    endpoint.id,
    { status: status === "all" ? undefined : status, limit: 100 },
    { enabled: open },
  )
  const replay = useReplayWebhookDelivery(endpoint.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {m.webhooks_deliveries_title({ name: endpoint.name })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 pb-2">
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as WebhookDeliveryStatus | "all")}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {m.webhooks_deliveries_filter_all()}
              </SelectItem>
              <SelectItem value="pending">
                {m.webhooks_delivery_status_pending()}
              </SelectItem>
              <SelectItem value="in_flight">
                {m.webhooks_delivery_status_in_flight()}
              </SelectItem>
              <SelectItem value="success">
                {m.webhooks_delivery_status_success()}
              </SelectItem>
              <SelectItem value="failed">
                {m.webhooks_delivery_status_failed()}
              </SelectItem>
              <SelectItem value="dead">
                {m.webhooks_delivery_status_dead()}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className="size-3" />
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-md border">
          {isFetching && !data ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : !data?.length ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.webhooks_deliveries_empty()}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.webhooks_delivery_col_event()}</TableHead>
                  <TableHead>{m.webhooks_delivery_col_status()}</TableHead>
                  <TableHead>{m.webhooks_delivery_col_attempts()}</TableHead>
                  <TableHead>{m.webhooks_delivery_col_last_code()}</TableHead>
                  <TableHead>{m.webhooks_delivery_col_created()}</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d) => (
                  <DeliveryRow
                    key={d.id}
                    delivery={d}
                    onReplay={() => replay.mutate(d.id)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeliveryRow({
  delivery,
  onReplay,
}: {
  delivery: WebhookDelivery
  onReplay: () => void
}) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <div className="flex flex-col">
          <span>{delivery.eventType}</span>
          <span className="text-[10px] text-muted-foreground">
            {delivery.eventId}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <DeliveryStatusBadge status={delivery.status} />
      </TableCell>
      <TableCell className="text-xs">{delivery.attemptCount}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {delivery.lastStatusCode ?? "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(delivery.createdAt).toLocaleString()}
      </TableCell>
      <TableCell>
        <Can resource="webhooks" action="write" mode="disable">
          <Button
            variant="ghost"
            size="sm"
            title={m.webhooks_deliveries_replay()}
            onClick={onReplay}
          >
            <RotateCw className="size-3" />
          </Button>
        </Can>
      </TableCell>
    </TableRow>
  )
}

function DeliveryStatusBadge({ status }: { status: WebhookDeliveryStatus }) {
  switch (status) {
    case "success":
      return <Badge variant="default">{m.webhooks_delivery_status_success()}</Badge>
    case "pending":
      return <Badge variant="outline">{m.webhooks_delivery_status_pending()}</Badge>
    case "in_flight":
      return <Badge variant="outline">{m.webhooks_delivery_status_in_flight()}</Badge>
    case "failed":
      return <Badge variant="secondary">{m.webhooks_delivery_status_failed()}</Badge>
    case "dead":
      return <Badge variant="destructive">{m.webhooks_delivery_status_dead()}</Badge>
  }
}
