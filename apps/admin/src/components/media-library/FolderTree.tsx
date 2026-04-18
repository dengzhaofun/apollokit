import {
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  Star,
  Trash2,
} from "lucide-react"
import { useState } from "react"

import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import {
  useCreateMediaFolder,
  useDeleteMediaFolder,
  useMediaFolders,
} from "#/hooks/use-media-library"
import type { MediaFolder } from "#/lib/types/media-library"
import * as m from "#/paraglide/messages.js"

/**
 * Recursive folder tree. Selects a folder id on click; selected folder
 * drives the asset grid on the right. Clicking the chevron expands
 * without selecting. New-folder creation is handled via a simple inline
 * input at the root level plus a "+" button on hover for each row.
 *
 * Per-node child loading is done via a dedicated `FolderNode` component
 * so React-Query caches per parentId and new siblings show up on
 * invalidate without re-fetching the whole tree.
 */

interface FolderTreeProps {
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
}

export function FolderTree({ selectedFolderId, onSelect }: FolderTreeProps) {
  const { data, isPending, error } = useMediaFolders(null)
  const [isCreating, setIsCreating] = useState(false)

  if (isPending) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        {m.media_folders_loading()}
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-3 text-sm text-destructive">
        {m.media_folders_failed({ error: error.message })}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
          selectedFolderId === null ? "bg-muted font-medium" : ""
        }`}
      >
        <FolderOpen className="size-4 shrink-0" />
        <span>{m.media_folder_root()}</span>
      </button>
      {data?.items.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          depth={1}
          selectedFolderId={selectedFolderId}
          onSelect={onSelect}
        />
      ))}

      <div className="mt-2 border-t pt-2">
        {isCreating ? (
          <InlineCreateForm
            parentId={null}
            onClose={() => setIsCreating(false)}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="size-4" />
            {m.media_folder_new_root()}
          </Button>
        )}
      </div>
    </div>
  )
}

interface FolderNodeProps {
  folder: MediaFolder
  depth: number
  selectedFolderId: string | null
  onSelect: (folderId: string | null) => void
}

function FolderNode({
  folder,
  depth,
  selectedFolderId,
  onSelect,
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const { data } = useMediaFolders(expanded ? folder.id : null)
  const deleteFolder = useDeleteMediaFolder()

  const selected = selectedFolderId === folder.id

  async function handleDelete() {
    if (!confirm(m.media_folder_delete_confirm({ name: folder.name }))) return
    try {
      await deleteFolder.mutateAsync(folder.id)
      if (selected) onSelect(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : m.media_folder_delete_failed())
    }
  }

  return (
    <div className="flex flex-col">
      <div
        className={`group flex items-center gap-1 rounded px-1 py-1 hover:bg-muted ${
          selected ? "bg-muted font-medium" : ""
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-0.5 hover:bg-background"
          aria-label={expanded ? m.media_folder_collapse() : m.media_folder_expand()}
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className="flex flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-sm"
        >
          <Folder className="size-4 shrink-0" />
          <span className="truncate">
            {folder.isDefault ? m.media_folder_default_name() : folder.name}
          </span>
          {folder.isDefault ? (
            <Star className="size-3 shrink-0 text-amber-500" />
          ) : null}
        </button>
        <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={() => {
              setExpanded(true)
              setIsCreating(true)
            }}
            className="rounded p-1 hover:bg-background"
            aria-label={m.media_folder_new_sub()}
          >
            <Plus className="size-3.5" />
          </button>
          {!folder.isDefault ? (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
              aria-label={m.media_folder_delete()}
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="flex flex-col">
          {data?.items.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
            />
          ))}
          {isCreating ? (
            <div style={{ paddingLeft: 4 + (depth + 1) * 12 }}>
              <InlineCreateForm
                parentId={folder.id}
                onClose={() => setIsCreating(false)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface InlineCreateFormProps {
  parentId: string | null
  onClose: () => void
}

function InlineCreateForm({ parentId, onClose }: InlineCreateFormProps) {
  const [name, setName] = useState("")
  const create = useCreateMediaFolder()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await create.mutateAsync({ name: trimmed, parentId })
      onClose()
    } catch (err) {
      alert(err instanceof Error ? err.message : m.media_folder_create_failed())
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1 py-1">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={m.media_folder_placeholder()}
        className="h-7 text-sm"
      />
      <Button
        type="submit"
        size="sm"
        disabled={!name.trim() || create.isPending}
      >
        {m.media_folder_create()}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>
        {m.media_folder_cancel()}
      </Button>
    </form>
  )
}
