import { useEffect, useState } from "react";
import {
  Link,
  createFileRoute,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  RotateCcw,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { PagesBuilderChat } from "#/components/page-builder/PagesBuilderChat";
import { PreviewIframe } from "#/components/page-builder/PreviewIframe";
import { VersionTimeline } from "#/components/page-builder/VersionTimeline";
import { Button } from "#/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "#/components/ui/resizable";
import {
  usePageConversation,
  usePageProject,
  usePageProjectVersions,
  usePreviewToken,
  usePublishVersion,
  useRollbackVersion,
} from "#/hooks/use-pages";
import { ApiError } from "#/lib/api-client";
import type { PageProjectVersion } from "#/lib/types/page";
import { getLocale } from "#/paraglide/runtime.js";

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en);

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/pages/$pageProjectId",
)({
  component: PageProjectWorkspace,
});

function PageProjectWorkspace() {
  const params = Route.useParams();
  const projectId = params.pageProjectId;

  const project = usePageProject(projectId);
  const versions = usePageProjectVersions(projectId);
  const conversation = usePageConversation(projectId);
  const publish = usePublishVersion(projectId);
  const rollback = useRollbackVersion(projectId);
  const previewToken = usePreviewToken();

  // Track which version the right-pane iframe is showing. Defaults to
  // the newest draft so reviewers see what the agent just produced
  // without an extra click.
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const latestDraft: PageProjectVersion | null =
    versions.data?.items[0] ?? null;
  const publishedVersionId = project.data?.publishedVersionId ?? null;

  // Auto-select the latest draft on first load. Pinning the prior
  // selection would be confusing — operators expect "show me what's
  // new" semantics.
  useEffect(() => {
    if (!previewVersionId && latestDraft) {
      setPreviewVersionId(latestDraft.id);
    }
  }, [latestDraft, previewVersionId]);

  // Whenever the selected version changes, fetch a fresh JWT and
  // update the iframe URL. previewToken.mutateAsync is idempotent on
  // the server side (it just signs a new token) so re-firing on each
  // version pick is fine.
  useEffect(() => {
    if (!previewVersionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await previewToken.mutateAsync({
          projectId,
          versionId: previewVersionId,
        });
        if (cancelled) return;
        const base = readPagesBase();
        const url = base
          ? `https://pages.${base}/preview/${encodeURIComponent(projectId)}?v=${encodeURIComponent(res.versionId)}&t=${encodeURIComponent(res.token)}`
          : `http://pages.localhost:3001/preview/${encodeURIComponent(projectId)}?v=${encodeURIComponent(res.versionId)}&t=${encodeURIComponent(res.token)}`;
        setPreviewUrl(url);
        setIframeKey((k) => k + 1);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.body.message : (err as Error).message;
        toast.error(msg || t("生成预览失败", "Failed to load preview"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewVersionId, projectId]);

  // After agent proposes a new version, react-query invalidates
  // the versions list — pick up the new latest as the live preview.
  useEffect(() => {
    if (!latestDraft) return;
    const isNewerThanCurrent =
      previewVersionId &&
      latestDraft.id !== previewVersionId &&
      // Only auto-jump when the new version was created BY THE AGENT.
      // Manual rollback / restore should respect operator intent.
      latestDraft.authorType === "ai";
    if (isNewerThanCurrent) {
      setPreviewVersionId(latestDraft.id);
    }
  }, [latestDraft, previewVersionId]);

  if (project.isLoading) {
    return <div className="p-6 text-sm">{t("加载中…", "Loading…")}</div>;
  }
  if (project.error) {
    return (
      <div className="p-6 text-sm text-destructive">
        {(project.error as Error).message}
      </div>
    );
  }
  if (!project.data) return null;

  const p = project.data;
  const publishedVersion = versions.data?.items.find(
    (v) => v.id === publishedVersionId,
  );

  async function onPublish(versionId: string) {
    try {
      await publish.mutateAsync(versionId);
      toast.success(t("已发布", "Published"));
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.body.message : (err as Error).message;
      toast.error(msg || t("发布失败", "Publish failed"));
    }
  }

  async function onRollback(versionId: string) {
    try {
      const result = await rollback.mutateAsync({
        versionId,
        publishImmediately: false,
      });
      toast.success(
        t(
          `已回滚为 v${result.versionNumber}（草稿）`,
          `Rolled back as v${result.versionNumber} (draft)`,
        ),
      );
      setPreviewVersionId(result.id);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.body.message : (err as Error).message;
      toast.error(msg || t("回滚失败", "Rollback failed"));
    }
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <header className="flex items-center justify-between border-b bg-background px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/o/$orgSlug/p/$projectSlug/pages"
            params={{
              orgSlug: params.orgSlug,
              projectSlug: params.projectSlug,
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-sm hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            {t("返回列表", "Back to list")}
          </Link>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate">{p.name}</span>
            <span className="text-xs text-muted-foreground truncate">
              {p.slug} · {p.authMode}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {publishedVersion ? (
            <span className="text-xs text-muted-foreground">
              {t("已发布", "Published")}: v{publishedVersion.versionNumber}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("未发布", "Unpublished")}
            </span>
          )}
          {previewVersionId &&
          latestDraft &&
          previewVersionId === latestDraft.id ? (
            <Button
              size="sm"
              onClick={() => onPublish(previewVersionId)}
              disabled={publish.isPending || previewVersionId === publishedVersionId}
            >
              <Send className="size-3.5 mr-1" />
              {t(
                `发布 v${latestDraft.versionNumber}`,
                `Publish v${latestDraft.versionNumber}`,
              )}
            </Button>
          ) : null}
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-sm hover:bg-muted"
            >
              <ExternalLink className="size-3.5" />
              {t("新窗口打开", "Open in tab")}
            </a>
          ) : null}
        </div>
      </header>

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1"
        autoSave="page-builder-split"
      >
        <ResizablePanel defaultSize={40} minSize={28}>
          <div className="h-full flex flex-col bg-background">
            <PagesBuilderChat
              projectId={projectId}
              initialMessages={
                conversation.data?.items.map((m) => ({
                  id: m.messageId,
                  role: m.role === "tool" ? "assistant" : m.role,
                  parts:
                    typeof m.content === "object" &&
                    m.content !== null &&
                    "parts" in m.content
                      ? ((m.content as { parts: unknown }).parts as never)
                      : [{ type: "text", text: "" }],
                })) ?? []
              }
            />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={60} minSize={32}>
          <div className="flex h-full flex-col">
            <PreviewIframe
              src={previewUrl}
              iframeKey={iframeKey}
              loading={previewToken.isPending}
            />
            <VersionTimeline
              versions={versions.data?.items ?? []}
              publishedVersionId={publishedVersionId}
              previewVersionId={previewVersionId}
              onSelect={setPreviewVersionId}
              onPublish={onPublish}
              onRollback={onRollback}
              publishPending={publish.isPending}
              rollbackPending={rollback.isPending}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Footer hint — silent for now; could surface KV cache TTL info. */}
      {rollback.isPending ? (
        <div className="border-t bg-muted/30 px-4 py-1 text-xs text-muted-foreground">
          <RotateCcw className="inline-block size-3 mr-1 animate-spin" />
          {t("正在回滚…", "Rolling back…")}
        </div>
      ) : null}
    </div>
  );
}

function readPagesBase(): string | null {
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_PAGES_BASE_DOMAIN;
  return typeof v === "string" && v.length > 0 ? v : null;
}
