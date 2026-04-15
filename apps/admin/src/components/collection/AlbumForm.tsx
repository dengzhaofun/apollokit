import { useState } from "react"

import { Button } from "#/components/ui/button"
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
import { Textarea } from "#/components/ui/textarea"
import type {
  AlbumScope,
  CollectionAlbum,
  CreateAlbumInput,
} from "#/lib/types/collection"

interface AlbumFormProps {
  initial?: CollectionAlbum
  onSubmit: (values: CreateAlbumInput) => void | Promise<void>
  submitLabel: string
  isPending?: boolean
}

export function AlbumForm({
  initial,
  onSubmit,
  submitLabel,
  isPending,
}: AlbumFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [alias, setAlias] = useState(initial?.alias ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [coverImage, setCoverImage] = useState(initial?.coverImage ?? "")
  const [icon, setIcon] = useState(initial?.icon ?? "")
  const [scope, setScope] = useState<AlbumScope>(
    (initial?.scope as AlbumScope) ?? "custom",
  )
  const [sortOrder, setSortOrder] = useState<number>(initial?.sortOrder ?? 0)
  const [isActive, setIsActive] = useState(initial?.isActive ?? true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onSubmit({
      name,
      alias: alias || null,
      description: description || null,
      coverImage: coverImage || null,
      icon: icon || null,
      scope,
      sortOrder,
      isActive,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="name">名称</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="alias">别名 (可选)</Label>
          <Input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="例如 dragons"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            小写字母/数字/- _，同组织内唯一
          </p>
        </div>
      </div>
      <div>
        <Label htmlFor="description">描述</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="coverImage">封面图 URL</Label>
          <Input
            id="coverImage"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="icon">图标 URL</Label>
          <Input
            id="icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="scope">分类</Label>
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as AlbumScope)}
          >
            <SelectTrigger id="scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hero">英雄</SelectItem>
              <SelectItem value="monster">怪物</SelectItem>
              <SelectItem value="equipment">装备</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="sortOrder">排序</Label>
          <Input
            id="sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Switch
            id="isActive"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="isActive">启用</Label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "保存中..." : submitLabel}
        </Button>
      </div>
    </form>
  )
}
