import { createFileRoute, Link } from "@tanstack/react-router"
import { HeartHandshakeIcon, Plus } from "lucide-react"

import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useAssistPoolConfigs } from "#/hooks/use-assist-pool"
import type { AssistContributionPolicy } from "#/lib/types/assist-pool"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/assist-pool/")({
  component: AssistPoolListPage,
})

function formatPolicy(p: AssistContributionPolicy): string {
  switch (p.kind) {
    case "fixed":
      return `fixed(${p.amount})`
    case "uniform":
      return `uniform(${p.min}..${p.max})`
    case "decaying":
      return `decaying(base=${p.base}, tail=${(p.tailRatio * 100).toFixed(0)}%→${p.tailFloor})`
  }
}

function AssistPoolListPage() {
  const { data: configs, isPending, error, refetch } = useAssistPoolConfigs()
  const total = configs?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<HeartHandshakeIcon className="size-5" />}
        title={t("助力池", "Assist pools")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 个助力池`, `${total} pools total`)
        }
        actions={
          <Button asChild size="sm">
            <Link to="/assist-pool/create">
              <Plus />
              {m.assistpool_new_config()}
            </Link>
          </Button>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("助力池加载失败", "Failed to load assist pools")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有助力池", "No assist pools yet")}
            description={t(
              "创建第一个助力池,聚合好友 / 公会贡献达成共同目标。",
              "Create your first pool to aggregate friend or guild contributions toward a shared goal.",
            )}
            action={
              <Button asChild size="sm">
                <Link to="/assist-pool/create">
                  <Plus />
                  {m.assistpool_new_config()}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.assistpool_col_name()}</TableHead>
                  <TableHead>{m.assistpool_col_alias()}</TableHead>
                  <TableHead>{m.assistpool_col_mode()}</TableHead>
                  <TableHead>{m.assistpool_col_target()}</TableHead>
                  <TableHead>{m.assistpool_col_policy()}</TableHead>
                  <TableHead>{m.assistpool_col_ttl()}</TableHead>
                  <TableHead>{m.assistpool_col_active()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs!.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.alias ?? "—"}
                    </TableCell>
                    <TableCell>{c.mode}</TableCell>
                    <TableCell>{c.targetAmount}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatPolicy(c.contributionPolicy)}
                    </TableCell>
                    <TableCell>{c.expiresInSeconds}</TableCell>
                    <TableCell>
                      {c.isActive ? m.assistpool_yes() : m.assistpool_no()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
