import { format } from "date-fns"
import { Pencil } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "#/components/ui/badge"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet"
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
  useDeleteShopTag,
  useUpdateShopTag,
} from "#/hooks/use-shop"
import { ApiError } from "#/lib/api-client"
import type {
  CreateShopTagInput,
  ShopTag,
  UpdateShopTagInput,
} from "#/lib/types/shop"
import * as m from "#/paraglide/messages.js"
import { ShopDeleteDialog } from "./DeleteDialog"
import { TagBadge } from "./TagBadge"

interface TagListProps {
  tags: ShopTag[]
}

export function TagList({ tags }: TagListProps) {
  const [editing, setEditing] = useState<ShopTag | null>(null)
  const updateMutation = useUpdateShopTag()
  const deleteMutation = useDeleteShopTag()

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.common_name()}</TableHead>
            <TableHead>{m.common_alias()}</TableHead>
            <TableHead>{m.shop_color()}</TableHead>
            <TableHead>{m.common_status()}</TableHead>
            <TableHead>{m.common_created()}</TableHead>
            <TableHead className="w-32 text-right">
              {m.common_actions()}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tags.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                {m.shop_no_tags()}
              </TableCell>
            </TableRow>
          ) : (
            tags.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell className="font-medium">
                  <TagBadge tag={tag} />
                </TableCell>
                <TableCell>
                  {tag.alias ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {tag.alias}
                    </code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {tag.color ? (
                    <code className="text-xs">{tag.color}</code>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={tag.isActive ? "default" : "outline"}>
                    {tag.isActive ? m.common_active() : m.common_inactive()}
                  </Badge>
                </TableCell>
                <TableCell>
                  {format(new Date(tag.createdAt), "yyyy-MM-dd")}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setEditing(tag)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <ShopDeleteDialog
                    title={m.shop_delete_tag_title()}
                    description={m.shop_delete_tag_desc()}
                    isPending={deleteMutation.isPending}
                    onConfirm={async () => {
                      try {
                        await deleteMutation.mutateAsync(tag.id)
                        toast.success(m.shop_tag_deleted())
                      } catch (err) {
                        toast.error(
                          err instanceof ApiError
                            ? err.body.error
                            : m.shop_failed_delete_tag(),
                        )
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Sheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{m.shop_edit_tag()}</SheetTitle>
            <SheetDescription>{editing?.name}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <TagEditForm
              tag={editing}
              isPending={updateMutation.isPending}
              onSubmit={async (input) => {
                try {
                  await updateMutation.mutateAsync({
                    id: editing.id,
                    ...input,
                  })
                  toast.success(m.shop_tag_updated())
                  setEditing(null)
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.body.error
                      : m.shop_failed_update_tag(),
                  )
                }
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

interface TagEditFormProps {
  tag: ShopTag
  onSubmit: (input: UpdateShopTagInput) => void | Promise<void>
  isPending?: boolean
}

function TagEditForm({ tag, onSubmit, isPending }: TagEditFormProps) {
  const [name, setName] = useState(tag.name)
  const [alias, setAlias] = useState(tag.alias ?? "")
  const [color, setColor] = useState(tag.color ?? "#64748b")
  const [isActive, setIsActive] = useState(tag.isActive)

  return (
    <form
      className="space-y-4 px-4 py-2"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          name,
          alias: alias || null,
          color: color || null,
          isActive,
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="tag-name">{m.common_name()} *</Label>
        <Input
          id="tag-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tag-alias">{m.common_alias()}</Label>
        <Input
          id="tag-alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tag-color">{m.shop_color()}</Label>
        <div className="flex items-center gap-2">
          <Input
            id="tag-color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder={m.shop_tag_color_placeholder()}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="size-9 rounded border"
          />
        </div>
        <p className="text-xs text-muted-foreground">{m.shop_color_hint()}</p>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id="tag-active"
          checked={isActive}
          onCheckedChange={(c) => setIsActive(c === true)}
        />
        <Label htmlFor="tag-active">{m.common_active()}</Label>
      </div>
      <SheetFooter className="px-0">
        <Button type="submit" disabled={isPending}>
          {isPending ? m.common_saving() : m.common_save_changes()}
        </Button>
      </SheetFooter>
    </form>
  )
}

interface CreateTagInlineFormProps {
  isPending?: boolean
  onSubmit: (input: CreateShopTagInput) => void | Promise<void>
}

export function CreateTagInlineForm({
  isPending,
  onSubmit,
}: CreateTagInlineFormProps) {
  const [name, setName] = useState("")
  const [alias, setAlias] = useState("")
  const [color, setColor] = useState("#64748b")

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onSubmit({
          name: name.trim(),
          alias: alias || null,
          color,
        })
        setName("")
        setAlias("")
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="new-tag-name">{m.common_name()}</Label>
        <Input
          id="new-tag-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="new-tag-alias">{m.common_alias()}</Label>
        <Input
          id="new-tag-alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="new-tag-color">{m.shop_color()}</Label>
        <input
          id="new-tag-color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="block size-9 rounded border"
        />
      </div>
      <Button type="submit" disabled={isPending || !name.trim()}>
        {m.shop_new_tag()}
      </Button>
    </form>
  )
}
