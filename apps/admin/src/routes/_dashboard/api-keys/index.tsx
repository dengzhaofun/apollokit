import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react"

import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
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

import { PageHeaderActions } from "#/components/PageHeader"
export const Route = createFileRoute("/_dashboard/api-keys/")({
  component: ApiKeysPage,
})

function ApiKeysPage() {
  return (
    <>
      <PageHeaderActions>
        <KeyRound className="size-4" />
      </PageHeaderActions>

      <main className="flex-1 p-6">
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
      </main>
    </>
  )
}

// ---------------------------------------------------------------------------
// Admin Keys Tab
// ---------------------------------------------------------------------------

function AdminKeysTab() {
  const { data: keys, isPending, error } = useAdminKeys()
  const [showCreate, setShowCreate] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {m.apikeys_admin_keys_desc()}
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          {m.apikeys_create_admin_key()}
        </Button>
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
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
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

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.apikeys_delete_admin_key_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.apikeys_delete_admin_key_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revoke.mutate(apiKey.id as string)}
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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

  const handleCreate = async () => {
    const org = await authClient.organization.getFullOrganization()
    if (!org.data?.id) return
    const result = await create.mutateAsync({
      name,
      organizationId: org.data.id,
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

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {m.apikeys_client_credentials_desc()}
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          {m.apikeys_create_credential()}
        </Button>
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
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
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

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.apikeys_delete_credential_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.apikeys_delete_credential_desc()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate(credential.id)}
            >
              {m.common_delete()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
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
