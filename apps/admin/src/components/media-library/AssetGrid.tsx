import { Copy, Trash2 } from "lucide-react"

import { Button } from "#/components/ui/button"
import { useDeleteMediaAsset, useMediaAssets } from "#/hooks/use-media-library"
import { resolveAssetUrl } from "#/lib/api-client"
import type { MediaAsset } from "#/lib/types/media-library"
import * as m from "#/paraglide/messages.js"

interface AssetGridProps {
  folderId: string | null
  /** When set, clicking an asset calls this instead of deleting. */
  onSelect?: (asset: MediaAsset) => void
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function AssetGrid({ folderId, onSelect }: AssetGridProps) {
  const { data, isPending, error } = useMediaAssets(folderId)
  const del = useDeleteMediaAsset()

  if (isPending) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.media_assets_loading()}
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        {m.media_assets_failed({ error: error.message })}
      </div>
    )
  }
  if (!data || data.items.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        {m.media_assets_empty()}
      </div>
    )
  }

  async function handleDelete(id: string, filename: string) {
    if (!confirm(m.media_asset_delete_confirm({ name: filename }))) return
    try {
      await del.mutateAsync(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : m.media_asset_delete())
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(resolveAssetUrl(url))
    } catch {
      // noop — some contexts block clipboard; user can copy manually.
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {data.items.map((asset) => {
        const clickable = onSelect !== undefined
        return (
          <div
            key={asset.id}
            className={`group relative flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition hover:shadow ${
              clickable ? "cursor-pointer" : ""
            }`}
            onClick={clickable ? () => onSelect?.(asset) : undefined}
          >
            <div className="aspect-square w-full overflow-hidden bg-muted">
              <img
                src={resolveAssetUrl(asset.url)}
                alt={asset.filename}
                className="size-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="p-2">
              <div className="truncate text-xs font-medium" title={asset.filename}>
                {asset.filename}
              </div>
              <div className="text-xs text-muted-foreground">
                {humanSize(asset.size)}
              </div>
            </div>
            {!clickable ? (
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    copyUrl(asset.url)
                  }}
                  title={m.media_asset_copy_link()}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="size-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(asset.id, asset.filename)
                  }}
                  title={m.media_asset_delete()}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
