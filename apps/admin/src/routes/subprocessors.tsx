import { createFileRoute } from "@tanstack/react-router"

import LegalLayout from "#/components/legal/LegalLayout"
import { seo } from "#/lib/seo"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

const LAST_UPDATED = "2026-04-26"

type Subprocessor = {
  vendor: string
  purpose: { zh: string; en: string }
  region: string
  data: { zh: string; en: string }
  url: string
}

/*
 * 来源:apps/server/wrangler.jsonc 绑定 + lib/tinybird.ts + auth.config.ts。
 * 任何接入新外部服务时记得回来更新这个表 + 隐私政策的保留期 / 跨境段落。
 */
const SUBPROCESSORS: Subprocessor[] = [
  {
    vendor: "Cloudflare, Inc.",
    purpose: {
      zh: "应用托管(Workers)、邮件发送(Email Workers)、对象存储(R2)、CDN / 边缘缓存。",
      en: "App hosting (Workers), email delivery (Email Workers), object storage (R2), CDN / edge cache.",
    },
    region: "Global edge (US / EU / APAC)",
    data: {
      zh: "请求元数据、邀请邮件、媒体上传文件。",
      en: "Request metadata, invitation emails, media uploads.",
    },
    url: "https://www.cloudflare.com/privacypolicy/",
  },
  {
    vendor: "Neon, Inc.",
    purpose: {
      zh: "主数据库(Postgres)。",
      en: "Primary database (Postgres).",
    },
    region: "US-East / EU-West (per project)",
    data: {
      zh: "账户、组织、玩家、业务实体全量数据。",
      en: "Full account, organization, player, and business entity data.",
    },
    url: "https://neon.tech/privacy-policy",
  },
  {
    vendor: "Upstash, Inc.",
    purpose: {
      zh: "Redis 缓存与队列。",
      en: "Redis cache and queues.",
    },
    region: "Global (Cloudflare-fronted)",
    data: {
      zh: "短期会话状态、速率限制计数、后台任务负载。",
      en: "Short-lived session state, rate-limit counters, background job payloads.",
    },
    url: "https://upstash.com/trust/privacy.pdf",
  },
  {
    vendor: "Tinybird Co.",
    purpose: {
      zh: "实时分析 / 请求日志(180 天保留)。",
      en: "Real-time analytics / request logs (180-day retention).",
    },
    region: "EU / US (per workspace)",
    data: {
      zh: "HTTP 请求元数据、业务事件流。",
      en: "HTTP request metadata, business event streams.",
    },
    url: "https://www.tinybird.co/privacy",
  },
  {
    vendor: "OpenRouter, Inc.",
    purpose: {
      zh: "AI 模型路由(供 AI 辅助功能调用)。",
      en: "AI model routing (powering AI-assist features).",
    },
    region: "US",
    data: {
      zh: "用户主动发送给 AI 助手的内容。",
      en: "Content the user explicitly sends to the AI assistant.",
    },
    url: "https://openrouter.ai/privacy",
  },
  {
    vendor: t("客户配置的 Webhook 目的端", "Customer-configured webhook endpoints"),
    purpose: {
      zh: "事件推送给客户系统(由客户在控制台自行配置)。",
      en: "Event delivery to customer systems (configured by customer in dashboard).",
    },
    region: t("由客户决定", "Determined by customer"),
    data: {
      zh: "客户订阅的业务事件 payload。",
      en: "Business event payloads the customer subscribed to.",
    },
    url: "",
  },
]

export const Route = createFileRoute("/subprocessors")({
  head: () =>
    seo({
      title: "Subprocessors",
      description:
        "ApolloKit 子处理者列表 —— 我们使用的基础设施供应商、所在区域、处理的数据范围。",
      path: "/subprocessors",
    }),
  component: SubprocessorsPage,
})

function SubprocessorsPage() {
  return (
    <LegalLayout title={t("子处理者", "Subprocessors")} lastUpdated={LAST_UPDATED}>
      <p>
        {t(
          "下表列出 ApolloKit 用以提供服务的全部子处理者(Subprocessors)。我们在变更或新增子处理者前会通过控制台公告或邮件通知。",
          "The table below lists all subprocessors ApolloKit relies on to deliver the service. We will notify you via dashboard or email before adding or changing a subprocessor.",
        )}
      </p>

      <div className="not-prose my-6 overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("供应商", "Vendor")}</th>
              <th className="px-4 py-3">{t("用途", "Purpose")}</th>
              <th className="px-4 py-3">{t("区域", "Region")}</th>
              <th className="px-4 py-3">{t("数据类别", "Data categories")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {SUBPROCESSORS.map((s) => (
              <tr key={s.vendor} className="align-top">
                <td className="px-4 py-3">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                      {s.vendor}
                    </a>
                  ) : (
                    <span className="font-medium">{s.vendor}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t(s.purpose.zh, s.purpose.en)}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.region}</td>
                <td className="px-4 py-3 text-muted-foreground">{t(s.data.zh, s.data.en)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("如需企业级数据处理协议(DPA),请前往 ", "For an enterprise Data Processing Agreement (DPA), see ")}
        <a href="/dpa">/dpa</a>
        {t("。", ".")}
      </p>
    </LegalLayout>
  )
}
