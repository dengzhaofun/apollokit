import { createFileRoute, Link } from "@tanstack/react-router"
import { MessagesSquareIcon, Plus } from "lucide-react"

import { ScriptTable } from "#/components/dialogue/ScriptTable"
import {
  EmptyList,
  ErrorState,
  PageBody,
  PageHeader,
  PageShell,
} from "#/components/patterns"
import { Button } from "#/components/ui/button"
import { useDialogueScripts } from "#/hooks/use-dialogue"
import * as m from "#/paraglide/messages.js"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

export const Route = createFileRoute("/_dashboard/dialogue/")({
  component: DialogueListPage,
})

function DialogueListPage() {
  const { data: items, isPending, error, refetch } = useDialogueScripts()
  const total = items?.length ?? 0

  return (
    <PageShell>
      <PageHeader
        icon={<MessagesSquareIcon className="size-5" />}
        title={t("对话脚本", "Dialogue scripts")}
        description={
          isPending
            ? t("加载中…", "Loading…")
            : error
              ? t("加载失败", "Failed to load")
              : t(`共 ${total} 条脚本`, `${total} scripts total`)
        }
        actions={
          <Button asChild size="sm">
            <Link to="/dialogue/create">
              <Plus />
              {m.dialogue_new_script()}
            </Link>
          </Button>
        }
      />

      <PageBody>
        {isPending ? (
          <div className="flex h-40 items-center justify-center rounded-lg border bg-card text-muted-foreground">
            {m.common_loading()}
          </div>
        ) : error ? (
          <ErrorState
            title={t("脚本加载失败", "Failed to load scripts")}
            onRetry={() => refetch()}
            retryLabel={t("重试", "Retry")}
            error={error instanceof Error ? error : null}
          />
        ) : total === 0 ? (
          <EmptyList
            title={t("还没有对话脚本", "No dialogue scripts yet")}
            description={t(
              "创建第一条剧情脚本,驱动 NPC 对白与剧情节点。",
              "Create your first script to drive NPC dialogues and story beats.",
            )}
            action={
              <Button asChild size="sm">
                <Link to="/dialogue/create">
                  <Plus />
                  {m.dialogue_new_script()}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <ScriptTable data={items ?? []} />
          </div>
        )}
      </PageBody>
    </PageShell>
  )
}
