import { Loader2 } from "lucide-react";

/**
 * Right-pane iframe that renders the apollokit-pages worker's preview
 * route for the currently-selected version. Sandboxed: third-party
 * cookies / popups / cross-origin nav are blocked at the iframe layer
 * even before the pages worker's CORS / preview-token check fires.
 *
 * `iframeKey` bumps on every URL change so React tears down the iframe
 * and re-mounts it. Without that, navigation history inside the iframe
 * (back/forward) leaks across version switches.
 *
 * No internal split; the surrounding layout (workspace route) owns the
 * version timeline below.
 */
export function PreviewIframe(props: {
  src: string | null;
  iframeKey: number;
  loading?: boolean;
}) {
  if (!props.src) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/20 text-sm text-muted-foreground">
        {props.loading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Generating preview…
          </span>
        ) : (
          <span>Select a version to preview.</span>
        )}
      </div>
    );
  }
  return (
    <div className="relative flex flex-1 overflow-hidden bg-zinc-950">
      <iframe
        key={props.iframeKey}
        src={props.src}
        title="page-preview"
        // sandbox flags:
        //   - allow-scripts: pages render needs JS (TanStack hydration)
        //   - allow-same-origin: cookies / form posts on `*.pages.apollokit.dev`
        //   - allow-forms: Better Auth + activity-form posts
        //   - allow-popups: in case the page contains an external link CTA
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="h-full w-full border-0 bg-zinc-950"
      />
      {props.loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="size-6 animate-spin text-white" />
        </div>
      ) : null}
    </div>
  );
}
