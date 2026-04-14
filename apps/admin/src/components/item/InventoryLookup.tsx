import { useState } from "react"
import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import { Badge } from "#/components/ui/badge"
import { useUserInventory } from "#/hooks/use-item"
import { Search } from "lucide-react"

export function InventoryLookup() {
  const [endUserId, setEndUserId] = useState("")
  const [searchUserId, setSearchUserId] = useState("")

  const { data: inventory, isPending, error } = useUserInventory(searchUserId)

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor="endUserId">{m.item_end_user_id()}</Label>
          <Input
            id="endUserId"
            value={endUserId}
            onChange={(e) => setEndUserId(e.target.value)}
            placeholder="e.g. user-42"
            onKeyDown={(e) => {
              if (e.key === "Enter" && endUserId.trim()) {
                setSearchUserId(endUserId.trim())
              }
            }}
          />
        </div>
        <Button
          onClick={() => setSearchUserId(endUserId.trim())}
          disabled={!endUserId.trim()}
        >
          <Search className="size-4" />
          {m.item_look_up()}
        </Button>
      </div>

      {searchUserId && (
        <>
          {isPending ? (
            <div className="flex h-24 items-center justify-center text-muted-foreground">
              {m.common_loading()}
            </div>
          ) : error ? (
            <div className="flex h-24 items-center justify-center text-destructive">
              {error.message}
            </div>
          ) : (
            <div className="rounded-xl border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>{m.common_alias()}</TableHead>
                    <TableHead>{m.common_type()}</TableHead>
                    <TableHead>{m.item_quantity()}</TableHead>
                    <TableHead>{m.item_stacks()}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory && inventory.length > 0 ? (
                    inventory.map((item) => (
                      <TableRow key={item.definitionId}>
                        <TableCell className="font-medium">
                          {item.definitionName}
                        </TableCell>
                        <TableCell>
                          {item.definitionAlias ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {item.definitionAlias}
                            </code>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {item.stackable ? m.item_stackable() : m.item_non_stackable()}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.totalQuantity}</TableCell>
                        <TableCell>{item.stacks.length}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        {m.item_no_inventory()}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
