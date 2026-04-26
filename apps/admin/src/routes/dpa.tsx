import { createFileRoute } from "@tanstack/react-router"

import LegalLayout from "#/components/legal/LegalLayout"
import { seo } from "#/lib/seo"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

const LAST_UPDATED = "2026-04-26"

export const Route = createFileRoute("/dpa")({
  head: () =>
    seo({
      title: "Data Processing Agreement",
      description:
        "ApolloKit 数据处理协议(DPA)—— 企业客户可签署的处理者条款,涵盖 GDPR Art. 28 要求。",
      path: "/dpa",
    }),
  component: DpaPage,
})

function DpaPage() {
  return (
    <LegalLayout title={t("数据处理协议(DPA)", "Data Processing Agreement (DPA)")} lastUpdated={LAST_UPDATED}>
      <p>
        {t(
          "针对处理欧盟 / 英国数据主体的客户,ApolloKit 提供符合 GDPR 第 28 条要求的数据处理协议(DPA)。",
          "For customers processing EU / UK data subjects, ApolloKit provides a Data Processing Agreement (DPA) compliant with Article 28 GDPR.",
        )}
      </p>

      <h2>{t("如何获取", "How to obtain")}</h2>
      <p>
        {t(
          "v1 阶段我们暂未提供自助下载入口。请发送邮件至 ",
          "Self-serve download is not yet available. Please email ",
        )}
        <a href="mailto:legal@apollokit.app">legal@apollokit.app</a>
        {t(
          ",在邮件中注明组织名称、注册地、联系人,我们会在 5 个工作日内回复一份待签署的 DPA。",
          " with your organization name, registered address, and contact person — we'll send a DPA-ready document within 5 business days.",
        )}
      </p>

      <h2>{t("DPA 涵盖的内容", "What the DPA covers")}</h2>
      <ul>
        <li>{t("处理目的、性质、期限,以及数据主体类别", "Processing purposes, nature, duration, and categories of data subjects")}</li>
        <li>{t("ApolloKit 作为处理者的义务(机密性、安全措施、协助、删除)", "ApolloKit's obligations as processor (confidentiality, security, assistance, deletion)")}</li>
        <li>{t("子处理者授权与变更通知机制", "Authorization and change-notification rules for subprocessors")}</li>
        <li>{t("跨境传输的标准合同条款(SCC)附件", "Standard Contractual Clauses (SCC) annex for international transfers")}</li>
        <li>{t("审计与合规验证机制", "Audit and compliance verification rights")}</li>
      </ul>

      <h2>{t("子处理者", "Subprocessors")}</h2>
      <p>
        {t("当前完整子处理者清单见 ", "Our current subprocessor list is at ")}
        <a href="/subprocessors">/subprocessors</a>
        {t("。", ".")}
      </p>
    </LegalLayout>
  )
}
