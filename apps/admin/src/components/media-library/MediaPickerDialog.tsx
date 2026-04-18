import { ImageIcon } from "lucide-react"
import { useState } from "react"

import { AssetGrid } from "#/components/media-library/AssetGrid"
import { FolderTree } from "#/components/media-library/FolderTree"
import { UploadButton } from "#/components/media-library/UploadButton"
import { Button } from "#/components/ui/button"
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

interface MediaPickerDialogProps {
  /** Current URL (if any) shown as a thumbnail on the trigger button. */
  value?: string | null
  onChange: (url: string) => void
  buttonLabel?: string
  triggerClassName?: string
}

/**
 * Opens a dialog letting the user either pick an existing asset from
 * the media library or upload a new one. On pick/upload complete,
 * the absolute public URL is handed back via `onChange`.
 *
 * For forms that just store an image URL string (e.g. BannerForm),
 * this is a drop-in replacement for a plain `<Input placeholder="https://...">`.
 */
export function MediaPickerDialog({
  value,
  onChange,
  buttonLabel,
  triggerClassName,
}: MediaPickerDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [tab, setTab] = useState<"library" | "upload">("library")

  function handlePick(asset: MediaAsset) {
    onChange(resolveAssetUrl(asset.url))
    setOpen(false)
  }

  const resolvedLabel = buttonLabel ?? m.media_picker_trigger()

  return (
    <>
      <div className={`flex items-center gap-3 ${triggerClassName ?? ""}`}>
        {value ? (
          <div className="size-16 shrink-0 overflow-hidden rounded-md border bg-muted">
            <img
              src={value}
              alt=""
              className="size-full object-cover"
              onError={(e) => {
                // Don't let a stale/blocked URL break the layout.
                ;(e.target as HTMLImageElement).style.opacity = "0.2"
              }}
            />
          </div>
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <ImageIcon className="size-5" />
          </div>
        )}
        <div className="flex flex-1 flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
          >
            {resolvedLabel}
          </Button>
          {value ? (
            <div className="truncate text-xs text-muted-foreground" title={value}>
              {value}
            </div>
          ) : null}
        </div>
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
