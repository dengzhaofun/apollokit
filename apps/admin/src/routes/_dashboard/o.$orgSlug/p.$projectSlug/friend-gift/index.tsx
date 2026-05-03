import { createFileRoute, Link } from "@tanstack/react-router"
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table"
import { Plus } from "lucide-react"
import { useMemo } from "react"

import * as m from "#/paraglide/messages.js"
import { DataTable } from "#/components/data-table/DataTable"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import {
  useFriendGiftPackages,
  useFriendGiftSettings,
} from "#/hooks/use-friend-gift"
import { listSearchSchema } from "#/lib/list-search"
import type { FriendGiftPackage } from "#/lib/types/friend-gift"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/friend-gift/")({
  component: FriendGiftPage,
  validateSearch: listSearchSchema.passthrough(),
})

const columnHelper = createColumnHelper<FriendGiftPackage>()

function useColumns(): ColumnDef<FriendGiftPackage, unknown>[] {
  return useMemo(
    () => [
      columnHelper.accessor("name", {
        header: () => m.common_name(),
        meta: { primary: true },
        cell: (info) => (
          <Link
            to="/friend-gift/packages/$packageId"
            params={{ packageId: info.row.original.id }}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("alias", {
        header: () => m.common_alias(),
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("giftItems", {
        header: () => m.gift_items_count(),
        cell: (info) => (
          <Badge variant="secondary">
            {info.getValue().length} item{info.getValue().length !== 1 ? "s" : ""}
          </Badge>
        ),
      }),
      columnHelper.accessor("isActive", {
        header: () => m.common_status(),
        cell: (info) => (
          <Badge variant={info.getValue() ? "default" : "destructive"}>
            {info.getValue() ? m.common_active() : m.common_inactive()}
          </Badge>
        ),
      }),
      columnHelper.accessor("sortOrder", { header: () => m.common_sort_order() }),
      columnHelper.accessor("createdAt", {
        header: () => m.common_created(),
        cell: (info) => new Date(info.getValue()).toLocaleDateString(),
      }),
    ],
    [],
  ) as ColumnDef<FriendGiftPackage, unknown>[]
}

function FriendGiftPage() {
  const { data: settings, isPending: settingsLoading } = useFriendGiftSettings()
  const list = useFriendGiftPackages(Route)
  const columns = useColumns()

  return (
    <>
      <main className="flex-1 space-y-6 p-6">
        {/* Settings card */}
        <Card>
          <CardHeader>
            <CardTitle>{m.gift_settings()}</CardTitle>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <p className="text-muted-foreground">{m.common_loading()}</p>
            ) : settings ? (
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    {m.gift_daily_send_limit()}
                  </span>
                  <p className="font-medium">{settings.dailySendLimit}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {m.gift_daily_receive_limit()}
                  </span>
                  <p className="font-medium">{settings.dailyReceiveLimit}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{m.gift_timezone()}</span>
                  <p className="font-medium">{settings.timezone}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">{m.gift_no_settings()}</p>
            )}
          </CardContent>
        </Card>

        {/* Packages header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{m.gift_packages()}</h2>
          <Button
            render={
              <Link to="/friend-gift/packages/create">
                <Plus className="size-4" />
                {m.gift_new_package()}
              </Link>
            }
            size="sm"
          />
        </div>

        <DataTable
          columns={columns}
          data={list.items}
          mobileLayout="cards"
          getRowId={(row) => row.id}
          {...list.tableProps}
        />
      </main>
    </>
  )
}
