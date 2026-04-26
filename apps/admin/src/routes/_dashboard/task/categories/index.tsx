import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { toast } from "sonner"
import { Plus, Pencil, Trash2 } from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { confirm } from "#/components/patterns"
import { PageHeaderActions } from "#/components/PageHeader"
import { Button } from "#/components/ui/button"
import { Badge } from "#/components/ui/badge"
import { Input } from "#/components/ui/input"
import { Label } from "#/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table"
import {
  useTaskCategories,
  useCreateTaskCategory,
  useUpdateTaskCategory,
  useDeleteTaskCategory,
} from "#/hooks/use-task"
import { ApiError } from "#/lib/api-client"
import { listSearchSchema } from "#/lib/list-search"
import type { TaskCategory } from "#/lib/types/task"

export const Route = createFileRoute("/_dashboard/task/categories/")({
  component: CategoriesPage,
  validateSearch: listSearchSchema.passthrough(),
})

function CategoriesPage() {
  const list = useTaskCategories(Route)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<TaskCategory | null>(null)

  return (
    <>
      <PageHeaderActions>
        <div className="ml-auto">
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null) }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                New Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
              </DialogHeader>
              <CategoryFormInline
                initial={editing}
                onDone={() => { setOpen(false); setEditing(null) }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </PageHeaderActions>

      <main className="flex-1 space-y-3 p-6">
        <div className="rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.common_name()}</TableHead>
                <TableHead>{m.common_alias()}</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>{m.common_status()}</TableHead>
                <TableHead>Sort</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {m.common_loading()}
                  </TableCell>
                </TableRow>
              ) : list.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No categories yet.
                  </TableCell>
                </TableRow>
              ) : (
                list.items.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onEdit={() => { setEditing(cat); setOpen(true) }}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {/* Minimal cursor pager — categories rarely span multiple pages,
            but support next/prev so > 50 categories don't get truncated. */}
        {(list.canPrev || list.canNext) && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={list.prevPage}
              disabled={!list.canPrev || list.isLoading}
            >
              {m.data_table_prev()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={list.nextPage}
              disabled={!list.canNext || list.isLoading}
            >
              {m.data_table_next()}
            </Button>
          </div>
        )}
      </main>
    </>
  )
}

function CategoryRow({
  category,
  onEdit,
}: {
  category: TaskCategory
  onEdit: () => void
}) {
  const deleteMutation = useDeleteTaskCategory()

  return (
    <TableRow>
      <TableCell className="font-medium">{category.name}</TableCell>
      <TableCell>
        {category.alias ? (
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{category.alias}</code>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{category.scope}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={category.isActive ? "default" : "outline"}>
          {category.isActive ? m.common_active() : m.common_inactive()}
        </Badge>
      </TableCell>
      <TableCell>{category.sortOrder}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive"
            disabled={deleteMutation.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "删除分类?",
                description: `分类 "${category.name}" 删除后,关联 task definition 会失去分类绑定。`,
                confirmLabel: "删除",
                danger: true,
              })
              if (!ok) return
              try {
                await deleteMutation.mutateAsync(category.id)
                toast.success("Category deleted")
              } catch (err) {
                if (err instanceof ApiError) toast.error(err.body.error)
              }
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

function CategoryFormInline({
  initial,
  onDone,
}: {
  initial: TaskCategory | null
  onDone: () => void
}) {
  const createMutation = useCreateTaskCategory()
  const updateMutation = useUpdateTaskCategory()

  const [name, setName] = useState(initial?.name ?? "")
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [scope, setScope] = useState(initial?.scope ?? "task")
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0)

  const pending = createMutation.isPending || updateMutation.isPending

  const handleSubmit = async () => {
    try {
      if (initial) {
        await updateMutation.mutateAsync({
          id: initial.id,
          input: {
            name,
            alias: alias || null,
            scope: scope as "task" | "achievement" | "custom",
            sortOrder,
          },
        })
        toast.success("Category updated")
      } else {
        await createMutation.mutateAsync({
          name,
          alias: alias || null,
          scope: scope as "task" | "achievement" | "custom",
          sortOrder,
        })
        toast.success("Category created")
      }
      onDone()
    } catch (err) {
      if (err instanceof ApiError) toast.error(err.body.error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{m.common_name()} *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daily Quests" />
      </div>
      <div className="space-y-2">
        <Label>{m.common_alias()}</Label>
        <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. daily" />
      </div>
      <div className="grid gap-4 grid-cols-2">
        <div className="space-y-2">
          <Label>Scope</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="achievement">Achievement</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{m.common_sort_order()}</Label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={pending || !name}>
        {pending ? m.common_saving() : initial ? m.common_save() : m.common_create()}
      </Button>
    </div>
  )
}
