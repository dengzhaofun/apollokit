import * as React from "react";
import { Bot, RotateCcw, Send, User } from "lucide-react";

import { Button } from "#/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import type { PageProjectVersion } from "#/lib/types/page";

/**
 * Bottom-strip version timeline. Each pill = one append-only schema
 * snapshot. Visual cues:
 *   - solid green ring: published (project.publishedVersionId)
 *   - solid amber ring: currently selected for preview
 *   - dashed:           older draft / rollback target
 *
 * Clicking a pill loads it in the iframe; a hover popover exposes
 * "publish this" / "rollback to this" actions. Rollback always
 * COPIES the schema forward as a new version (timeline stays
 * monotonic) — the strip never destructively re-orders.
 */
export function VersionTimeline(props: {
  versions: PageProjectVersion[];
  publishedVersionId: string | null;
  previewVersionId: string | null;
  onSelect: (versionId: string) => void;
  onPublish: (versionId: string) => void;
  onRollback: (versionId: string) => void;
  publishPending: boolean;
  rollbackPending: boolean;
}) {
  // Server returns DESC order; render oldest → newest left → right
  // because that matches "time moves rightward" intuition.
  const ordered = React.useMemo(
    () => [...props.versions].slice().reverse(),
    [props.versions],
  );

  if (ordered.length === 0) {
    return (
      <div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        No versions yet. Ask the AI to draft a page.
      </div>
    );
  }

  return (
    <TooltipProvider delay={150}>
      <div className="border-t bg-muted/30">
        <div className="flex items-center gap-2 overflow-x-auto px-4 py-2">
          {ordered.map((v) => {
            const isPublished = v.id === props.publishedVersionId;
            const isPreview = v.id === props.previewVersionId;
            return (
              <Tooltip key={v.id}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => props.onSelect(v.id)}
                      className={
                        "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (isPublished
                          ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                          : isPreview
                            ? "border-amber-400 bg-amber-500/15 text-amber-100"
                            : "border-input bg-background text-foreground hover:border-foreground/40")
                      }
                      data-version-id={v.id}
                      data-published={isPublished}
                      data-preview={isPreview}
                    >
                      {v.authorType === "ai" ? (
                        <Bot className="size-3" />
                      ) : (
                        <User className="size-3" />
                      )}
                      v{v.versionNumber}
                    </button>
                  }
                />
                <TooltipContent side="top" sideOffset={6}>
                  <VersionTooltipContent
                    version={v}
                    isPublished={isPublished}
                    isPreview={isPreview}
                    onPublish={() => props.onPublish(v.id)}
                    onRollback={() => props.onRollback(v.id)}
                    publishPending={props.publishPending}
                    rollbackPending={props.rollbackPending}
                  />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

function VersionTooltipContent(props: {
  version: PageProjectVersion;
  isPublished: boolean;
  isPreview: boolean;
  onPublish: () => void;
  onRollback: () => void;
  publishPending: boolean;
  rollbackPending: boolean;
}) {
  const v = props.version;
  return (
    <div className="flex flex-col gap-2 max-w-xs">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs">v{v.versionNumber}</span>
        {v.label ? <span className="text-xs">{v.label}</span> : null}
        <span className="text-[10px] opacity-70">
          {new Date(v.createdAt).toLocaleString()} · {v.authorType}
        </span>
      </div>
      <div className="flex gap-1.5">
        {!props.isPublished ? (
          <Button
            size="sm"
            variant="default"
            className="h-6 px-2 text-[11px]"
            onClick={props.onPublish}
            disabled={props.publishPending}
          >
            <Send className="size-3 mr-1" />
            Publish
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[11px]"
          onClick={props.onRollback}
          disabled={props.rollbackPending}
        >
          <RotateCcw className="size-3 mr-1" />
          Rollback to this
        </Button>
      </div>
    </div>
  );
}
