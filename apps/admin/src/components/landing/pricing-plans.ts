/**
 * Pricing plan configuration.
 *
 * PRICING MODEL NOTE —— 「按 MAU 阶梯 + 功能分层」混合定价，不是按 DAU。
 * 免费档 500 MAU 定位为"原型 / 内测 / 毕设 Alpha"，不覆盖有商业化收入的游戏；
 * 商业首发请走 Studio（5,000 MAU）—— 这是游戏 SaaS 行业更合理的水位。
 *
 * 阶梯设计：500 → 5,000 → 50,000 → ∞（10x 递进，客户好理解）。
 *
 * 如果你之后想改：
 *   - 改价格：调整每个 tier 的 `priceMonthly`
 *   - 改 MAU 档位：调整 `mauLabel` + features 里的 MAU 行 + 对比表
 *   - 切回 DAU：把 `mauLabel` 字段名改成 `dauLabel` 并同步文案
 *   - 切到"按请求计费"：加一个 `extraMeter` 字段，在卡片里渲染
 */

import * as m from "#/paraglide/messages.js"

export type Plan = {
  id: "indie" | "studio" | "scale" | "enterprise"
  name: string
  tagline: string
  priceMonthly: string // 完整格式，含货币符号；"Custom" 用于企业档
  priceNote?: string // e.g. "起 / 月" 或 "按年付省 20%"
  mauLabel: string // 面向用户的 MAU 额度说明
  cta: { label: string; href: string }
  highlighted?: boolean
  features: string[]
}

export function getCurrencyHint(): string {
  return m.pricing_currency_hint()
}

export function getPricingTiers(): Plan[] {
  return [
    {
      id: "indie",
      name: m.pricing_indie_name(),
      tagline: m.pricing_indie_tagline(),
      priceMonthly: m.pricing_indie_price(),
      priceNote: m.pricing_indie_price_note(),
      mauLabel: m.pricing_indie_mau(),
      cta: { label: m.pricing_indie_cta(), href: "/auth/sign-up" },
      features: [
        m.pricing_indie_feat1(),
        m.pricing_indie_feat2(),
        m.pricing_indie_feat3(),
        m.pricing_indie_feat4(),
        m.pricing_indie_feat5(),
        m.pricing_indie_feat6(),
        m.pricing_indie_feat7(),
      ],
    },
    {
      id: "studio",
      name: m.pricing_studio_name(),
      tagline: m.pricing_studio_tagline(),
      priceMonthly: m.pricing_studio_price(),
      priceNote: m.pricing_studio_price_note(),
      mauLabel: m.pricing_studio_mau(),
      cta: { label: m.pricing_studio_cta(), href: "/auth/sign-up" },
      highlighted: true,
      features: [
        m.pricing_studio_feat1(),
        m.pricing_studio_feat2(),
        m.pricing_studio_feat3(),
        m.pricing_studio_feat4(),
        m.pricing_studio_feat5(),
        m.pricing_studio_feat6(),
        m.pricing_studio_feat7(),
      ],
    },
    {
      id: "scale",
      name: m.pricing_scale_name(),
      tagline: m.pricing_scale_tagline(),
      priceMonthly: m.pricing_scale_price(),
      priceNote: m.pricing_scale_price_note(),
      mauLabel: m.pricing_scale_mau(),
      cta: { label: m.pricing_scale_cta(), href: "mailto:sales@apollokit.dev" },
      features: [
        m.pricing_scale_feat1(),
        m.pricing_scale_feat2(),
        m.pricing_scale_feat3(),
        m.pricing_scale_feat4(),
        m.pricing_scale_feat5(),
        m.pricing_scale_feat6(),
        m.pricing_scale_feat7(),
      ],
    },
    {
      id: "enterprise",
      name: m.pricing_enterprise_name(),
      tagline: m.pricing_enterprise_tagline(),
      priceMonthly: m.pricing_enterprise_price(),
      priceNote: m.pricing_enterprise_price_note(),
      mauLabel: m.pricing_enterprise_mau(),
      cta: { label: m.pricing_enterprise_cta(), href: "mailto:sales@apollokit.dev" },
      features: [
        m.pricing_enterprise_feat1(),
        m.pricing_enterprise_feat2(),
        m.pricing_enterprise_feat3(),
        m.pricing_enterprise_feat4(),
        m.pricing_enterprise_feat5(),
        m.pricing_enterprise_feat6(),
        m.pricing_enterprise_feat7(),
      ],
    },
  ]
}

/**
 * Full feature comparison matrix used on the /pricing page.
 * Each row lists what each plan gets. `true` = included, `false` = not included,
 * string = qualified value (e.g. "10,000").
 */

export type MatrixRow = {
  group: string
  label: string
  values: Record<Plan["id"], string | boolean>
  note?: string
}

export function getPricingMatrix(): MatrixRow[] {
  return [
    // —— Quota ——
    {
      group: m.pricing_matrix_group_quota(),
      label: m.pricing_matrix_label_mau(),
      values: {
        indie: "500",
        studio: "5,000",
        scale: "50,000",
        enterprise: m.pricing_matrix_val_unlimited(),
      },
    },
    {
      group: m.pricing_matrix_group_quota(),
      label: m.pricing_matrix_label_projects(),
      values: { indie: "1", studio: "3", scale: m.pricing_matrix_val_unlimited(), enterprise: m.pricing_matrix_val_unlimited() },
    },
    {
      group: m.pricing_matrix_group_quota(),
      label: m.pricing_matrix_label_seats(),
      values: { indie: "2", studio: "8", scale: m.pricing_matrix_val_unlimited(), enterprise: m.pricing_matrix_val_unlimited() },
    },
    {
      group: m.pricing_matrix_group_quota(),
      label: m.pricing_matrix_label_api_calls(),
      values: {
        indie: "500K / 月",
        studio: "10M / 月",
        scale: "100M / 月",
        enterprise: m.pricing_matrix_val_custom(),
      },
    },

    // —— Modules ——
    { group: m.pricing_matrix_group_modules(), label: m.pricing_matrix_label_economy(), values: { indie: true, studio: true, scale: true, enterprise: true } },
    { group: m.pricing_matrix_group_modules(), label: m.pricing_matrix_label_liveops(), values: { indie: true, studio: true, scale: true, enterprise: true } },
    { group: m.pricing_matrix_group_modules(), label: m.pricing_matrix_label_content(), values: { indie: true, studio: true, scale: true, enterprise: true } },
    { group: m.pricing_matrix_group_modules(), label: m.pricing_matrix_label_social(), values: { indie: true, studio: true, scale: true, enterprise: true } },
    { group: m.pricing_matrix_group_modules(), label: m.pricing_matrix_label_event_center(), values: { indie: true, studio: true, scale: true, enterprise: true } },

    // —— Developer ——
    { group: m.pricing_matrix_group_developer(), label: m.pricing_matrix_label_sdk(), values: { indie: true, studio: true, scale: true, enterprise: true } },
    { group: m.pricing_matrix_group_developer(), label: m.pricing_matrix_label_webhook(), values: { indie: false, studio: true, scale: true, enterprise: true } },
    { group: m.pricing_matrix_group_developer(), label: m.pricing_matrix_label_apikey(), values: { indie: m.pricing_matrix_val_basic(), studio: true, scale: true, enterprise: true } },
    { group: m.pricing_matrix_group_developer(), label: m.pricing_matrix_label_custom_domain(), values: { indie: false, studio: false, scale: true, enterprise: true } },

    // —— Governance ——
    { group: m.pricing_matrix_group_governance(), label: m.pricing_matrix_label_audit_log(), values: { indie: "30 天", studio: "90 天", scale: "1 年", enterprise: m.pricing_matrix_val_custom() } },
    { group: m.pricing_matrix_group_governance(), label: m.pricing_matrix_label_data_export(), values: { indie: "CSV", studio: "CSV / 事件流", scale: "CSV / 事件流 / 仓库同步", enterprise: m.pricing_matrix_val_custom() } },
    { group: m.pricing_matrix_group_governance(), label: m.pricing_matrix_label_sso(), values: { indie: false, studio: false, scale: false, enterprise: true } },
    { group: m.pricing_matrix_group_governance(), label: m.pricing_matrix_label_audit_report(), values: { indie: false, studio: false, scale: m.pricing_matrix_val_quarterly(), enterprise: m.pricing_matrix_val_custom() } },
    { group: m.pricing_matrix_group_governance(), label: m.pricing_matrix_label_sla(), values: { indie: false, studio: "99.5%", scale: "99.9%", enterprise: m.pricing_matrix_val_custom() } },

    // —— Support ——
    { group: m.pricing_matrix_group_support(), label: m.pricing_matrix_label_community(), values: { indie: true, studio: true, scale: true, enterprise: true } },
    { group: m.pricing_matrix_group_support(), label: m.pricing_matrix_label_ticket(), values: { indie: false, studio: "首响 1 工作日", scale: "首响 4 小时", enterprise: "首响 15 分钟" } },
    { group: m.pricing_matrix_group_support(), label: m.pricing_matrix_label_csm(), values: { indie: false, studio: false, scale: false, enterprise: true } },
    { group: m.pricing_matrix_group_support(), label: m.pricing_matrix_label_arch(), values: { indie: false, studio: false, scale: m.pricing_matrix_val_per_purchase(), enterprise: true } },
  ]
}

export function getPricingFaq(): Array<{ q: string; a: string }> {
  return [
    { q: m.pricing_faq_q1(), a: m.pricing_faq_a1() },
    { q: m.pricing_faq_q2(), a: m.pricing_faq_a2() },
    { q: m.pricing_faq_q3(), a: m.pricing_faq_a3() },
    { q: m.pricing_faq_q4(), a: m.pricing_faq_a4() },
    { q: m.pricing_faq_q5(), a: m.pricing_faq_a5() },
    { q: m.pricing_faq_q6(), a: m.pricing_faq_a6() },
    { q: m.pricing_faq_q7(), a: m.pricing_faq_a7() },
    { q: m.pricing_faq_q8(), a: m.pricing_faq_a8() },
    { q: m.pricing_faq_q9(), a: m.pricing_faq_a9() },
  ]
}
