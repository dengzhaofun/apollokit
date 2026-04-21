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

export const CURRENCY_HINT = "¥ CNY · 可切换美元计价"

export const PRICING_TIERS: Plan[] = [
  {
    id: "indie",
    name: "Indie",
    tagline: "原型 / 内测 / 毕设",
    priceMonthly: "¥0",
    priceNote: "永久免费",
    mauLabel: "500 MAU",
    cta: { label: "免费开始", href: "/auth/sign-up" },
    features: [
      "全部 30+ 模块",
      "1 个项目",
      "最多 2 位协作者",
      "社区与文档支持",
      "30 天操作日志",
      "邮件模板带 ApolloKit 水印",
      "不用于商业化运营",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "商业首发 · 小团队运营",
    priceMonthly: "¥299",
    priceNote: "起 / 月",
    mauLabel: "5,000 MAU",
    cta: { label: "开始 14 天试用", href: "/auth/sign-up" },
    highlighted: true,
    features: [
      "全部模块 · 无水印",
      "3 个项目（多环境 Dev / Stg / Prod）",
      "最多 8 位协作者",
      "工单支持 · 首响 1 个工作日",
      "90 天操作日志",
      "事件订阅（Webhook）",
      "多环境 API Key / Scope",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    tagline: "多款游戏 · 稳定运营期",
    priceMonthly: "¥1,299",
    priceNote: "起 / 月",
    mauLabel: "50,000 MAU",
    cta: { label: "联系销售", href: "mailto:sales@apollokit.dev" },
    features: [
      "Studio 全部能力",
      "无限项目",
      "无限席位",
      "优先工单 · 首响 4 小时",
      "1 年操作日志 + 导出",
      "SLA 99.9%",
      "活动灰度与分层投放",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "上市公司 / 平台方",
    priceMonthly: "Custom",
    priceNote: "定制合约",
    mauLabel: "无限 MAU",
    cta: { label: "预约架构访谈", href: "mailto:sales@apollokit.dev" },
    features: [
      "Scale 全部能力",
      "单租户 / 区域独享部署",
      "SSO 单点登录（SAML / OIDC）",
      "专属客户成功经理",
      "24 × 7 电话支持 · 15 分钟首响",
      "定制 SLA / DPA / MSA",
      "年度安全审计 & 渗透测试报告",
    ],
  },
]

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

export const PRICING_MATRIX: MatrixRow[] = [
  // —— 额度 ——
  {
    group: "额度",
    label: "MAU 额度",
    values: {
      indie: "500",
      studio: "5,000",
      scale: "50,000",
      enterprise: "无限",
    },
  },
  {
    group: "额度",
    label: "项目数",
    values: { indie: "1", studio: "3", scale: "无限", enterprise: "无限" },
  },
  {
    group: "额度",
    label: "成员席位",
    values: { indie: "2", studio: "8", scale: "无限", enterprise: "无限" },
  },
  {
    group: "额度",
    label: "API 调用",
    values: {
      indie: "500K / 月",
      studio: "10M / 月",
      scale: "100M / 月",
      enterprise: "自定义",
    },
  },

  // —— 模块 ——
  { group: "模块", label: "经济系统（物品 / 货币 / 仓库 / 兑换）", values: { indie: true, studio: true, scale: true, enterprise: true } },
  { group: "模块", label: "运营（签到 / Banner / 公告 / 活动 / 抽奖 / 任务）", values: { indie: true, studio: true, scale: true, enterprise: true } },
  { group: "模块", label: "内容（对话 / 图鉴 / 关卡 / 素材库）", values: { indie: true, studio: true, scale: true, enterprise: true } },
  { group: "模块", label: "社交与竞技（好友 / 公会 / 排行榜 / 天梯）", values: { indie: true, studio: true, scale: true, enterprise: true } },
  { group: "模块", label: "事件中心 · 玩家数据平台", values: { indie: true, studio: true, scale: true, enterprise: true } },

  // —— 开发者能力 ——
  { group: "开发者", label: "多语言 SDK（TS / C# / Go / Python）", values: { indie: true, studio: true, scale: true, enterprise: true } },
  { group: "开发者", label: "Webhook 事件订阅", values: { indie: false, studio: true, scale: true, enterprise: true } },
  { group: "开发者", label: "Scope 细分的 API Key", values: { indie: "基础", studio: true, scale: true, enterprise: true } },
  { group: "开发者", label: "自定义域名", values: { indie: false, studio: false, scale: true, enterprise: true } },

  // —— 治理 ——
  { group: "治理", label: "操作日志", values: { indie: "30 天", studio: "90 天", scale: "1 年", enterprise: "自定义" } },
  { group: "治理", label: "数据导出", values: { indie: "CSV", studio: "CSV / 事件流", scale: "CSV / 事件流 / 仓库同步", enterprise: "自定义" } },
  { group: "治理", label: "SSO 单点登录", values: { indie: false, studio: false, scale: false, enterprise: true } },
  { group: "治理", label: "审计报告", values: { indie: false, studio: false, scale: "季度", enterprise: "定制" } },
  { group: "治理", label: "SLA", values: { indie: false, studio: "99.5%", scale: "99.9%", enterprise: "定制" } },

  // —— 支持 ——
  { group: "支持", label: "社区 & 文档", values: { indie: true, studio: true, scale: true, enterprise: true } },
  { group: "支持", label: "工单支持", values: { indie: false, studio: "首响 1 工作日", scale: "首响 4 小时", enterprise: "首响 15 分钟" } },
  { group: "支持", label: "专属客户成功", values: { indie: false, studio: false, scale: false, enterprise: true } },
  { group: "支持", label: "架构咨询 / 迁移支持", values: { indie: false, studio: false, scale: "按次购买", enterprise: true } },
]

export const PRICING_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "为什么按 MAU 计费，不按 DAU？",
    a: "游戏的 DAU 抖动比想象中大——版本更新当日、开新服、节日活动、冲榜周、开测节点，DAU 都会翻几倍。如果按 DAU 计费，你的账单也会跟着翻。按 MAU 计价会把这些突刺在月维度上自然平滑，预算更好估、财务更好做。",
  },
  {
    q: "MAU 是怎么算的？",
    a: "同一自然月内，被 SDK 识别为 userId 的账号只要有过任意一次活跃（登录、领奖、抽卡、上传对局等），就计 1 MAU。重复活跃不会重复计数。开发 / 测试环境的项目不会计入生产额度。",
  },
  {
    q: "超过额度会怎么样？",
    a: "不会立刻断服。我们会提前提醒，给出扩档建议，并允许短暂超量运行（冲量期 15 天，覆盖开测 / 开新服 / 节日活动这类突刺）。超额期间按「每千 MAU 附加费」计费，不会出现因扩档审批没跑完而停服的事故。",
  },
  {
    q: "可以按年付吗？",
    a: "可以。Studio 及以上档按年付享 20% 折扣，并附带专属迁移协助。",
  },
  {
    q: "Indie 免费档有什么限制？",
    a: "额度 500 MAU / 月、1 个项目、2 位成员，功能除 SSO / Webhook / 自定义域名 / SLA 之外全部可用。Indie 档定位是原型验证、内测、毕设 Alpha——一旦你准备商业化上线，请升级到 Studio。",
  },
  {
    q: "为什么免费档只有 500 MAU，不是更多？",
    a: "游戏不是工具产品，一款月活稳定 1,000+ 的游戏通常已经具备商业化收入。我们把免费档定在 500 MAU，保证 Demo、内测、校园项目可以完整跑通，同时避免把付费档的资源补贴给已经有收入的商业项目。",
  },
  {
    q: "可以从 Indie 升到 Studio 而不丢数据吗？",
    a: "可以。所有数据、配置、API Key 在账号内延续，升档只是解锁更多额度与能力，不需要迁移。",
  },
  {
    q: "Enterprise 档能私有化部署吗？",
    a: "支持单租户部署（专属基础设施）与区域独享部署。如需完全离线的自建方案，可签订 OEM 合约，我们提供镜像与支持。",
  },
  {
    q: "有学生 / 开源 / 非商业项目的特殊方案吗？",
    a: "教育、开源、非商业 Mod 项目可申请 Studio 档免费升级（需审核）。联系 sales@apollokit.dev。",
  },
]
