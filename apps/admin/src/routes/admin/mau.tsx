/**
 * Platform admin MAU dashboard.
 *
 * One row per Better Auth team in the system. Sortable by overage by
 * default — the dashboard is mostly used to spot which customers are
 * about to overrun their plan / which are quietly running idle.
 *
 * Sort & filter happen client-side over a single fetched payload —
 * the row count is bounded by the customer count, which for our
 * stage is well under the threshold where server-side pagination
 * would matter. Revisit when the platform crosses ~1k teams.
 */

import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { useMemo, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table"
import { api } from "../../lib/api-client"
import { cn } from "../../lib/utils"
import * as m from "../../paraglide/messages.js"

export const Route = createFileRoute("/admin/mau")({
  component: AdminMauPage,
})

type SubscriptionStatus = "active" | "past_due" | "canceled"

type Row = {
  organizationId: string
  organizationName: string
  teamId: string
  teamName: string
  yearMonth: string
  mau: number
  quota: number | null
  overage: number
  overageUnitsPer1k: number
  projectedOverageCents: number
  plan: { id: string; name: string; slug: string } | null
  subscriptionStatus: SubscriptionStatus | null
}

type Response = {
  yearMonth: string
  items: Row[]
  totals: {
    teams: number
    mau: number
    projectedOverageCents: number
  }
}

type SortKey =
  | "organizationName"
  | "teamName"
  | "mau"
  | "overage"
  | "projectedOverageCents"
type SortDir = "asc" | "desc"

function formatCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function AdminMauPage() {
  const [sortBy, setSortBy] = useState<SortKey>("overage")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [q, setQ] = useState("")

  // Server-side sort + filter: we send the parameters and let the
  // service apply them (it has to reduce after deriving overage
  // anyway, see service.ts header). Client-side sort would also
  // work but having one source of truth — the server's response —
  // matches the "open the page, screenshot it for ops review"
  // use case better.
  const query = useQuery<Response>({
    queryKey: ["platform-mau", sortBy, sortDir, q],
    queryFn: () => {
      const params = new URLSearchParams({ sortBy, sortDir })
      if (q.trim()) params.set("q", q.trim())
      return api.get<Response>(`/api/v1/platform/billing/mau?${params}`)
    },
    staleTime: 30_000,
  })

  const items = query.data?.items ?? []
  const totals = query.data?.totals
  const yearMonth = query.data?.yearMonth ?? ""

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortBy(key)
      // Default direction depends on whether the column is "more is
      // worse" (mau / overage) or "more is meaningless" (names).
      setSortDir(
        key === "organizationName" || key === "teamName" ? "asc" : "desc",
      )
    }
  }

  const totalsRow = useMemo(() => {
    if (!totals) return null
    return (
      <div className="grid grid-cols-3 gap-4">
        <Stat label={m.admin_mau_total_teams()} value={formatNumber(totals.teams)} />
        <Stat label={m.admin_mau_total_mau()} value={formatNumber(totals.mau)} />
        <Stat
          label={m.admin_mau_total_overage()}
          value={formatCents(totals.projectedOverageCents)}
        />
      </div>
    )
  }, [totals])

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{m.admin_mau_title()}</CardTitle>
          <CardDescription>
            {m.admin_mau_subtitle()}
            {yearMonth ? ` · ${yearMonth}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {totalsRow}
          <Input
            placeholder={m.admin_mau_search_placeholder()}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-sm"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  active={sortBy === "organizationName"}
                  dir={sortDir}
                  onClick={() => handleSort("organizationName")}
                >
                  {m.admin_mau_col_org()}
                </SortableHead>
                <SortableHead
                  active={sortBy === "teamName"}
                  dir={sortDir}
                  onClick={() => handleSort("teamName")}
                >
                  {m.admin_mau_col_team()}
                </SortableHead>
                <SortableHead
                  active={sortBy === "mau"}
                  dir={sortDir}
                  onClick={() => handleSort("mau")}
                  align="right"
                >
                  {m.admin_mau_col_mau()}
                </SortableHead>
                <TableHead className="text-right">
                  {m.admin_mau_col_quota()}
                </TableHead>
                <SortableHead
                  active={sortBy === "overage"}
                  dir={sortDir}
                  onClick={() => handleSort("overage")}
                  align="right"
                >
                  {m.admin_mau_col_overage()}
                </SortableHead>
                <SortableHead
                  active={sortBy === "projectedOverageCents"}
                  dir={sortDir}
                  onClick={() => handleSort("projectedOverageCents")}
                  align="right"
                >
                  {m.admin_mau_col_overage_cents()}
                </SortableHead>
                <TableHead>{m.admin_mau_col_plan()}</TableHead>
                <TableHead>{m.admin_mau_col_status()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground"
                  >
                    {m.admin_mau_loading()}
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground"
                  >
                    {m.admin_mau_empty()}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((r) => (
                  <TableRow key={r.teamId}>
                    <TableCell className="font-medium">
                      {r.organizationName}
                    </TableCell>
                    <TableCell>{r.teamName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(r.mau)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.quota === null ? "—" : formatNumber(r.quota)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        r.overage > 0 && "font-semibold text-destructive",
                      )}
                    >
                      {r.overage > 0 ? `+${formatNumber(r.overage)}` : "0"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        r.projectedOverageCents > 0 &&
                          "font-semibold text-destructive",
                      )}
                    >
                      {r.projectedOverageCents > 0
                        ? formatCents(r.projectedOverageCents)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {r.plan?.name ?? (
                        <span className="text-muted-foreground">
                          {m.admin_mau_no_plan()}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.subscriptionStatus ? (
                        <StatusBadge status={r.subscriptionStatus} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/30 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function SortableHead({
  children,
  active,
  dir,
  onClick,
  align = "left",
}: {
  children: React.ReactNode
  active: boolean
  dir: SortDir
  onClick: () => void
  align?: "left" | "right"
}) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span>{children}</span>
        <Icon className="size-3" />
      </button>
    </TableHead>
  )
}

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const cls =
    status === "active"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "past_due"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "bg-muted text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      {status}
    </span>
  )
}
