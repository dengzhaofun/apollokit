import { createFileRoute, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { ArrowLeft, Plus, RefreshCw, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Separator } from "#/components/ui/separator"
import { SidebarTrigger } from "#/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useWebhookEndpoints,
} from "#/hooks/use-activity"
import { ApiError } from "#/lib/api-client"
import type { CreateWebhookEndpointInput } from "#/lib/types/activity"

export const Route = createFileRoute("/_dashboard/activity/webhooks/")({
  component: WebhookEndpointsPage,
})

function randomSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function WebhookEndpointsPage() {
  const { data: endpoints, isPending, error } = useWebhookEndpoints()
  const createMutation = useCreateWebhookEndpoint()
  const deleteMutation = useDeleteWebhookEndpoint()

  const [form, setForm] = useState<CreateWebhookEndpointInput>({
    alias: "",
    url: "",
    secret: randomSecret(),
    enabled: true,
    retryPolicy: { maxAttempts: 5, backoffBaseSeconds: 60 },
  })

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <Button asChild variant="ghost" size="sm">
          <Link to="/activity">
            <ArrowLeft className="size-4" />
            返回活动列表
          </Link>
        </Button>
        <h1 className="text-sm font-semibold">Webhook endpoints</h1>
      </header>

      <main className="flex-1 space-y-4 p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          {/* Create form */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold">
              新建 webhook endpoint
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>别名 (alias)</Label>
                <Input
                  value={form.alias}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      alias: e.target.value.toLowerCase(),
                    }))
                  }
                  placeholder="game-server-main"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>URL</Label>
                <Input
                  value={form.url}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, url: e.target.value }))
                  }
                  placeholder="https://game.example.com/apollokit-hook"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>
                  HMAC secret (保存后不再可见，请妥善保管)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={form.secret}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, secret: e.target.value }))
                    }
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setForm((s) => ({ ...s, secret: randomSecret() }))
                    }
                  >
                    <RefreshCw className="size-4" />
                    重生成
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  服务端会用此 secret 对请求 body 做 HMAC-SHA256，放在
                  <code className="mx-1 rounded bg-muted px-1">
                    x-apollo-signature
                  </code>
                  header 发给客户。客户收到后用相同 secret 验签。
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>最大重试次数</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={form.retryPolicy?.maxAttempts ?? 5}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      retryPolicy: {
                        ...(s.retryPolicy ?? {
                          maxAttempts: 5,
                          backoffBaseSeconds: 60,
                        }),
                        maxAttempts: Number(e.target.value),
                      },
                    }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>退避基准秒</Label>
                <Input
                  type="number"
                  min={1}
                  max={3600}
                  value={form.retryPolicy?.backoffBaseSeconds ?? 60}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      retryPolicy: {
                        ...(s.retryPolicy ?? {
                          maxAttempts: 5,
                          backoffBaseSeconds: 60,
                        }),
                        backoffBaseSeconds: Number(e.target.value),
                      },
                    }))
                  }
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                disabled={
                  createMutation.isPending || !form.alias || !form.url
                }
                onClick={async () => {
                  try {
                    await createMutation.mutateAsync(form)
                    toast.success("创建成功")
                    setForm({
                      alias: "",
                      url: "",
                      secret: randomSecret(),
                      enabled: true,
                      retryPolicy: {
                        maxAttempts: 5,
                        backoffBaseSeconds: 60,
                      },
                    })
                  } catch (err) {
                    if (err instanceof ApiError) toast.error(err.body.error)
                    else toast.error("创建失败")
                  }
                }}
              >
                <Plus className="size-4" />
                创建
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="rounded-xl border bg-card shadow-sm">
            {isPending ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                加载中…
              </div>
            ) : error ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                加载失败：{error.message}
              </div>
            ) : !endpoints || endpoints.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                暂无 webhook endpoint
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>别名</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>重试策略</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>创建时间</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endpoints.map((ep) => (
                    <TableRow key={ep.id}>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {ep.alias}
                        </code>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-xs">
                        <span title={ep.url}>{ep.url}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ep.retryPolicy.maxAttempts} 次 ·{" "}
                        {ep.retryPolicy.backoffBaseSeconds}s 基准
                      </TableCell>
                      <TableCell>
                        <Badge variant={ep.enabled ? "default" : "outline"}>
                          {ep.enabled ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(ep.createdAt), "yyyy-MM-dd")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (!confirm(`删除 webhook "${ep.alias}"？`))
                              return
                            try {
                              await deleteMutation.mutateAsync(ep.id)
                              toast.success("已删除")
                            } catch (err) {
                              if (err instanceof ApiError)
                                toast.error(err.body.error)
                              else toast.error("删除失败")
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
