import { ImageIcon, Plus, X } from "lucide-react"
import { useState } from "react"

import { AssetGrid } from "#/components/media-library/AssetGrid"
import { FolderTree } from "#/components/media-library/FolderTree"
import { UploadButton } from "#/components/media-library/UploadButton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import { resolveAssetUrl } from "#/lib/api-client"
import type { MediaAsset } from "#/lib/types/media-library"
import * as m from "#/paraglide/messages.js"

interface ImageListFieldProps {
  value: string[]
  onChange: (urls: string[]) => void
  max?: number
  addLabel?: string
}

/**
 * Multi-image picker. Renders a grid of selected image thumbnails plus
 * an "add" button that opens the media library dialog. Each pick is
 * appended to the array; clicking the X on a thumbnail removes it.
 */
export function ImageListField({
  value,
  onChange,
  max,
  addLabel,
}: ImageListFieldProps) {
  const [open, setOpen] = useState(false)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [tab, setTab] = useState<"library" | "upload">("library")

  const reachedLimit = typeof max === "number" && value.length >= max

  function append(asset: MediaAsset) {
    const url = resolveAssetUrl(asset.url)
    if (value.includes(url)) {
      setOpen(false)
      return
    }
    onChange([...value, url])
    setOpen(false)
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {value.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="group relative size-20 shrink-0 overflow-hidden rounded-md border bg-muted"
          >
            <img
              src={url}
              alt=""
              className="size-full object-cover"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.opacity = "0.2"
              }}
            />
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
              aria-label={m.aria_remove()}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {!reachedLimit && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/40 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="size-4" />
            <span>{addLabel ?? m.media_picker_trigger()}</span>
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b p-4">
            <DialogTitle>{m.media_picker_title()}</DialogTitle>
            <DialogDescription>
              {m.media_picker_description()}
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "library" | "upload")}
            className="flex h-[65vh] flex-col"
          >
            <TabsList className="mx-4 mt-2 self-start">
              <TabsTrigger value="library">
                {m.media_picker_tab_library()}
              </TabsTrigger>
              <TabsTrigger value="upload">
                {m.media_picker_tab_upload()}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="library" className="flex-1 overflow-hidden">
              <div className="flex h-full overflow-hidden">
                <aside className="w-56 shrink-0 overflow-y-auto border-r">
                  <FolderTree
                    selectedFolderId={folderId}
                    onSelect={setFolderId}
                  />
                </aside>
                <section className="flex-1 overflow-y-auto p-4">
                  <AssetGrid folderId={folderId} onSelect={append} />
                </section>
              </div>
            </TabsContent>

            <TabsContent value="upload" className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed bg-muted/20 py-16 text-center">
                <ImageIcon className="size-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {m.media_picker_upload_hint()}
                </p>
                <UploadButton
                  folderId={null}
                  onUploaded={append}
                  label={m.media_upload_choose_file()}
                />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  )
}
