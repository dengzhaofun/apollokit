import { createFileRoute } from "@tanstack/react-router"

import LegalLayout from "#/components/legal/LegalLayout"
import { seo } from "#/lib/seo"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

const LAST_UPDATED = "2026-04-26"

export const Route = createFileRoute("/terms")({
  head: () =>
    seo({
      title: "Terms of Service",
      description:
        "ApolloKit 服务条款 —— 使用我们的产品前请阅读账户、可接受使用、付费、终止、责任等条款。",
      path: "/terms",
    }),
  component: TermsPage,
})

/* NEEDS LEGAL REVIEW —— 全文是技术骨架,管辖法律 / 公司主体 / 责任上限等条款待法务审定。 */
function TermsPage() {
  return (
    <LegalLayout title={t("服务条款", "Terms of Service")} lastUpdated={LAST_UPDATED}>
      <p>
        {t(
          "欢迎使用 ApolloKit。注册账户或使用我们的服务即表示你同意以下条款。请认真阅读 —— 这是你与我们之间具有法律效力的协议。",
          "Welcome to ApolloKit. By creating an account or using our services you agree to the following terms. Please read carefully — this is a binding agreement between you and us.",
        )}
      </p>

      <h2>{t("1. 账户", "1. Accounts")}</h2>
      <p>
        {t(
          "你须年满 18 岁或在你所在司法辖区达到合同年龄。账户安全(密码 / API key)由你自行保管;由账户发出的操作均视为你授权。",
          "You must be at least 18 years old or of contract age in your jurisdiction. You are responsible for safeguarding your credentials (password / API keys); all actions originating from your account are deemed authorized by you.",
        )}
      </p>

      <h2>{t("2. 可接受使用", "2. Acceptable use")}</h2>
      <p>{t("你不得使用 ApolloKit 进行以下活动:", "You may not use ApolloKit to:")}</p>
      <ul>
        <li>{t("违反任何适用的法律 / 法规", "violate any applicable law or regulation")}</li>
        <li>{t("发送垃圾邮件、恶意软件,或对第三方系统进行攻击 / 渗透", "send spam, distribute malware, or attack / probe third-party systems")}</li>
        <li>{t("绕过 / 滥用速率限制、配额或安全机制", "circumvent or abuse rate limits, quotas, or security controls")}</li>
        <li>{t("逆向工程或转售本服务的核心组件", "reverse-engineer or resell core components of the service")}</li>
      </ul>

      <h2>{t("3. 客户数据所有权", "3. Customer data ownership")}</h2>
      <p>
        {t(
          "你上传到 ApolloKit 的数据(包括玩家 / 终端用户数据)归你所有。我们仅作为处理者(Processor)按你的指示存储 / 服务。详见 ",
          "Data you upload to ApolloKit (including player / end-user data) belongs to you. We act only as a processor on your instructions. See ",
        )}
        <a href="/privacy">{t("隐私政策", "Privacy Policy")}</a>
        {t(" 和 ", " and ")}
        <a href="/dpa">{t("数据处理协议", "DPA")}</a>。
      </p>

      <h2>{t("4. 费用与计费", "4. Fees and billing")}</h2>
      <p>
        {t(
          "[占位 — 计费正式上线后补充] 各订阅档位的功能与限额详见 ",
          "[Placeholder — to be filled when billing launches] Subscription tiers, features, and limits are listed at ",
        )}
        <a href="/pricing">/pricing</a>
        {t("。提交付款即视为授权我们按所选档位向你收取相应费用。", ". Submitting payment authorizes us to charge you per the selected tier.")}
      </p>

      <h2>{t("5. 终止", "5. Termination")}</h2>
      <p>
        {t(
          "你可以随时在控制台 设置 → 账户 注销账户。我们保留在你严重违反本条款时暂停或终止服务的权利,通常会提前通知,除非违规导致即时风险。",
          "You may delete your account at any time via Settings → Account. We may suspend or terminate access for material breach, with prior notice where reasonable, except in cases creating immediate risk.",
        )}
      </p>

      <h2>{t("6. 服务现状声明 / 免责", "6. Disclaimer of warranties")}</h2>
      <p>
        {t(
          "本服务以 \"现状\"(AS-IS)和 \"现有可用\"(AS-AVAILABLE)提供。在适用法律允许的最大范围内,我们不就服务的适销性、特定用途适用性、不侵权或不中断作任何明示或默示保证。",
          "The service is provided \"AS-IS\" and \"AS-AVAILABLE\". To the maximum extent permitted by law, we disclaim all warranties — express or implied — including merchantability, fitness for a particular purpose, non-infringement, and uninterrupted operation.",
        )}
      </p>

      <h2>{t("7. 责任上限", "7. Limitation of liability")}</h2>
      <p>
        {t(
          "[NEEDS LEGAL REVIEW] 在适用法律允许范围内,我们的累计责任上限为你在事故发生前 12 个月内向 ApolloKit 实际支付的费用,且不就间接损失、利润损失、数据损失承担责任。",
          "[NEEDS LEGAL REVIEW] To the extent permitted by law, our aggregate liability is capped at the fees you actually paid ApolloKit in the 12 months preceding the incident; we are not liable for indirect, consequential, lost-profit, or lost-data damages.",
        )}
      </p>

      <h2>{t("8. 管辖法律与争议", "8. Governing law and disputes")}</h2>
      <p>
        {t(
          "[JURISDICTION TBD — NEEDS LEGAL REVIEW] 本条款适用 [待定司法辖区] 法律。任何争议优先通过友好协商解决;协商不成的提交 [待定仲裁机构] 仲裁。",
          "[JURISDICTION TBD — NEEDS LEGAL REVIEW] These terms are governed by the laws of [TBD]. Disputes will first be addressed through good-faith negotiation; failing that, submitted to [TBD arbitration body].",
        )}
      </p>

      <h2>{t("9. 条款变更", "9. Changes")}</h2>
      <p>
        {t(
          "重大变更我们会通过控制台公告或邮件提前通知。继续使用即视为接受变更后的条款。",
          "Material changes will be announced via dashboard banner or email in advance. Continued use constitutes acceptance of the updated terms.",
        )}
      </p>

      <h2>{t("10. 联系我们", "10. Contact")}</h2>
      <p>
        <a href="mailto:legal@apollokit.app">legal@apollokit.app</a>
      </p>
    </LegalLayout>
  )
}
