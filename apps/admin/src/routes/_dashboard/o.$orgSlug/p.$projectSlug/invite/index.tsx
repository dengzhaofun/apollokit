import { createFileRoute } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#/components/ui/alert-dialog"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { Switch } from "#/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useDeleteInviteRelationship,
  useInviteRelationships,
  useInviteSettings,
  useUpsertInviteSettings,
} from "#/hooks/use-invite"
import type { UpsertInviteSettingsInput } from "#/lib/types/invite"

export const Route = createFileRoute("/_dashboard/o/$orgSlug/p/$projectSlug/invite/")({
  component: InvitePage,
})

const CODE_LENGTH_OPTIONS = [4, 8, 12, 16, 20, 24] as const

function InvitePage() {
  const { data: settings, isPending: settingsLoading } = useInviteSettings()

  // Filter state
  const [inviterFilter, setInviterFilter] = useState("")
  const [qualifiedOnly, setQualifiedOnly] = useState(false)

  // Pagination
  const PAGE_SIZE = 20
  const [offset, setOffset] = useState(0)

  const {
    data: relData,
    isPending: relLoading,
    error: relError,
  } = useInviteRelationships({
    limit: PAGE_SIZE,
    offset,
    inviterEndUserId: inviterFilter || undefined,
    qualifiedOnly: qualifiedOnly || undefined,
  })

  const deleteMutation = useDeleteInviteRelationship()

  // Edit settings dialog state
  const [editOpen, setEditOpen] = useState(false)
  const [editEnabled, setEditEnabled] = useState(false)
  const [editCodeLength, setEditCodeLength] = useState<number>(8)
  const [editAllowSelf, setEditAllowSelf] = useState(false)

  const upsertMutation = useUpsertInviteSettings()

  function openEdit() {
    setEditEnabled(settings?.enabled ?? true)
    setEditCodeLength(settings?.codeLength ?? 8)
    setEditAllowSelf(settings?.allowSelfInvite ?? false)
    setEditOpen(true)
  }

  function handleSave() {
    const input: UpsertInviteSettingsInput = {
      enabled: editEnabled,
      codeLength: editCodeLength,
      allowSelfInvite: editAllowSelf,
    }
    upsertMutation.mutate(input, {
      onSuccess: () => {
        toast.success(m.invite_settings_updated())
        setEditOpen(false)
      },
      onError: (err) => {
        toast.error(err.message)
      },
    })
  }

  const relationships = relData?.items ?? []
  const total = relData?.total ?? 0

  return (
    <>
      <main className="flex-1 space-y-6 p-6">
        {/* Settings card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>{m.invite_settings()}</CardTitle>
            <Button variant="outline" size="sm" onClick={openEdit}>
              {m.invite_settings_edit()}
            </Button>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <p className="text-muted-foreground">{m.common_loading()}</p>
            ) : settings ? (
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    {m.invite_settings_enabled()}
                  </span>
                  <p className="font-medium">
                    {settings.enabled ? m.common_active() : m.common_inactive()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {m.invite_settings_code_length()}
                  </span>
                  <p className="font-medium">{settings.codeLength}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {m.invite_settings_allow_self_invite()}
                  </span>
                  <p className="font-medium">
                    {settings.allowSelfInvite ? m.common_yes() : m.common_no()}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">{m.invite_no_settings()}</p>
            )}
          </CardContent>
        </Card>

        {/* Edit settings dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{m.invite_settings_edit()}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {/* Enabled */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label>{m.invite_settings_enabled()}</Label>
                  <p className="text-muted-foreground text-xs">
                    {m.invite_settings_enabled_desc()}
                  </p>
                </div>
                <Switch
                  checked={editEnabled}
                  onCheckedChange={setEditEnabled}
                />
              </div>

              {/* Code length */}
              <div className="space-y-1">
                <Label>{m.invite_settings_code_length()}</Label>
                <p className="text-muted-foreground text-xs">
                  {m.invite_settings_code_length_desc()}
                </p>
                <Select
                  value={String(editCodeLength)}
                  onValueChange={(v) => setEditCodeLength(Number(v))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CODE_LENGTH_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Allow self-invite */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label>{m.invite_settings_allow_self_invite()}</Label>
                  <p className="text-muted-foreground text-xs">
                    {m.invite_settings_allow_self_invite_desc()}
                  </p>
                </div>
                <Switch
                  checked={editAllowSelf}
                  onCheckedChange={setEditAllowSelf}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={upsertMutation.isPending}
              >
                {m.invite_cancel()}
              </Button>
              <Button onClick={handleSave} disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? m.common_saving() : m.invite_save()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Relationships section */}
        <div className="space-y-3">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-4">
            <Input
              className="w-72"
              placeholder={m.invite_filter_inviter_placeholder()}
              value={inviterFilter}
              onChange={(e) => {
                setInviterFilter(e.target.value)
                setOffset(0)
              }}
            />
            <div className="flex items-center gap-2">
              <Switch
                id="qualified-only"
                checked={qualifiedOnly}
                onCheckedChange={(v) => {
                  setQualifiedOnly(v)
                  setOffset(0)
                }}
              />
              <Label htmlFor="qualified-only">
                {m.invite_filter_qualified_only()}
              </Label>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border bg-card shadow-sm">
            {relLoading ? (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                {m.common_loading()}
              </div>
            ) : relError ? (
              <div className="flex h-40 items-center justify-center text-destructive">
                {m.common_failed_to_load({
                  resource: m.invite_relationships(),
                  error: relError.message,
                })}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{m.invite_col_inviter()}</TableHead>
                    <TableHead>{m.invite_col_invitee()}</TableHead>
                    <TableHead>{m.invite_col_bound_at()}</TableHead>
                    <TableHead>{m.invite_col_qualified_at()}</TableHead>
                    <TableHead>{m.invite_col_qualified_reason()}</TableHead>
                    <TableHead>{m.invite_col_code_snapshot()}</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relationships.length > 0 ? (
                    relationships.map((rel) => (
                      <TableRow key={rel.id}>
                        <TableCell>
                          <Badge variant="secondary">
                            {rel.inviterEndUserId}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {rel.inviteeEndUserId}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(rel.boundAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {rel.qualifiedAt
                            ? new Date(rel.qualifiedAt).toLocaleDateString()
                            : m.common_dash()}
                        </TableCell>
                        <TableCell>
                          {rel.qualifiedReason ?? (
                            <span className="text-muted-foreground">
                              {m.common_dash()}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground font-mono text-xs">
                            {rel.inviterCodeSnapshot}
                          </span>
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="size-4 text-destructive" />
                                </Button>
                              }
                            />
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {m.invite_delete_title()}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {m.invite_delete_desc()}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  {m.invite_cancel()}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => {
                                    deleteMutation.mutate(rel.id, {
                                      onSuccess: () =>
                                        toast.success(
                                          m.invite_relationship_deleted(),
                                        ),
                                      onError: (err) =>
                                        toast.error(err.message),
                                    })
                                  }}
                                >
                                  {m.invite_delete_confirm()}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {m.invite_no_relationships()}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                &larr;
              </Button>
              <span className="text-muted-foreground text-sm">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                &rarr;
              </Button>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
