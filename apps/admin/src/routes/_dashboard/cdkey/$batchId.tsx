import { createFileRoute } from "@tanstack/react-router"
import { format } from "date-fns"
import { Ban, Download } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { listSearchSchema } from "#/lib/list-search"
import * as m from "#/paraglide/messages.js"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "#/components/ui/tabs"
import {
  useCdkeyBatch,
  useCdkeyCodes,
  useCdkeyLogs,
  useGenerateCdkeyCodes,
  useRevokeCdkeyCode,
} from "#/hooks/use-cdkey"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/cdkey/$batchId")({
  component: CdkeyBatchDetailPage,
  validateSearch: listSearchSchema.passthrough(),
})

function CdkeyBatchDetailPage() {
  const { batchId } = Route.useParams()
  const { data: batch, isPending, error } = useCdkeyBatch(batchId)

  return (
    <>
      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error || !batch ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.cdkey_failed_load()}
          </div>
        ) : (
          <Tabs defaultValue="detail" className="space-y-4">
            <TabsList>
              <TabsTrigger value="detail">{m.cdkey_tab_detail()}</TabsTrigger>
              <TabsTrigger value="codes">{m.cdkey_tab_codes()}</TabsTrigger>
              <TabsTrigger value="logs">{m.cdkey_tab_logs()}</TabsTrigger>
            </TabsList>

            <TabsContent value="detail">
              <BatchDetail batchId={batchId} batch={batch} />
            </TabsContent>
            <TabsContent value="codes">
              <CodesPane batchId={batchId} isUniversal={batch.codeType === "universal"} />
            </TabsContent>
            <TabsContent value="logs">
              <LogsPane batchId={batchId} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </>
  )
}

function BatchDetail({
  batchId,
  batch,
}: {
  batchId: string
  batch: NonNullable<ReturnType<typeof useCdkeyBatch>["data"]>
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-muted-foreground">ID</dt>
        <dd className="font-mono text-xs">{batch.id}</dd>

        <dt className="text-muted-foreground">{m.common_alias()}</dt>
        <dd>
          {batch.alias ? (
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              {batch.alias}
            </code>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </dd>

        <dt className="text-muted-foreground">{m.cdkey_code_type()}</dt>
        <dd>
          <Badge variant="outline">
            {batch.codeType === "universal"
              ? m.cdkey_code_type_universal()
              : m.cdkey_code_type_unique()}
          </Badge>
        </dd>

        <dt className="text-muted-foreground">{m.cdkey_total_limit()}</dt>
        <dd>{batch.totalLimit ?? "∞"}</dd>

        <dt className="text-muted-foreground">{m.cdkey_per_user_limit()}</dt>
        <dd>{batch.perUserLimit}</dd>

        <dt className="text-muted-foreground">{m.cdkey_redeemed()}</dt>
        <dd>{batch.totalRedeemed}</dd>

        <dt className="text-muted-foreground">{m.common_status()}</dt>
        <dd>
          <Badge variant={batch.isActive ? "default" : "outline"}>
            {batch.isActive ? m.common_active() : m.common_inactive()}
          </Badge>
        </dd>

        <dt className="text-muted-foreground">{m.cdkey_starts_at()}</dt>
        <dd>
          {batch.startsAt
            ? format(new Date(batch.startsAt), "yyyy-MM-dd HH:mm")
            : "—"}
        </dd>

        <dt className="text-muted-foreground">{m.cdkey_ends_at()}</dt>
        <dd>
          {batch.endsAt
            ? format(new Date(batch.endsAt), "yyyy-MM-dd HH:mm")
            : "—"}
        </dd>

        <dt className="text-muted-foreground">{m.cdkey_reward()}</dt>
        <dd>
          <pre className="rounded bg-muted p-2 text-xs">
            {JSON.stringify(batch.reward, null, 2)}
          </pre>
        </dd>
      </dl>

      <div className="mt-4 text-xs text-muted-foreground">
        batchId: <code>{batchId}</code>
      </div>
    </div>
  )
}

function CodesPane({
  batchId,
  isUniversal,
}: {
  batchId: string
  isUniversal: boolean
}) {
  // NOTE: Codes and Logs panes share the same URL search params (status,
  // cursor, q, etc.) because they live on the same route. Switching tabs
  // does not remap the keys — a `status=success` set in Logs would feed
  // the Codes query (which only accepts pending/redeemed/revoked/active)
  // and the server will 400 it. Acceptable as a follow-up; users typically
  // reset filters when switching tabs.
  const list = useCdkeyCodes(batchId, Route)
  const generate = useGenerateCdkeyCodes()
  const revoke = useRevokeCdkeyCode()
  const [count, setCount] = useState(100)

  const handleExport = () => {
    // Same-origin: admin worker forwards `/api/*` via service binding
    // (prod) or vite proxies it to localhost:8787 (dev). Either way, an
    // absolute origin is no longer needed.
    window.open(`/api/cdkey/batches/${batchId}/codes.csv`, "_blank")
  }

  const handleGenerate = async () => {
    try {
      const res = await generate.mutateAsync({ batchId, count })
      toast.success(`${m.cdkey_generate_success()}: ${res.generated}`)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.common_error(),
      )
    }
  }

  const handleRevoke = async (codeId: string) => {
    try {
      await revoke.mutateAsync(codeId)
      toast.success(m.cdkey_revoked())
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.body.error : m.common_error(),
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
        {!isUniversal && (
          <>
            <Label className="text-sm">{m.cdkey_generate_count()}</Label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 1)}
              className="w-28"
            />
            <Button
              onClick={handleGenerate}
              disabled={generate.isPending}
              size="sm"
            >
              {m.cdkey_generate_more()}
            </Button>
          </>
        )}
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-4" />
            {m.cdkey_export_csv()}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.cdkey_code()}</TableHead>
              <TableHead>{m.common_status()}</TableHead>
              <TableHead>{m.cdkey_redeemed_by()}</TableHead>
              <TableHead>{m.cdkey_redeemed_at()}</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  {m.common_loading()}
                </TableCell>
              </TableRow>
            ) : !list.items.length ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  {m.cdkey_no_codes()}
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {c.code}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        c.status === "redeemed" || c.status === "active"
                          ? "default"
                          : c.status === "revoked"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {c.redeemedBy ?? "—"}
                  </TableCell>
                  <TableCell>
                    {c.redeemedAt
                      ? format(new Date(c.redeemedAt), "yyyy-MM-dd HH:mm")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {c.status !== "revoked" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleRevoke(c.id)}
                      >
                        <Ban className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function LogsPane({ batchId }: { batchId: string }) {
  const list = useCdkeyLogs(batchId, Route)

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.cdkey_redeemed_at()}</TableHead>
            <TableHead>{m.cdkey_redeemed_by()}</TableHead>
            <TableHead>{m.cdkey_code()}</TableHead>
            <TableHead>{m.cdkey_log_source()}</TableHead>
            <TableHead>{m.cdkey_log_result()}</TableHead>
            <TableHead>{m.cdkey_log_reason()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                {m.common_loading()}
              </TableCell>
            </TableRow>
          ) : !list.items.length ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                {m.cdkey_no_logs()}
              </TableCell>
            </TableRow>
          ) : (
            list.items.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  {format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {log.endUserId}
                </TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {log.code}
                  </code>
                </TableCell>
                <TableCell>{log.source}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      log.status === "success"
                        ? "default"
                        : log.status === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {log.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {log.failReason ?? "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
