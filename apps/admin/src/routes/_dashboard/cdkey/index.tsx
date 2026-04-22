import { createFileRoute, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { WriteGate } from "#/components/WriteGate"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useCdkeyBatches } from "#/hooks/use-cdkey"

export const Route = createFileRoute("/_dashboard/cdkey/")({
  component: CdkeyListPage,
})

function CdkeyListPage() {
  const { data: batches, isPending, error } = useCdkeyBatches()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <WriteGate>
            <Button asChild size="sm">
              <Link to="/cdkey/create">
                <Plus className="size-4" />
                {m.cdkey_new_batch()}
              </Link>
            </Button>
          </WriteGate>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        {isPending ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <div className="flex h-40 items-center justify-center text-destructive">
            {m.cdkey_failed_load()} {error.message}
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.common_name()}</TableHead>
                  <TableHead>{m.common_alias()}</TableHead>
                  <TableHead>{m.cdkey_code_type()}</TableHead>
                  <TableHead>{m.cdkey_redeemed()}</TableHead>
                  <TableHead>{m.common_status()}</TableHead>
                  <TableHead>{m.common_created()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!batches || batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {m.cdkey_no_batches()}
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <Link
                          to="/cdkey/$batchId"
                          params={{ batchId: b.id }}
                          className="font-medium hover:underline"
                        >
                          {b.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {b.alias ? (
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                            {b.alias}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {b.codeType === "universal"
                            ? m.cdkey_code_type_universal()
                            : m.cdkey_code_type_unique()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {b.totalRedeemed}
                        {b.totalLimit != null ? ` / ${b.totalLimit}` : ""}
                      </TableCell>
                      <TableCell>
                        <Badge variant={b.isActive ? "default" : "outline"}>
                          {b.isActive
                            ? m.common_active()
                            : m.common_inactive()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(b.createdAt), "yyyy-MM-dd")}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </>
  )
}
