import { ImageIcon, Pencil, X } from "lucide-react"
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

type MediaPickerSize = "sm" | "md" | "lg"

interface MediaPickerDialogProps {
  /** Current URL (if any) shown as the thumbnail. */
  value?: string | null
  onChange: (url: string) => void
  /** Empty-state hint + aria-label for the trigger. Defaults to "Select image". */
  buttonLabel?: string
  /** Extra classes applied to the outer wrapper (e.g. width overrides). */
  triggerClassName?: string
  /** Thumbnail size: sm (6rem) / md (8rem, default) / lg (10rem). */
  size?: MediaPickerSize
}

const SIZE_CLASS: Record<MediaPickerSize, string> = {
  sm: "size-24",
  md: "size-32",
  lg: "size-40",
}

/**
 * Click the thumbnail itself to pick / upload an asset. Hover shows a
 * "replace" overlay; the corner X clears the field value (does NOT
 * delete the asset from the media library).
 */
export function MediaPickerDialog({
  value,
  onChange,
  buttonLabel,
  triggerClassName,
  size,
}: MediaPickerDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [tab, setTab] = useState<"library" | "upload">("library")

  function handlePick(asset: MediaAsset) {
    onChange(resolveAssetUrl(asset.url))
    setOpen(false)
  }

  const resolvedLabel = buttonLabel ?? m.media_picker_trigger()
  const sizeClass = SIZE_CLASS[size ?? "md"]

  return (
    <>
      <div className={`group relative ${sizeClass} ${triggerClassName ?? ""}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={resolvedLabel}
          title={value || resolvedLabel}
          className={`relative size-full overflow-hidden rounded-md border-2 bg-muted/30 transition hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value
              ? "border-solid border-border"
              : "border-dashed border-muted-foreground/40"
          }`}
        >
          {value ? (
            <>
              <img
                src={value}
                alt=""
                className="size-full object-cover"
                onError={(e) => {
                  // Don't let a stale/blocked URL break the layout.
                  ;(e.target as HTMLImageElement).style.opacity = "0.2"
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <Pencil className="size-5 text-white" />
                <span className="text-xs font-medium text-white">
                  {m.media_picker_replace()}
                </span>
              </div>
            </>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground transition group-hover:text-foreground">
              <ImageIcon className="size-6" />
              <span className="px-2 text-center text-xs leading-tight">
                {resolvedLabel}
              </span>
            </div>
          )}
        </button>

        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onChange("")
            }}
            aria-label={m.media_picker_clear()}
            title={m.media_picker_clear()}
            className="absolute -right-2 -top-2 rounded-full border bg-background p-1 text-muted-foreground opacity-0 shadow-sm transition hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
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
                    selectedFolderId={selectedFolderId}
                    onSelect={setSelectedFolderId}
                  />
                </aside>
                <section className="flex-1 overflow-y-auto p-4">
                  <AssetGrid
                    folderId={selectedFolderId}
                    onSelect={handlePick}
                  />
                </section>
              </div>
            </TabsContent>

            <TabsContent
              value="upload"
              className="flex-1 overflow-y-auto p-6"
            >
              <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed bg-muted/20 py-16 text-center">
                <ImageIcon className="size-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {m.media_picker_upload_hint()}
                </p>
                <UploadButton
                  folderId={null}
                  onUploaded={handlePick}
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
