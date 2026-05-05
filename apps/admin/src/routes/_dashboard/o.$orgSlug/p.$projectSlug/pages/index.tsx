import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ExternalLink,
  LayoutTemplate,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { PageBody, PageHeader, PageShell } from "#/components/patterns";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  useCreatePageProject,
  usePageProjects,
  usePageTemplates,
} from "#/hooks/use-pages";
import { ApiError } from "#/lib/api-client";
import type {
  PageAuthMode,
  PageProject,
  PageTemplate,
} from "#/lib/types/page";
import { getLocale } from "#/paraglide/runtime.js";

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en);

export const Route = createFileRoute(
  "/_dashboard/o/$orgSlug/p/$projectSlug/pages/",
)({
  component: PagesListPage,
});

function PagesListPage() {
  const params = Route.useParams();
  const projects = usePageProjects();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <PageShell>
      <PageHeader
        icon={<LayoutTemplate className="size-5" />}
        title={t("AI 落地页", "AI landing pages")}
        description={t(
          "运营自助生成可直接访问的活动页面。AI 会根据你的描述写出页面 schema,版本可回滚,支持立即发布。",
          "Operator-built landing pages — describe what you want, the agent writes the schema, every version is rollback-able, publish on demand.",
        )}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" />
            {t("新建项目", "New project")}
          </Button>
        }
      />
      <PageBody>
        {projects.isLoading ? (
          <p className="text-sm text-muted-foreground">{t("加载中…", "Loading…")}</p>
        ) : projects.error ? (
          <p className="text-sm text-destructive">
            {(projects.error as Error).message}
          </p>
        ) : projects.data?.items.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data?.items.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                href={`/o/${params.orgSlug}/p/${params.projectSlug}/pages/${p.id}`}
              />
            ))}
          </ul>
        )}
      </PageBody>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          toast.success(t("项目已创建", "Project created"));
          // Navigate into the new project's workspace.
          window.location.href = `/o/${params.orgSlug}/p/${params.projectSlug}/pages/${id}`;
        }}
      />
    </PageShell>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <Sparkles className="size-8 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {t("还没有页面项目", "No page projects yet")}
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t(
            "创建一个项目,然后用自然语言告诉 AI 你想要什么样的活动页 ——签到 / 商城 / 抽奖 / 排行 / 邮件 / CDKey 兑换都能装。",
            "Create a project, then describe in plain language what page you want — check-in / shop / lottery / leaderboard / mail / CDKey redemption all supported.",
          )}
        </p>
      </div>
      <Button size="sm" onClick={onCreate}>
        <Plus className="size-4 mr-1" />
        {t("新建项目", "New project")}
      </Button>
    </div>
  );
}

function ProjectCard({
  project,
  href,
}: {
  project: PageProject;
  href: string;
}) {
  const previewBase = readPagesBase();
  return (
    <li className="rounded-lg border bg-card p-4 transition hover:border-foreground/20">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={href}
          className="flex flex-col gap-1 min-w-0 flex-1"
        >
          <span className="text-sm font-semibold truncate">
            {project.name}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {project.slug}
          </span>
        </Link>
        <Badge variant={statusVariant(project.status)} className="shrink-0">
          {project.status}
        </Badge>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <Badge variant="outline" className="font-normal">
          {project.authMode}
        </Badge>
        {project.boundModules.length > 0 ? (
          <span className="truncate text-muted-foreground">
            {project.boundModules.slice(0, 3).join(" / ")}
            {project.boundModules.length > 3 ? " …" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t("无绑定模块", "no modules")}
          </span>
        )}
      </div>
      {project.publishedVersionId && previewBase ? (
        <a
          href={`https://${project.slug}.${previewBase}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {project.slug}.{previewBase}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </li>
  );
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "published") return "default";
  if (status === "archived") return "outline";
  return "secondary";
}

function readPagesBase(): string | null {
  // Vite-injected env. Empty in dev — we don't know the base.
  // Setting `VITE_PAGES_BASE_DOMAIN=pages.apollokit.dev` in
  // .env.production / wrangler vars exposes the live URL on each card.
  const v = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_PAGES_BASE_DOMAIN;
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ─── Create dialog (minimal MVP — template picker is stretched to PR-8 follow-up) ──

const AUTH_MODES: PageAuthMode[] = [
  "anonymous",
  "platform_auth",
  "hmac_external",
];

const SUGGESTED_MODULES = [
  "check-in",
  "shop",
  "lottery",
  "cdkey",
  "leaderboard",
  "mail",
  "badge",
  "activity",
];

function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [authMode, setAuthMode] = useState<PageAuthMode>("anonymous");
  const [modules, setModules] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>("");

  const templates = usePageTemplates();
  const create = useCreatePageProject();

  function toggleModule(m: string) {
    setModules((curr) =>
      curr.includes(m) ? curr.filter((x) => x !== m) : [...curr, m],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await create.mutateAsync({
        slug,
        name,
        authMode,
        boundModules: modules,
        templateId: templateId === "" ? undefined : templateId,
      });
      onCreated(result.id);
      // Reset state on close
      setName("");
      setSlug("");
      setAuthMode("anonymous");
      setModules([]);
      setTemplateId("");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.body.message : (err as Error).message;
      toast.error(msg || t("创建失败", "Failed to create"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("新建落地页项目", "New page project")}</DialogTitle>
          <DialogDescription>
            {t(
              "项目创建后,会进入 AI 对话工作区。你跟 AI 描述想要的页面,AI 会写出 schema 并保存为草稿,你确认后再发布。",
              "After creating the project you'll land in the AI chat workspace. Describe what you want; the agent writes the schema and you publish when ready.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form id="create-page-project" onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cpp-name">{t("项目名称", "Project name")}</Label>
            <Input
              id="cpp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cpp-slug">
              {t("子域 slug", "Subdomain slug")}
            </Label>
            <Input
              id="cpp-slug"
              value={slug}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
              placeholder="spring-checkin"
              required
              minLength={3}
              maxLength={63}
              pattern="[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]"
            />
            <p className="text-xs text-muted-foreground">
              {readPagesBase()
                ? `${slug || "your-slug"}.${readPagesBase()}`
                : t(
                    "上线后页面会托管在 <slug>.pages.apollokit.dev",
                    "Hosted at <slug>.pages.apollokit.dev once deployed",
                  )}
            </p>
          </div>
          <div className="grid gap-2">
            <Label>{t("玩家身份", "Player auth")}</Label>
            <Select
              value={authMode}
              onValueChange={(v) => {
                if (v) setAuthMode(v as PageAuthMode);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTH_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {authModeHelp(authMode)}
            </p>
          </div>
          <div className="grid gap-2">
            <Label>{t("绑定的游戏模块", "Bound game modules")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_MODULES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModule(m)}
                  className={
                    "rounded-md border px-2.5 py-1 text-xs " +
                    (modules.includes(m)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background text-muted-foreground hover:border-foreground/40")
                  }
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "AI 只能在你勾选的模块上绑定 block。后续可以随时调整。",
                "AI can only bind blocks against modules you enable here. Adjustable later.",
              )}
            </p>
          </div>
          {!templates.isLoading && templates.data?.items?.length ? (
            <div className="grid gap-2">
              <Label>{t("起步模板（可选）", "Starter template (optional)")}</Label>
              <Select
                value={templateId}
                onValueChange={(v) => setTemplateId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("从空白开始", "Start blank")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">
                    {t("从空白开始", "Start blank")}
                  </SelectItem>
                  {templates.data.items.map((tpl: PageTemplate) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            {t("取消", "Cancel")}
          </Button>
          <Button
            type="submit"
            form="create-page-project"
            disabled={create.isPending}
          >
            {create.isPending
              ? t("创建中…", "Creating…")
              : t("创建", "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function authModeHelp(mode: PageAuthMode): string {
  switch (mode) {
    case "anonymous":
      return t(
        "不需要玩家登录;每个浏览器分配一个匿名 ID。",
        "No login required; each browser is assigned an anonymous ID.",
      );
    case "platform_auth":
      return t(
        "玩家用平台账号登录(Better Auth)。",
        "Players sign in with the platform's Better Auth.",
      );
    case "hmac_external":
      return t(
        "你的服务端预签 HMAC 注入到 URL 或 iframe;玩家无需重复登录。",
        "Your backend pre-signs HMAC and injects via URL or iframe; no double login.",
      );
  }
}
