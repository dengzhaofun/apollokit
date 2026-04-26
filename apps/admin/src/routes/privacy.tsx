import { createFileRoute } from "@tanstack/react-router"

import CookieTable from "#/components/legal/CookieTable"
import LegalLayout from "#/components/legal/LegalLayout"
import { seo } from "#/lib/seo"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

const LAST_UPDATED = "2026-04-26"

export const Route = createFileRoute("/privacy")({
  head: () =>
    seo({
      title: "Privacy Policy",
      description:
        "ApolloKit 隐私政策 —— 我们收集什么数据、为什么收集、保留多久、如何行使你的数据权利。",
      path: "/privacy",
    }),
  component: PrivacyPage,
})

/* NEEDS LEGAL REVIEW —— 全文以技术事实为骨架,法律措辞需法务审阅。 */
function PrivacyPage() {
  return (
    <LegalLayout title={t("隐私政策", "Privacy Policy")} lastUpdated={LAST_UPDATED}>
      <p>
        {t(
          "本隐私政策说明 ApolloKit(以下简称\"我们\")在你访问我们的网站、注册账户、使用控制台时,如何收集、使用、保存和保护信息。我们尊重并遵守 GDPR、CCPA 等主要数据保护法律。",
          "This Privacy Policy explains how ApolloKit (\"we\", \"us\") collects, uses, retains, and protects information when you visit our website, sign up for an account, or use our dashboard. We honor GDPR, CCPA, and other applicable data-protection laws.",
        )}
      </p>

      <h2>{t("1. 我们的双重角色", "1. Our dual role")}</h2>
      <p>
        {t(
          "ApolloKit 是 B2B 游戏运营 SaaS,在两类数据主体面前承担不同角色:",
          "ApolloKit is a B2B game-ops SaaS and acts in two distinct roles:",
        )}
      </p>
      <ul>
        <li>
          <strong>{t("控制者(Controller)", "Controller")}</strong>
          {t(
            ":针对你 —— 即创建 ApolloKit 账户的开发者 / 运营人员 —— 我们决定数据用途。",
            ": for you — the developer or ops user who creates an ApolloKit account — we determine the purposes of processing.",
          )}
        </li>
        <li>
          <strong>{t("处理者(Processor)", "Processor")}</strong>
          {t(
            ":针对你的玩家 / 终端用户(End Users),我们仅按你的指示代为处理数据,你是控制者。详见 ",
            ": for your players / end users, we process data only on your instructions; you are the controller. See ",
          )}
          <a href="/dpa">{t("数据处理协议", "DPA")}</a>。
        </li>
      </ul>

      <h2>{t("2. 我们收集什么数据", "2. What we collect")}</h2>
      <h3>{t("2.1 控制台账户(管理用户)", "2.1 Dashboard account (admin users)")}</h3>
      <ul>
        <li>{t("姓名、邮箱、头像 URL", "Name, email, avatar URL")}</li>
        <li>{t("登录凭证元数据(密码哈希、OAuth token)", "Auth credential metadata (password hash, OAuth tokens)")}</li>
        <li>{t("每个会话的 IP 地址 + User-Agent + 创建 / 过期时间", "Per-session IP + User-Agent + creation / expiry timestamps")}</li>
        <li>{t("你创建 / 操作的项目、配置、API key 等业务数据", "Projects, configs, API keys you create / operate")}</li>
      </ul>
      <h3>{t("2.2 服务端运行日志(Tinybird)", "2.2 Server-side request logs (Tinybird)")}</h3>
      <p>
        {t(
          "为保障可观测性和安全审计,我们对每个 HTTP 请求记录:方法、路径、状态码、耗时、IP 国家(非完整 IP)、User-Agent、组织 ID、关联 actor。日志保留 ",
          "For observability and security auditing we log each HTTP request: method, path, status, duration, IP country (not full IP), User-Agent, organization ID, associated actor. Logs are retained for ",
        )}
        <strong>180 {t("天", "days")}</strong>{" "}
        {t("后自动滚动删除。", "and then rotate out automatically.")}
      </p>
      <h3>{t("2.3 终端用户(玩家)数据", "2.3 End-user (player) data")}</h3>
      <p>
        {t(
          "由你作为客户接入 SDK 时上传,典型字段:外部 ID、邮箱(在你的组织内 unique)、姓名、头像、IP+UA 会话记录。我们仅作为处理者代为存储和服务。",
          "Uploaded by you when you integrate the SDK. Typical fields: external ID, email (unique within your organization), name, avatar, IP+UA session records. We hold this only as a processor on your behalf.",
        )}
      </p>

      <h2>{t("3. 处理目的与法律基础(GDPR Art. 6)", "3. Purposes and legal bases (GDPR Art. 6)")}</h2>
      <ul>
        <li>
          <strong>{t("合同履行 ", "Contract: ")}</strong>
          {t("提供你订阅的服务、账户管理、计费。", "delivering the service you signed up for, account management, billing.")}
        </li>
        <li>
          <strong>{t("合法利益 ", "Legitimate interest: ")}</strong>
          {t("安全监控、防滥用、产品改进(基于聚合 / 匿名指标)。", "security monitoring, abuse prevention, product improvement (based on aggregate / anonymized metrics).")}
        </li>
        <li>
          <strong>{t("法律义务 ", "Legal obligation: ")}</strong>
          {t("响应监管要求、税务、司法调取。", "responding to regulatory, tax, or judicial requests.")}
        </li>
        <li>
          <strong>{t("同意 ", "Consent: ")}</strong>
          {t("你主动开启的可选 cookie / 营销邮件订阅(目前未启用任何此类项)。", "any optional cookies / marketing emails you opt into (none currently enabled).")}
        </li>
      </ul>

      <h2>{t("4. 数据保留", "4. Retention")}</h2>
      <ul>
        <li>{t("账户数据:账户存续期间持续保留,删除账户后 30 天内清除(法定保留期除外)。", "Account data: kept for the lifetime of the account; purged within 30 days of account deletion (except where law requires otherwise).")}</li>
        <li>{t("Tinybird 请求日志:180 天滚动。", "Tinybird request logs: 180-day rolling window.")}</li>
        <li>{t("发票 / 计费记录:按所在司法辖区财税法规定保留(通常 7 年)。", "Invoices / billing records: retained per applicable tax law (typically 7 years).")}</li>
      </ul>

      <h2>{t("5. 子处理者", "5. Subprocessors")}</h2>
      <p>
        {t("我们使用以下基础设施供应商,完整清单见 ", "We rely on the following infrastructure providers; see the full list at ")}
        <a href="/subprocessors">/subprocessors</a>。
      </p>

      <h2>{t("6. 跨境数据传输", "6. International transfers")}</h2>
      <p>
        {t(
          "ApolloKit 部署在 Cloudflare 全球边缘节点;数据库存储于 Neon Postgres(美国 / 欧盟可选区域)。如果你身处欧盟而服务节点位于第三国,我们依据标准合同条款(SCC)进行合规传输。",
          "ApolloKit runs on Cloudflare global edge; the database lives on Neon Postgres (US / EU regions). For EU subjects served from a third country, transfers rely on Standard Contractual Clauses (SCC).",
        )}
      </p>

      <h2>{t("7. 你的权利", "7. Your rights")}</h2>
      <p>{t("依据 GDPR / CCPA,你享有以下权利:", "Under GDPR / CCPA you have the following rights:")}</p>
      <ul>
        <li>{t("查阅(Access)、更正(Rectification)、删除(Erasure)", "Access, rectification, erasure")}</li>
        <li>{t("数据可携(Portability)、限制处理(Restriction)、反对处理(Objection)", "Portability, restriction, objection")}</li>
        <li>{t("撤回同意(Withdraw consent)、向监管机构投诉的权利", "Withdraw consent, lodge a complaint with a supervisory authority")}</li>
      </ul>
      <p>
        {t("行使方式:在控制台 ", "To exercise: open ")}
        <code>{t("设置 → 账户", "Settings → Account")}</code>
        {t(" 自助删除账户;或邮件至 ", " for self-serve deletion, or email ")}
        <a href="mailto:legal@apollokit.app">legal@apollokit.app</a>
        {t("。", ".")}
      </p>

      <h2 id="cookies">{t("8. Cookie 与本地存储", "8. Cookies and local storage")}</h2>
      <p>
        {t(
          "我们仅使用严格必要 + 功能性的 cookie / localStorage 项,不使用任何广告、跨站追踪或第三方分析 cookie。完整清单如下:",
          "We use only strictly necessary + functionality cookies / localStorage entries. No advertising, cross-site tracking, or third-party analytics cookies. Full inventory below:",
        )}
      </p>
      <CookieTable />
      <p>
        {t("你可以在页脚 ", "You can update preferences any time via the ")}
        <strong>{t("Cookie 设置", "Cookie settings")}</strong>
        {t(" 入口随时调整偏好。", " link in the footer.")}
      </p>

      <h2>{t("9. 政策变更", "9. Changes to this policy")}</h2>
      <p>
        {t(
          "重大变更我们会在控制台公告或邮件通知。最近一次更新日期见本页顶部。",
          "Material changes will be announced via dashboard banner or email. The last-updated date appears at the top of this page.",
        )}
      </p>

      <h2>{t("10. 联系我们", "10. Contact")}</h2>
      <p>
        {t("一般咨询:", "General inquiries: ")}
        <a href="mailto:legal@apollokit.app">legal@apollokit.app</a>
        <br />
        {t("安全报告:", "Security reports: ")}
        <a href="mailto:security@apollokit.app">security@apollokit.app</a>
      </p>
    </LegalLayout>
  )
}
