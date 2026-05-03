import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Copy, Plus, Trash2 } from "lucide-react"

import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { Can } from "#/components/auth/Can"
import { RouteGuard } from "#/components/auth/RouteGuard"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { useIsMobile } from "#/hooks/use-mobile"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "#/components/ui/alert-dialog"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import { Switch } from "#/components/ui/switch"
import { useAdminKeys, useCreateAdminKey, useRevokeAdminKey } from "#/hooks/use-api-keys"
import {
  useClientCredentials,
  useCreateClientCredential,
  useRevokeClientCredential,

  useDeleteClientCredential,
  useUpdateDevMode,
} from "#/hooks/use-client-credentials"
import { authClient } from "#/lib/auth-client"
import * as m from "#/paraglide/messages.js"

export const Route = createFileRoute("/_dashboard/settings/api-keys")({
  component: ApiKeysPage,
})

function ApiKeysPage() {
  // API keys are admin+ only. Use the unauthorized page (rather than
  // silent dashboard redirect) so an operator who pasted the URL
  // gets explicit feedback they can ask an admin about.
  return (
    <RouteGuard resource="apiKey" action="read" visibility="unauthorized-page">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <header>
          <h1 className="text-xl font-semibold">{m.apikeys_title()}</h1>
        </header>
        <Tabs defaultValue="admin">
          <TabsList>
            <TabsTrigger value="admin">{m.apikeys_admin_keys()}</TabsTrigger>
            <TabsTrigger value="client">{m.apikeys_client_credentials()}</TabsTrigger>
          </TabsList>

          <TabsContent value="admin" className="mt-4">
            <AdminKeysTab />
          </TabsContent>

          <TabsContent value="client" className="mt-4">
            <ClientCredentialsTab />
          </TabsContent>
        </Tabs>
      </div>
    </RouteGuard>
  )
}

// ---------------------------------------------------------------------------
// Admin Keys Tab
// ---------------------------------------------------------------------------

function AdminKeysTab() {
  const { data: keys, isPending, error } = useAdminKeys()
  const [showCreate, setShowCreate] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const isMobile = useIsMobile()

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {m.apikeys_admin_keys_desc()}
        </p>
        <Can resource="apiKey" action="write" mode="disable">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            {m.apikeys_create_admin_key()}
          </Button>
        </Can>
      </div>

      {isPending ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-destructive">
          {m.apikeys_failed_to_load_keys()} {String(error)}
        </div>
      ) : !keys?.length ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          {m.apikeys_no_admin_keys()}
        </div>
      ) : isMobile ? (
        <div className="divide-y rounded-xl border bg-card shadow-sm">
          {keys.map((k: Record<string, unknown>) => (
            <AdminKeyCard key={k.id as string} apiKey={k} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.common_name()}</TableHead>
                <TableHead>{m.common_created()}</TableHead>
                <TableHead>{m.apikeys_expires()}</TableHead>
                <TableHead className="w-24">{m.common_actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k: Record<string, unknown>) => (
                <AdminKeyRow key={k.id as string} apiKey={k} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateAdminKeyDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(key) => {
          setShowCreate(false)
          setCreatedKey(key)
        }}
      />

      <KeyRevealDialog
        title={m.apikeys_admin_key_created_title()}
        label="API Key"
        value={createdKey}
        onClose={() => setCreatedKey(null)}
      />
    </>
  )
}

function AdminKeyRow({ apiKey }: { apiKey: Record<string, unknown> }) {
  const revoke = useRevokeAdminKey()
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">
          {(apiKey.name as string) || "Unnamed"}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {new Date(apiKey.createdAt as string).toLocaleDateString()}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {apiKey.expiresAt
            ? new Date(apiKey.expiresAt as string).toLocaleDateString()
            : "Never"}
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </TableCell>
      </TableRow>

      <RevokeAdminKeyDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={() => revoke.mutate(apiKey.id as string)}
      />
    </>
  )
}

function AdminKeyCard({ apiKey }: { apiKey: Record<string, unknown> }) {
  const revoke = useRevokeAdminKey()
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="truncate text-sm font-medium">
            {(apiKey.name as string) || "Unnamed"}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt>{m.common_created()}</dt>
            <dd className="text-right">
              {new Date(apiKey.createdAt as string).toLocaleDateString()}
            </dd>
            <dt>{m.apikeys_expires()}</dt>
            <dd className="text-right">
              {apiKey.expiresAt
                ? new Date(apiKey.expiresAt as string).toLocaleDateString()
                : "Never"}
            </dd>
          </dl>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-destructive"
          onClick={() => setShowConfirm(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <RevokeAdminKeyDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={() => revoke.mutate(apiKey.id as string)}
      />
    </>
  )
}

function RevokeAdminKeyDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.apikeys_delete_admin_key_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.apikeys_delete_admin_key_desc()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {m.common_delete()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function CreateAdminKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (key: string) => void
}) {
  const [name, setName] = useState("")
  const create = useCreateAdminKey()
  const { data: session } = authClient.useSession()

  const handleCreate = async () => {
    const tenantId = session?.session.activeTeamId
    if (!tenantId) return
    const org = await authClient.organization.getFullOrganization()
    if (!org.data?.id) return
    const result = await create.mutateAsync({
      name,
      organizationId: org.data.id,
      // Project (Better Auth team) scope is the only way these keys
      // work — middleware rejects unscoped/legacy keys. Stamp the
      // active project id into metadata at creation time.
      tenantId,
    })
    setName("")
    if (result?.key) {
      onCreated(result.key)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.apikeys_create_admin_key()}</DialogTitle>
          <DialogDescription>
            Create a server-to-server API key for admin access.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="admin-key-name">{m.common_name()}</Label>
            <Input
              id="admin-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production Server"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Client Credentials Tab
// ---------------------------------------------------------------------------

function ClientCredentialsTab() {
  const { data: credentials, isPending, error } = useClientCredentials()
  const [showCreate, setShowCreate] = useState(false)
  const [created, setCreated] = useState<{
    publishableKey: string
    secret: string
  } | null>(null)
  const isMobile = useIsMobile()

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {m.apikeys_client_credentials_desc()}
        </p>
        <Can resource="apiKey" action="write" mode="disable">
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            {m.apikeys_create_credential()}
          </Button>
        </Can>
      </div>

      {isPending ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          {m.common_loading()}
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-destructive">
          {m.apikeys_failed_to_load_credentials()} {error.message}
        </div>
      ) : !credentials?.length ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          {m.apikeys_no_credentials()}
        </div>
      ) : isMobile ? (
        <div className="divide-y rounded-xl border bg-card shadow-sm">
          {credentials.map((cred) => (
            <ClientCredentialCard key={cred.id} credential={cred} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.common_name()}</TableHead>
                <TableHead>{m.apikeys_publishable_key()}</TableHead>
                <TableHead>{m.apikeys_dev_mode()}</TableHead>
                <TableHead>{m.common_status()}</TableHead>
                <TableHead>{m.common_created()}</TableHead>
                <TableHead className="w-32">{m.common_actions()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((cred) => (
                <ClientCredentialRow key={cred.id} credential={cred} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateClientCredentialDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(result) => {
          setShowCreate(false)
          setCreated(result)
        }}
      />

      {created && (
        <Dialog open onOpenChange={() => setCreated(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{m.apikeys_credential_created_title()}</DialogTitle>
              <DialogDescription>
                {m.apikeys_credential_created_desc()}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <CopyField label="Publishable Key" value={created.publishableKey} />
              <CopyField label="Secret Key" value={created.secret} />
            </div>
            <DialogFooter>
              <Button onClick={() => setCreated(null)}>{m.common_done()}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function ClientCredentialRow({
  credential,
}: {
  credential: {
    id: string
    name: string
    publishableKey: string
    devMode: boolean
    enabled: boolean
    createdAt: string
  }
}) {
  const revoke = useRevokeClientCredential()
  const remove = useDeleteClientCredential()
  const updateDevMode = useUpdateDevMode()
  const [showDelete, setShowDelete] = useState(false)

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{credential.name}</TableCell>
        <TableCell>
          <code className="text-xs">{credential.publishableKey.slice(0, 20)}...</code>
          <Button
            variant="ghost"
            size="sm"
            className="ml-1 h-6 w-6 p-0"
            onClick={() => navigator.clipboard.writeText(credential.publishableKey)}
          >
            <Copy className="size-3" />
          </Button>
        </TableCell>
        <TableCell>
          <Switch
            checked={credential.devMode}
            onCheckedChange={(checked) =>
              updateDevMode.mutate({ id: credential.id, devMode: checked })
            }
          />
        </TableCell>
        <TableCell>
          {credential.enabled ? (
            <Badge variant="default">{m.common_active()}</Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {new Date(credential.createdAt).toLocaleDateString()}
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            {credential.enabled && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                title={m.common_revoke()}
                onClick={() => revoke.mutate(credential.id)}
              >
                {m.common_revoke()}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              title={m.common_delete()}
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <DeleteCredentialDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        onConfirm={() => remove.mutate(credential.id)}
      />
    </>
  )
}

function ClientCredentialCard({
  credential,
}: {
  credential: {
    id: string
    name: string
    publishableKey: string
    devMode: boolean
    enabled: boolean
    createdAt: string
  }
}) {
  const revoke = useRevokeClientCredential()
  const remove = useDeleteClientCredential()
  const updateDevMode = useUpdateDevMode()
  const [showDelete, setShowDelete] = useState(false)

  return (
    <>
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {credential.name}
              </span>
              {credential.enabled ? (
                <Badge variant="default">{m.common_active()}</Badge>
              ) : (
                <Badge variant="secondary">Disabled</Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <code className="truncate text-xs">
                {credential.publishableKey.slice(0, 20)}...
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 shrink-0 p-0"
                onClick={() =>
                  navigator.clipboard.writeText(credential.publishableKey)
                }
              >
                <Copy className="size-3" />
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-destructive"
            title={m.common_delete()}
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">{m.apikeys_dev_mode()}</dt>
          <dd className="justify-self-end">
            <Switch
              checked={credential.devMode}
              onCheckedChange={(checked) =>
                updateDevMode.mutate({ id: credential.id, devMode: checked })
              }
            />
          </dd>
          <dt className="text-muted-foreground">{m.common_created()}</dt>
          <dd className="text-right">
            {new Date(credential.createdAt).toLocaleDateString()}
          </dd>
        </dl>
        {credential.enabled ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive"
            onClick={() => revoke.mutate(credential.id)}
          >
            {m.common_revoke()}
          </Button>
        ) : null}
      </div>

      <DeleteCredentialDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        onConfirm={() => remove.mutate(credential.id)}
      />
    </>
  )
}

function DeleteCredentialDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.apikeys_delete_credential_title()}</AlertDialogTitle>
          <AlertDialogDescription>
            {m.apikeys_delete_credential_desc()}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {m.common_delete()}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function CreateClientCredentialDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (result: { publishableKey: string; secret: string }) => void
}) {
  const [name, setName] = useState("")
  const create = useCreateClientCredential()

  const handleCreate = async () => {
    const result = await create.mutateAsync({ name })
    setName("")
    onCreated({ publishableKey: result.publishableKey, secret: result.secret })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.apikeys_create_credential()}</DialogTitle>
          <DialogDescription>
            Create a publishable key + secret pair for C-end API access.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="cred-name">{m.common_name()}</Label>
            <Input
              id="cred-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mobile App"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function KeyRevealDialog({
  title,
  label,
  value,
  onClose,
}: {
  title: string
  label: string
  value: string | null
  onClose: () => void
}) {
  if (!value) return null
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {m.apikeys_admin_key_created_desc()}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <CopyField label={label} value={value} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{m.common_done()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-xs break-all">
          {value}
        </code>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <Copy className="size-3" />
          {copied ? m.common_copied() : m.common_copy()}
        </Button>
      </div>
    </div>
  )
}
