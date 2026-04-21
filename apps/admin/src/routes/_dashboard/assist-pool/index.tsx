import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import { PageHeaderActions } from "#/components/PageHeader"
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
  const { data: configs, isPending, error } = useAssistPoolConfigs()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto flex items-center gap-3">
          <Button asChild size="sm">
            <Link to="/assist-pool/create">
              <Plus className="size-4" />
              New assist pool
            </Link>
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            Failed to load configs: {error.message}
          </div>
        ) : (configs?.length ?? 0) === 0 ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            No assist-pool configs yet. Create one to get started.
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Alias</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>TTL (s)</TableHead>
                  <TableHead>Active</TableHead>
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
                    <TableCell>{c.isActive ? "yes" : "no"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </>
  )
}
