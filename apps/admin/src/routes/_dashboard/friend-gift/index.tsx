import { createFileRoute, Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
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
  useFriendGiftPackages,
  useFriendGiftSettings,
} from "#/hooks/use-friend-gift"

export const Route = createFileRoute("/_dashboard/friend-gift/")({
  component: FriendGiftPage,
})

function FriendGiftPage() {
  const { data: settings, isPending: settingsLoading } =
    useFriendGiftSettings()
  const {
    data: packages,
    isPending: pkgLoading,
    error: pkgError,
  } = useFriendGiftPackages()

  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <h1 className="text-sm font-semibold">{m.gift_title()}</h1>
      </header>

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
              <p className="text-muted-foreground">
                {m.gift_no_settings()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Packages header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{m.gift_packages()}</h2>
          <Button size="sm" asChild>
            <Link to="/friend-gift/packages/create">
              <Plus className="size-4" />
              {m.gift_new_package()}
            </Link>
          </Button>
        </div>

        {/* Packages table */}
        <div className="rounded-xl border bg-card shadow-sm">
          {pkgLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : pkgError ? (
            <div className="flex h-40 items-center justify-center text-destructive">
              {m.common_failed_to_load({ resource: m.gift_packages(), error: pkgError.message })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.common_name()}</TableHead>
                  <TableHead>{m.common_alias()}</TableHead>
                  <TableHead>{m.gift_items_count()}</TableHead>
                  <TableHead>{m.common_status()}</TableHead>
                  <TableHead>{m.common_sort_order()}</TableHead>
                  <TableHead>{m.common_created()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages && packages.length > 0 ? (
                  packages.map((pkg) => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/friend-gift/packages/$packageId"
                          params={{ packageId: pkg.id }}
                          className="hover:underline"
                        >
                          {pkg.name}
                        </Link>
                      </TableCell>
                      <TableCell>{pkg.alias ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {pkg.giftItems.length} item
                          {pkg.giftItems.length !== 1 ? "s" : ""}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={pkg.isActive ? "default" : "destructive"}
                        >
                          {pkg.isActive ? m.common_active() : m.common_inactive()}
                        </Badge>
                      </TableCell>
                      <TableCell>{pkg.sortOrder}</TableCell>
                      <TableCell>
                        {new Date(pkg.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {m.gift_no_packages()}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </>
  )
}
