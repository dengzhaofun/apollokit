import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react"

import { SidebarTrigger } from "#/components/ui/sidebar"
import { Separator } from "#/components/ui/separator"
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

export const Route = createFileRoute("/_dashboard/api-keys/")({
  component: ApiKeysPage,
})

function ApiKeysPage() {
  return (
    <>
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mx-2 h-4" />
        <KeyRound className="size-4" />
        <h1 className="text-sm font-semibold">API Keys</h1>
      </header>

      <main className="flex-1 p-6">
        <Tabs defaultValue="admin">
          <TabsList>
            <TabsTrigger value="admin">Admin Keys</TabsTrigger>
            <TabsTrigger value="client">Client Credentials</TabsTrigger>
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
          Server-to-server API keys for admin access. Keep these secret.
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          Create Admin Key
        </Button>
      </div>

      {isPending ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          Loading...
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-destructive">
          Failed to load keys: {String(error)}
        </div>
      ) : !keys?.length ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          No admin keys yet.
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-24">Actions</TableHead>
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
        title="Admin Key Created"
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
            <AlertDialogTitle>Delete Admin Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the key. Any services using it will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revoke.mutate(apiKey.id as string)}
            >
              Delete
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
          <DialogTitle>Create Admin Key</DialogTitle>
          <DialogDescription>
            Create a server-to-server API key for admin access.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="admin-key-name">Name</Label>
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
          Client credentials for C-end access with HMAC identity verification.
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" />
          Create Credential
        </Button>
      </div>

      {isPending ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          Loading...
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center text-destructive">
          Failed to load credentials: {error.message}
        </div>
      ) : !credentials?.length ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          No client credentials yet.
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Publishable Key</TableHead>
                <TableHead>Dev Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-32">Actions</TableHead>
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
              <DialogTitle>Client Credential Created</DialogTitle>
              <DialogDescription>
                Copy both keys now. The secret will not be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-4">
              <CopyField label="Publishable Key" value={created.publishableKey} />
              <CopyField label="Secret Key" value={created.secret} />
            </div>
            <DialogFooter>
              <Button onClick={() => setCreated(null)}>Done</Button>
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
            <Badge variant="default">Active</Badge>
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
                title="Revoke"
                onClick={() => revoke.mutate(credential.id)}
              >
                Revoke
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              title="Delete"
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
            <AlertDialogTitle>Delete Credential?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the credential. Any clients using it will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate(credential.id)}
            >
              Delete
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
          <DialogTitle>Create Client Credential</DialogTitle>
          <DialogDescription>
            Create a publishable key + secret pair for C-end API access.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="cred-name">Name</Label>
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
            Copy this key now. It will not be shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <CopyField label={label} value={value} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
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
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
    </div>
  )
}
