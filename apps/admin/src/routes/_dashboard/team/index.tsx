import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { PageHeaderActions } from "#/components/PageHeader"
import { TeamConfigForm } from "#/components/team/TeamConfigForm"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { FormDialog } from "#/components/ui/form-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useCreateTeamConfig,
  useTeamConfig,
  useTeamConfigs,
  useUpdateTeamConfig,
} from "#/hooks/use-team"
import { ApiError } from "#/lib/api-client"
import {
  closedModal,
  modalSearchSchema,
  openCreateModal,
  openEditModal,
} from "#/lib/modal-search"

const FORM_ID = "team-config-form"

export const Route = createFileRoute("/_dashboard/team/")({
  component: TeamPage,
  validateSearch: modalSearchSchema,
})

function TeamPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const modal = search.modal
  const editingId = modal === "edit" ? search.id : undefined

  function closeModal() {
    void navigate({ search: (prev) => ({ ...prev, ...closedModal }) })
  }
  function openCreate() {
    void navigate({ search: (prev) => ({ ...prev, ...openCreateModal }) })
  }

  const { data: configs, isPending, error } = useTeamConfigs()

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            {m.team_new_config()}
          </Button>
        </div>
      </PageHeaderActions>

      <main className="flex-1 p-6">
        <div className="rounded-xl border bg-card shadow-sm">
          {isPending ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : error ? (
            <div className="flex h-40 items-center justify-center text-destructive">
              {m.common_failed_to_load({ resource: m.team_title(), error: error.message })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.common_name()}</TableHead>
                  <TableHead>{m.common_alias()}</TableHead>
                  <TableHead>{m.team_max_members()}</TableHead>
                  <TableHead>{m.team_auto_dissolve()}</TableHead>
                  <TableHead>{m.team_quick_match()}</TableHead>
                  <TableHead>{m.common_created()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs && configs.length > 0 ? (
                  configs.map((cfg) => (
                    <TableRow key={cfg.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/team"
                          search={(prev) => ({ ...prev, ...openEditModal(cfg.id) })}
                          className="hover:underline"
                        >
                          {cfg.name}
                        </Link>
                      </TableCell>
                      <TableCell>{cfg.alias ?? "-"}</TableCell>
                      <TableCell>{cfg.maxMembers}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            cfg.autoDissolveOnLeaderLeave
                              ? "default"
                              : "secondary"
                          }
                        >
                          {cfg.autoDissolveOnLeaderLeave ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            cfg.allowQuickMatch ? "default" : "secondary"
                          }
                        >
                          {cfg.allowQuickMatch ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(cfg.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {m.team_no_configs()}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>

      {modal === "create" ? (
        <CreateTeamConfigDialog onClose={closeModal} />
      ) : null}
      {modal === "edit" && editingId ? (
        <EditTeamConfigDialog id={editingId} onClose={closeModal} />
      ) : null}
    </>
  )
}

interface DialogShellProps {
  onClose: () => void
}

function CreateTeamConfigDialog({ onClose }: DialogShellProps) {
  const createMutation = useCreateTeamConfig()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !createMutation.isPending}
      title={m.team_new_config()}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!formState.canSubmit || createMutation.isPending}
          >
            {createMutation.isPending ? m.common_saving() : m.common_create()}
          </Button>
        </>
      }
    >
      <TeamConfigForm
        id={FORM_ID}
        hideSubmitButton
        onStateChange={setFormState}
        isPending={createMutation.isPending}
        onSubmit={async (values) => {
          try {
            await createMutation.mutateAsync(values)
            toast.success(m.team_config_created())
            onClose()
          } catch (err) {
            toast.error(
              err instanceof ApiError ? err.body.error : "Failed to create team config",
            )
          }
        }}
      />
    </FormDialog>
  )
}

function EditTeamConfigDialog({
  id,
  onClose,
}: DialogShellProps & { id: string }) {
  const { data: cfg, isPending: loading, error } = useTeamConfig(id)
  const updateMutation = useUpdateTeamConfig()
  const [formState, setFormState] = useState({
    canSubmit: false,
    isDirty: false,
    isSubmitting: false,
  })

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      isDirty={formState.isDirty && !updateMutation.isPending}
      title={m.common_edit()}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {m.common_cancel()}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={
              !cfg || !formState.canSubmit || updateMutation.isPending
            }
          >
            {updateMutation.isPending
              ? m.common_saving()
              : m.common_save_changes()}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error || !cfg ? (
        <div className="py-10 text-center text-sm text-destructive">
          {error?.message ?? "Team config not found"}
        </div>
      ) : (
        <TeamConfigForm
          id={FORM_ID}
          hideSubmitButton
          onStateChange={setFormState}
          defaultValues={{
            name: cfg.name,
            alias: cfg.alias,
            maxMembers: cfg.maxMembers,
            autoDissolveOnLeaderLeave: cfg.autoDissolveOnLeaderLeave,
            allowQuickMatch: cfg.allowQuickMatch,
          }}
          isPending={updateMutation.isPending}
          onSubmit={async (values) => {
            try {
              await updateMutation.mutateAsync({ id: cfg.id, input: values })
              toast.success("Team config updated")
              onClose()
            } catch (err) {
              toast.error(
                err instanceof ApiError ? err.body.error : "Failed to update",
              )
            }
          }}
        />
      )}
    </FormDialog>
  )
}
