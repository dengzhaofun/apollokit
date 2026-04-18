import { Upload } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "#/components/ui/button"
import { useUploadMediaAsset } from "#/hooks/use-media-library"
import type { MediaAsset } from "#/lib/types/media-library"
import * as m from "#/paraglide/messages.js"

interface UploadButtonProps {
  folderId: string | null
  /** If provided, called once for each successful upload (multi-file). */
  onUploaded?: (asset: MediaAsset) => void
  accept?: string
  /**
   * Override the default "Upload" label. When omitted, falls back to
   * `m.media_upload_button()` so locale switches automatically.
   */
  label?: string
}

export function UploadButton({
  folderId,
  onUploaded,
  accept = "image/*",
  label,
}: UploadButtonProps) {
  const ref = useRef<HTMLInputElement>(null)
  const upload = useUploadMediaAsset()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  )

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const arr = Array.from(files)
    setProgress({ done: 0, total: arr.length })
    try {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i]!
        const asset = await upload.mutateAsync({ file, folderId })
        onUploaded?.(asset)
        setProgress({ done: i + 1, total: arr.length })
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : m.media_upload_failed())
    } finally {
      setProgress(null)
      if (ref.current) ref.current.value = ""
    }
  }

  const resolvedLabel = label ?? m.media_upload_button()

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        size="sm"
        onClick={() => ref.current?.click()}
        disabled={upload.isPending}
      >
        <Upload className="size-4" />
        {progress
          ? m.media_upload_progress({ done: progress.done, total: progress.total })
          : upload.isPending
            ? m.media_upload_in_progress()
            : resolvedLabel}
      </Button>
    </>
  )
}
