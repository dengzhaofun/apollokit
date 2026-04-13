import { useState } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { format } from "date-fns"
import { Pencil, ArrowLeft, Plus } from "lucide-react"
import { toast } from "sonner"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { ExchangeConfigForm } from "#/components/exchange/ConfigForm"
import { ExchangeDeleteDialog } from "#/components/exchange/DeleteDialog"
import { OptionTable } from "#/components/exchange/OptionTable"
import {
  useExchangeConfig,
  useUpdateExchangeConfig,
  useDeleteExchangeConfig,
  useExchangeOptions,
} from "#/hooks/use-exchange"
import { ApiError } from "#/lib/api-client"

export const Route = createFileRoute("/_dashboard/exchange/$configId/")({
  component: ExchangeConfigDetailPage,
})

function ExchangeConfigDetailPage() {
  const { configId } = Route.useParams()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  const { data: config, isPending, error } = useExchangeConfig(configId)
  const { data: options, isPending: optionsPending } =
    useExchangeOptions(configId)
  const updateMutation = useUpdateExchangeConfig()
  const deleteMutation = useDeleteExchangeConfig()

  if (isPending) {
    return (
      <>
        <Header title="Loading..." />
        <main className="flex h-40 items-center justify-center text-muted-foreground">
          Loading...
        </main>
      </>
    )
  }

  if (error || !config) {
    return (
      <>
        <Header title="Error" />
        <main className="flex h-40 items-center justify-center text-destructive">
          {error?.message ?? "Config not found"}
        </main>
      </>
    )
  }

  return (
    <>
      <Header title={config.name} />

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/exchange">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(!editing)}
              >
                <Pencil className="size-4" />
                {editing ? "Cancel" : "Edit"}
              </Button>
              <ExchangeDeleteDialog
                name={config.name}
                description="This will permanently delete this exchange config and all its options. This action cannot be undone."
                isPending={deleteMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deleteMutation.mutateAsync(config.id)
                    toast.success("Config deleted")
                    navigate({ to: "/exchange" })
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to delete config",
                    )
                  }
                }}
              />
            </div>
          </div>

          {editing ? (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <ExchangeConfigForm
                defaultValues={{
                  name: config.name,
                  alias: config.alias,
                  description: config.description,
                  isActive: config.isActive,
                }}
                submitLabel="Save Changes"
                isPending={updateMutation.isPending}
                onSubmit={async (values) => {
                  try {
                    await updateMutation.mutateAsync({
                      id: config.id,
                      ...values,
                    })
                    toast.success("Config updated")
                    setEditing(false)
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.body.error
                        : "Failed to update config",
                    )
                  }
                }}
              />
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailItem label="Name" value={config.name} />
                <DetailItem
                  label="Alias"
                  value={
                    config.alias ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {config.alias}
                      </code>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailItem
                  label="Status"
                  value={
                    <Badge variant={config.isActive ? "default" : "outline"}>
                      {config.isActive ? "Active" : "Inactive"}
                    </Badge>
                  }
                />
                <DetailItem
                  label="Created"
                  value={format(new Date(config.createdAt), "yyyy-MM-dd HH:mm")}
                />
                <DetailItem
                  label="Updated"
                  value={format(new Date(config.updatedAt), "yyyy-MM-dd HH:mm")}
                />
                {config.description && (
                  <div className="sm:col-span-2">
                    <DetailItem label="Description" value={config.description} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Exchange Options</h3>
              <Button asChild size="sm">
                <Link
                  to="/exchange/$configId/options/create"
                  params={{ configId }}
                >
                  <Plus className="size-4" />
                  New Option
                </Link>
              </Button>
            </div>
            {optionsPending ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <div className="rounded-xl border bg-card shadow-sm">
                <OptionTable data={options ?? []} />
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}

function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <h1 className="text-sm font-semibold">{title}</h1>
    </header>
  )
}

function DetailItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{value}</div>
    </div>
  )
}
