import { createFileRoute } from "@tanstack/react-router"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"

import * as m from "#/paraglide/messages.js"
import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useDeleteFriendRelationship,
  useFriendRelationships,
  useFriendSettings,
} from "#/hooks/use-friend"

export const Route = createFileRoute("/_dashboard/friend/")({
  component: FriendPage,
})

function FriendPage() {
  const { data: settings, isPending: settingsLoading } = useFriendSettings()
  const {
    data: relationships,
    isPending: relLoading,
    error: relError,
  } = useFriendRelationships()
  const deleteMutation = useDeleteFriendRelationship()

  return (
    <>
      <main className="flex-1 space-y-6 p-6">
        {/* Settings card */}
        <Card>
          <CardHeader>
            <CardTitle>{m.friend_settings()}</CardTitle>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <p className="text-muted-foreground">{m.common_loading()}</p>
            ) : settings ? (
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">{m.friend_max_friends()}</span>
                  <p className="font-medium">{settings.maxFriends}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{m.friend_max_blocked()}</span>
                  <p className="font-medium">{settings.maxBlocked}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {m.friend_max_pending()}
                  </span>
                  <p className="font-medium">{settings.maxPendingRequests}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {m.friend_no_settings()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Relationships table */}
        <div className="rounded-xl border bg-card shadow-sm">
          {relLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : relError ? (
            <div className="flex h-40 items-center justify-center text-destructive">
              {m.common_failed_to_load({ resource: m.friend_relationships(), error: relError.message })}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User A</TableHead>
                  <TableHead>User B</TableHead>
                  <TableHead>Created At</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {relationships && relationships.length > 0 ? (
                  relationships.map((rel) => (
                    <TableRow key={rel.id}>
                      <TableCell>
                        <Badge variant="secondary">{rel.userA}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{rel.userB}</Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(rel.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            deleteMutation.mutate(rel.id, {
                              onSuccess: () => toast.success(m.friend_relationship_deleted()),
                            })
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {m.friend_no_relationships()}
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
