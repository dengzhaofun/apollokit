import { Link } from "@tanstack/react-router"
import {
  ArrowRight,
  ArrowLeftRight,
  BookOpen,
  CalendarCheck,
  Check,
  Coins,
  Contact,
  Dices,
  FolderOpen,
  GalleryHorizontal,
  Gift,
  Globe,
  KeyRound,
  LayoutGrid,
  LineChart,
  ListTodo,
  Mail,
  Map as MapIcon,
  Medal,
  Megaphone,
  MessagesSquare,
  Package,
  PartyPopper,
  PiggyBank,
  Plug,
  Radio,
  Shield,
  ShoppingCart,
  Sparkles,
  Swords,
  Ticket,
  Trophy,
  UserPlus,
  Users,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { Button } from "#/components/ui/button"

import MarketingShell, {
  SectionEyebrow,
  SectionTitle,
} from "./MarketingShell"
import { PRICING_TIERS } from "./pricing-plans"

type ModuleItem = {
  name: string
  icon: LucideIcon
  desc: string
}

type ModuleGroup = {
  id: string
  title: string
  subtitle: string
  accent: string // tailwind color utility fragment, e.g. "indigo"
  items: ModuleItem[]
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    id: "economy",
    title: "经济系统",
    subtitle: "Economy · 道具、货币、交易、库存一张表",
    accent: "indigo",
    items: [
      { name: "物品", icon: Package, desc: "道具定义 / 属性 / 稀有度" },
      { name: "货币", icon: Coins, desc: "多币种、汇率、流水账" },
      { name: "实体", icon: Sparkles, desc: "任意可交付资源" },
      { name: "兑换", icon: ArrowLeftRight, desc: "限购、阶梯、组合包" },
      { name: "兑换码", icon: Ticket, desc: "CDKEY 生成 / 批量 / 核销" },
      { name: "商城", icon: ShoppingCart, desc: "SKU / 礼包 / 限时" },
      { name: "存储箱", icon: PiggyBank, desc: "暂存、领取队列、溢出" },
      { name: "邮件", icon: Mail, desc: "系统邮件 / 奖励挂件" },
    ],
  },
  {
    id: "operations",
    title: "运营活动",
    subtitle: "LiveOps · 活动、签到、抽奖即配即用",
    accent: "cyan",
    items: [
      { name: "签到", icon: CalendarCheck, desc: "连续 / 累计 / 补签" },
      { name: "轮播图", icon: GalleryHorizontal, desc: "活动位 / 投放 / 分层" },
      { name: "公告", icon: Megaphone, desc: "弹窗 / 滚动条 / 定向" },
      { name: "活动", icon: PartyPopper, desc: "开关、周期、分层奖励" },
      { name: "抽奖", icon: Dices, desc: "概率表 / 保底 / 防伪" },
      { name: "赠礼", icon: Gift, desc: "好友系统 / 每日额度" },
      { name: "任务", icon: ListTodo, desc: "日常、周常、链式" },
    ],
  },
  {
    id: "content",
    title: "内容生产",
    subtitle: "Content · 让策划自己上线内容",
    accent: "fuchsia",
    items: [
      { name: "素材云盘", icon: FolderOpen, desc: "图片 / 音频 / 版本化" },
      { name: "对话", icon: MessagesSquare, desc: "NPC 分支 / 多语言" },
      { name: "图鉴", icon: BookOpen, desc: "收集度 / 进度 / 奖励" },
      { name: "关卡", icon: MapIcon, desc: "章节 / 解锁 / 难度" },
      { name: "事件中心", icon: Radio, desc: "埋点 / 合同 / 下发" },
    ],
  },
  {
    id: "social",
    title: "社交与竞技",
    subtitle: "Social · 让玩家彼此留住彼此",
    accent: "emerald",
    items: [
      { name: "好友", icon: Users, desc: "关系链 / 申请 / 黑名单" },
      { name: "邀请", icon: UserPlus, desc: "分享 / 返利 / 归因" },
      { name: "公会", icon: Shield, desc: "创建 / 权限 / 贡献度" },
      { name: "组队", icon: Swords, desc: "匹配 / 房间 / 副本" },
      { name: "排行榜", icon: Trophy, desc: "实时 / 快照 / 分赛季" },
      { name: "天梯", icon: Medal, desc: "段位 / ELO / 结算" },
      { name: "终端玩家", icon: Contact, desc: "档案 / 画像 / 封禁" },
    ],
  },
]

const HERO_ICONS_INNER: LucideIcon[] = [
  Package,
  Coins,
  ShoppingCart,
  Mail,
  CalendarCheck,
  PartyPopper,
]

const HERO_ICONS_MIDDLE: LucideIcon[] = [
  Dices,
  Gift,
  Megaphone,
  GalleryHorizontal,
  ListTodo,
  Ticket,
  ArrowLeftRight,
  PiggyBank,
]

const HERO_ICONS_OUTER: LucideIcon[] = [
  Trophy,
  Medal,
  Users,
  Swords,
  Shield,
  BookOpen,
  MessagesSquare,
  FolderOpen,
  Radio,
  MapIcon,
  UserPlus,
  Contact,
]

function PlanetLogo({ size = "size-20" }: { size?: string }) {
  return (
    <div
      className={`${size} relative grid place-items-center overflow-hidden rounded-[28%] bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,.45)] ring-1 ring-foreground/20`}
    >
      <img
        src="/logo192.png"
        alt="ApolloKit"
        className="size-3/4 object-contain"
      />
      <span className="absolute -right-1 -top-1 size-3 rounded-full bg-[var(--ak-accent-2)] shadow-[0_0_24px_var(--ak-glow-2)]" />
    </div>
  )
}

function OrbitRing({
  radius,
  icons,
  duration,
  reverse = false,
  glow,
}: {
  radius: number
  icons: LucideIcon[]
  duration: number
  reverse?: boolean
  glow: string
}) {
  const style = { ["--orbit-duration" as string]: `${duration}s` } as React.CSSProperties
  return (
    <div
      className="absolute inset-0 grid place-items-center"
      aria-hidden="true"
    >
      {/* The ring itself */}
      <div
        className="absolute rounded-full border border-dashed border-foreground/15"
        style={{ width: radius * 2, height: radius * 2 }}
      />
      {/* The rotating frame, centered on the planet */}
      <div
        className={`absolute ${reverse ? "ak-orbit-reverse" : "ak-orbit"}`}
        style={{ width: radius * 2, height: radius * 2, ...style }}
      >
        {icons.map((Icon, i) => {
          const angle = (360 / icons.length) * i
          return (
            <div
              key={i}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)`,
              }}
            >
              <div
                className="ak-orbit-item grid size-10 place-items-center rounded-xl border border-border bg-background/80 text-foreground shadow-[0_10px_30px_-12px_var(--ak-glow-1)] backdrop-blur"
                style={{ ["--orbit-duration" as string]: `${duration}s` } as React.CSSProperties}
              >
                <Icon className="size-4.5" strokeWidth={1.75} />
              </div>
            </div>
          )
        })}
      </div>
      {/* Accent glow */}
      <div
        className="absolute rounded-full opacity-60"
        style={{
          width: radius * 2,
          height: radius * 2,
          background: `radial-gradient(closest-side, ${glow}, transparent 70%)`,
          filter: "blur(10px)",
        }}
      />
    </div>
  )
}

function Constellation() {
  return (
    <div className="relative aspect-square w-full max-w-[560px]">
      {/* Ambient blobs */}
      <div
        className="ak-glow"
        style={{
          top: "-10%",
          left: "-12%",
          width: "55%",
          height: "55%",
          background: "var(--ak-glow-1)",
        }}
      />
      <div
        className="ak-glow"
        style={{
          bottom: "-12%",
          right: "-8%",
          width: "50%",
          height: "50%",
          background: "var(--ak-glow-3)",
        }}
      />

      <OrbitRing
        radius={90}
        icons={HERO_ICONS_INNER}
        duration={48}
        glow="var(--ak-glow-1)"
      />
      <OrbitRing
        radius={150}
        icons={HERO_ICONS_MIDDLE}
        duration={78}
        reverse
        glow="var(--ak-glow-2)"
      />
      <OrbitRing
        radius={220}
        icons={HERO_ICONS_OUTER}
        duration={118}
        glow="var(--ak-glow-3)"
      />

      <div className="absolute inset-0 grid place-items-center">
        <PlanetLogo size="size-24" />
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 ak-grid-bg" aria-hidden />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-14">
        <div className="ak-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="ak-pulse inline-block size-1.5 rounded-full bg-[var(--ak-accent-2)]" />
            通用游戏后端，一个 SDK 接入就够
          </div>

          <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-tight md:text-6xl lg:text-7xl">
            把游戏通用后端
            <br />
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-[var(--ak-accent)] via-[var(--ak-accent-2)] to-[var(--ak-accent-3)] bg-clip-text text-transparent">
                抽象成一个 SDK。
              </span>
              <svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 300 10"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2 7 Q 80 2 150 6 T 298 4"
                  stroke="var(--ak-accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            ApolloKit 把 <span className="font-semibold text-foreground">30+ 个游戏通用模块</span>{" "}
            （道具、货币、签到、抽奖、活动、邮件、排行榜、公会、对话……）抽象好了。
            新项目直接接入 SDK，通用逻辑从此不用再自研。
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              render={
                <Link to="/auth/$authView" params={{ authView: "sign-up" }}>
                  免费开始构建
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              }
              size="lg"
              className="h-12 px-6 text-base font-semibold"
            />
            <Button
              render={
                <a href="#modules">
                  看看 30+ 模块
                  <ArrowRight className="ml-1 size-4" />
                </a>
              }
              variant="outline"
              size="lg"
              className="h-12 px-6 text-base"
            />
          </div>

          {/* Stats strip */}
          <dl className="mt-12 grid max-w-xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
            {[
              { k: "30+", v: "开箱即用模块" },
              { k: "4", v: "步集成完毕" },
              { k: "全球", v: "就近响应" },
              { k: "0", v: "运维负担" },
            ].map((s) => (
              <div key={s.v}>
                <dt className="text-3xl font-black tracking-tight text-foreground">{s.k}</dt>
                <dd className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                  {s.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative hidden place-items-center lg:grid">
          <Constellation />
        </div>
      </div>
    </section>
  )
}

function CapabilityCard({
  icon: Icon,
  title,
  desc,
  tag,
}: {
  icon: LucideIcon
  title: string
  desc: string
  tag: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_20px_60px_-20px_var(--ak-glow-1)]">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--ak-accent-2), transparent)",
        }}
        aria-hidden
      />
      <div className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-foreground/5 text-foreground ring-1 ring-border group-hover:bg-[var(--ak-accent-2)]/10 group-hover:text-[var(--ak-accent-2)]">
          <Icon className="size-5" strokeWidth={1.75} />
        </div>
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {tag}
        </span>
      </div>
      <h3 className="mt-5 text-xl font-bold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  )
}

function Capabilities() {
  return (
    <section id="platform" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionEyebrow>一个 SDK，接完所有通用逻辑</SectionEyebrow>
        <SectionTitle>
          六大系统，把游戏通用后端抽象成即插即用的模块。
        </SectionTitle>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <CapabilityCard
            icon={Coins}
            tag="economy"
            title="经济系统"
            desc="统一的资源账本：物品、货币、实体、仓库互相打通。发奖、扣费、兑换、流水记录，一次调用完成。"
          />
          <CapabilityCard
            icon={PartyPopper}
            tag="liveops"
            title="运营能力"
            desc="签到、Banner、公告、活动、抽奖、任务。排期、分层、限时、组合奖励——现成的规则配好就能用。"
          />
          <CapabilityCard
            icon={BookOpen}
            tag="content"
            title="游戏内容"
            desc="剧情对话、图鉴、关卡、素材云盘都是第一公民。多语言、版本化、发布流程一条链路。"
          />
          <CapabilityCard
            icon={Users}
            tag="social"
            title="社交与竞技"
            desc="好友、公会、组队、排行榜、天梯——关系链与赛季结算内建在平台里，不用再自研。"
          />
          <CapabilityCard
            icon={LineChart}
            tag="analytics"
            title="数据与事件"
            desc="每一次经济流动、活动触发自动记录。统一的事件格式，让漏斗、回流、留存曲线一目了然。"
          />
          <CapabilityCard
            icon={Plug}
            tag="sdk"
            title="开发者 SDK"
            desc="一个 API Key，一次集成。客户端调用，后台自动完成发奖、扣费、记录流水，不用自己搭任何服务。"
          />
        </div>
      </div>
    </section>
  )
}

function ModuleMatrix() {
  return (
    <section id="modules" className="relative py-24">
      <div className="absolute inset-0 ak-dots-bg opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionEyebrow>30+ 模块 · 开箱即用</SectionEyebrow>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle>
            所有你以为要写 3 个月的模块，
            <br className="hidden md:block" />
            在 ApolloKit 里都是一个开关。
          </SectionTitle>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
            <LayoutGrid className="size-4" />
            按需启用 · 一次集成
          </div>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {MODULE_GROUPS.map((group) => (
            <div
              key={group.id}
              className="rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-sm md:p-7"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold tracking-tight">{group.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{group.subtitle}</p>
                </div>
                <span
                  className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground"
                >
                  {group.id}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.items.map((m) => {
                  const Icon = m.icon
                  return (
                    <div
                      key={m.name}
                      className="ak-tile group flex flex-col gap-2 rounded-xl border border-border bg-background/70 p-3 transition-colors hover:border-foreground/30"
                      tabIndex={0}
                    >
                      <div className="flex items-center gap-2">
                        <div className="grid size-7 place-items-center rounded-md bg-foreground/5 text-foreground ring-1 ring-inset ring-border">
                          <Icon className="size-4" strokeWidth={1.75} />
                        </div>
                        <span className="text-sm font-semibold">{m.name}</span>
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {m.desc}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Workflow() {
  const steps = [
    {
      k: "01",
      title: "创建项目",
      body: "在控制台里开一个项目，拿到专属的 API Key 和后台。整个过程不到 1 分钟。",
    },
    {
      k: "02",
      title: "选模块、配规则",
      body: "勾选这款游戏需要的模块——物品、签到、排行榜、邮件……在控制台里把规则、奖励、周期配好。",
    },
    {
      k: "03",
      title: "接入 SDK",
      body: "客户端集成 ApolloKit SDK。发奖、扣费、领邮件、抽奖都是一次函数调用，参数由 SDK 类型保证。",
    },
    {
      k: "04",
      title: "游戏上线",
      body: "通用后端逻辑交给 ApolloKit，你的团队专注在玩法、美术、剧情上。",
    },
  ]

  return (
    <section id="workflow" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionEyebrow>从新项目到游戏上线</SectionEyebrow>
        <SectionTitle>4 步，让新游戏拥有完整的通用后端。</SectionTitle>

        <ol className="relative mt-16 grid gap-6 md:grid-cols-4">
          {/* connective line on md+ */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px md:block"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--foreground) 15%, var(--foreground) 85%, transparent)",
              opacity: 0.12,
            }}
            aria-hidden
          />

          {steps.map((s) => (
            <li key={s.k} className="relative">
              <div className="flex items-center gap-3 md:block">
                <div className="relative z-10 grid size-14 place-items-center rounded-full border border-border bg-background font-mono text-sm font-semibold shadow-[0_10px_30px_-15px_var(--ak-glow-1)]">
                  {s.k}
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{
                      boxShadow: "0 0 0 1px var(--ak-glow-1)",
                    }}
                    aria-hidden
                  />
                </div>
                <h3 className="text-base font-bold md:mt-5">{s.title}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CodeShowcase() {
  return (
    <section id="developer" className="relative py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <SectionEyebrow>集成只花一个下午</SectionEyebrow>
          <SectionTitle>一个 API Key，一套类型安全的 SDK。</SectionTitle>
          <p className="mt-5 max-w-xl text-muted-foreground">
            每一个模块都有对应的 SDK 方法，自动同步到你的
            TypeScript / C# / Go 工程里。发奖、扣费、领邮件、抽奖都是一次函数调用，
            参数写错了编译器会立刻告诉你。
          </p>

          <ul className="mt-8 space-y-4 text-sm">
            {[
              { icon: Plug, t: "多语言 SDK", d: "TypeScript / C# / Go / Python 一套接口，保持同步" },
              { icon: KeyRound, t: "项目级 API Key", d: "按环境、按模块分 scope，细粒度权限" },
              { icon: Zap, t: "事件推送", d: "入账、出账、活动触发推到你任意服务" },
              { icon: Globe, t: "全球就近响应", d: "玩家最近节点接收请求，天然低延迟" },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex items-start gap-3">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground/5 ring-1 ring-inset ring-border">
                  <Icon className="size-4" strokeWidth={1.75} />
                </div>
                <div>
                  <div className="font-semibold">{t}</div>
                  <div className="text-muted-foreground">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <CodeWindow />
      </div>
    </section>
  )
}

function CodeWindow() {
  return (
    <div className="relative">
      <div
        className="ak-glow"
        style={{
          top: "-10%",
          right: "-5%",
          width: "60%",
          height: "60%",
          background: "var(--ak-glow-2)",
        }}
      />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-[oklch(0.18_0_0)] text-[oklch(0.93_0_0)] shadow-[0_30px_80px_-30px_var(--ak-glow-1)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="size-3 rounded-full bg-red-400/80" />
          <span className="size-3 rounded-full bg-yellow-400/80" />
          <span className="size-3 rounded-full bg-green-400/80" />
          <span className="ml-3 font-mono text-xs text-white/60">
            apollokit · ts-sdk
          </span>
          <span className="ml-auto font-mono text-[10px] text-white/40">
            production
          </span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
          <code>
            <CodeLine>
              <CodeComment>{"// 发一封带奖励的系统邮件给玩家"}</CodeComment>
            </CodeLine>
            <CodeLine>
              <CodeKW>import</CodeKW>{" "}
              <CodeVar>{"{ ApolloKit }"}</CodeVar>{" "}
              <CodeKW>from</CodeKW>{" "}
              <CodeStr>&quot;@apollokit/sdk&quot;</CodeStr>
            </CodeLine>
            <CodeLine />
            <CodeLine>
              <CodeKW>const</CodeKW> <CodeVar>ak</CodeVar> ={" "}
              <CodeKW>new</CodeKW>{" "}
              <CodeFn>ApolloKit</CodeFn>({"{"} <CodeVar>apiKey</CodeVar>:{" "}
              <CodeVar>process</CodeVar>.<CodeVar>env</CodeVar>.
              <CodeVar>AK_TOKEN</CodeVar> {"})"}
            </CodeLine>
            <CodeLine />
            <CodeLine>
              <CodeKW>await</CodeKW> <CodeVar>ak</CodeVar>.<CodeFn>mail</CodeFn>
              .<CodeFn>send</CodeFn>({"{"}
            </CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>userId</CodeVar>: <CodeStr>&quot;u_82f3a1&quot;</CodeStr>
              ,
            </CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>title</CodeVar>: <CodeStr>&quot;赛季结算奖励&quot;</CodeStr>
              ,
            </CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>attachments</CodeVar>: [
            </CodeLine>
            <CodeLine>
              {"    { "}
              <CodeVar>itemId</CodeVar>: <CodeStr>&quot;gem&quot;</CodeStr>,{" "}
              <CodeVar>count</CodeVar>: <CodeNum>500</CodeNum>
              {" },"}
            </CodeLine>
            <CodeLine>
              {"    { "}
              <CodeVar>itemId</CodeVar>:{" "}
              <CodeStr>&quot;skin_dragon&quot;</CodeStr>,{" "}
              <CodeVar>count</CodeVar>: <CodeNum>1</CodeNum>
              {" },"}
            </CodeLine>
            <CodeLine>{"  ],"}</CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>expireIn</CodeVar>: <CodeStr>&quot;7d&quot;</CodeStr>,
            </CodeLine>
            <CodeLine>{"})"}</CodeLine>
            <CodeLine />
            <CodeLine>
              <CodeComment>{"// → webhook 同时触发 inventory.granted"}</CodeComment>
            </CodeLine>
          </code>
        </pre>
      </div>
    </div>
  )
}

function CodeKW({ children }: { children: React.ReactNode }) {
  return <span className="text-[oklch(0.78_0.17_310)]">{children}</span>
}
function CodeVar({ children }: { children: React.ReactNode }) {
  return <span className="text-[oklch(0.86_0.12_220)]">{children}</span>
}
function CodeFn({ children }: { children: React.ReactNode }) {
  return <span className="text-[oklch(0.82_0.16_160)]">{children}</span>
}
function CodeStr({ children }: { children: React.ReactNode }) {
  return <span className="text-[oklch(0.82_0.16_80)]">{children}</span>
}
function CodeNum({ children }: { children: React.ReactNode }) {
  return <span className="text-[oklch(0.82_0.16_40)]">{children}</span>
}
function CodeComment({ children }: { children: React.ReactNode }) {
  return <span className="text-white/35">{children}</span>
}
function CodeLine({ children }: { children?: React.ReactNode }) {
  return <div>{children}&nbsp;</div>
}

function Stack() {
  const items = [
    {
      k: "全球就近响应",
      d: "服务自动分发到玩家最近的节点，东京、法兰克福、圣保罗都一样稳。",
    },
    {
      k: "零服务器运维",
      d: "没有机器要扩，没有数据库要调优。后台容量、可用性由平台负责。",
    },
    {
      k: "类型安全 SDK",
      d: "TypeScript / C# / Go 多语言 SDK。参数写错了编译器就会告诉你。",
    },
    {
      k: "安全身份与权限",
      d: "账号体系、项目协作、按模块分 scope 的 API Key，都内建在平台里。",
    },
    {
      k: "多环境一致",
      d: "Dev / Staging / Prod 同一套接口。开发、测试、上线不需要切规则。",
    },
    {
      k: "可审计、可回放",
      d: "每一笔资源变动、每一次活动触发都有记录，客诉、审计一查便知。",
    },
  ]
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionEyebrow>平台即产品</SectionEyebrow>
        <SectionTitle>底层那些脏活累活，你不用再操心。</SectionTitle>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          ApolloKit 不是又一个需要你自己维护的后台。服务器、数据库、身份、权限、扩缩容、容灾——
          全部由平台负责。你只需要关心玩法、美术、剧情这些真正让玩家留下来的东西。
        </p>

        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.k}
              className="group flex items-start gap-4 rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-foreground/30"
            >
              <Wand2 className="mt-0.5 size-5 shrink-0 text-[var(--ak-accent-2)]" strokeWidth={1.75} />
              <div>
                <div className="font-semibold">{it.k}</div>
                <div className="text-sm text-muted-foreground">{it.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-background via-background to-card px-8 py-14 text-center shadow-[0_40px_120px_-40px_var(--ak-glow-1)] md:px-12 md:py-20">
          <div
            className="ak-glow"
            style={{
              top: "-20%",
              left: "50%",
              transform: "translateX(-50%)",
              width: "60%",
              height: "60%",
              background: "var(--ak-glow-1)",
            }}
          />
          <div
            className="ak-glow"
            style={{
              bottom: "-20%",
              left: "20%",
              width: "40%",
              height: "40%",
              background: "var(--ak-glow-3)",
            }}
          />
          <div className="relative">
            <h2 className="text-3xl font-black tracking-tight md:text-5xl">
              让下一款游戏的后台
              <br />
              <span className="bg-gradient-to-r from-[var(--ak-accent)] via-[var(--ak-accent-2)] to-[var(--ak-accent-3)] bg-clip-text text-transparent">
                不再成为瓶颈。
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
              ApolloKit 免费开始使用。注册后立刻拿到一个控制台 + API Key，接入一个新项目只需一个下午。
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                render={
                  <Link to="/auth/$authView" params={{ authView: "sign-up" }}>
                    免费开始构建
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                }
                size="lg"
                className="h-12 px-6 text-base font-semibold"
              />
              <Button
                render={
                  <a href="/docs">
                    读文档
                  </a>
                }
                variant="outline"
                size="lg"
                className="h-12 px-6 text-base"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PricingPreview() {
  return (
    <section id="pricing" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <SectionEyebrow>定价 · 跟着你的成长一起长</SectionEyebrow>
            <SectionTitle>
              原型 500 MAU 永久免费，商业首发再升级。
            </SectionTitle>
            <p className="mt-5 max-w-2xl text-muted-foreground">
              按月活玩家 + 功能分层混合计价，不按 DAU。版本更新、开新服、节日冲榜带来的流量突刺，
              账单不会跟着抖动。
            </p>
          </div>
          <a
            href="/pricing"
            className="group inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-[var(--ak-accent-2)]"
          >
            查看完整定价 & 对比表
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PRICING_TIERS.map((plan) => (
            <div
              key={plan.id}
              className={
                "relative flex flex-col rounded-2xl border p-6 transition-all hover:-translate-y-0.5 " +
                (plan.highlighted
                  ? "border-foreground/50 bg-card shadow-[0_30px_80px_-30px_var(--ak-glow-1)]"
                  : "border-border bg-card/60 hover:border-foreground/30")
              }
            >
              {plan.highlighted && (
                <span className="absolute -top-2 right-6 rounded-full bg-[var(--ak-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-background">
                  推荐
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    {plan.id}
                  </div>
                  <h3 className="mt-1 text-xl font-bold tracking-tight">
                    {plan.name}
                  </h3>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>

              <div className="mt-6 flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight">
                  {plan.priceMonthly}
                </span>
                {plan.priceNote && (
                  <span className="text-xs text-muted-foreground">
                    {plan.priceNote}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm font-medium text-[var(--ak-accent-2)]">
                {plan.mauLabel}
              </div>

              <ul className="mt-5 space-y-2 text-sm">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-[var(--ak-accent-2)]"
                      strokeWidth={2.5}
                    />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-6">
                <Button
                  render={
                    <a href={plan.cta.href}>
                      {plan.cta.label}
                      <ArrowRight className="ml-1 size-3.5" />
                    </a>
                  }
                  variant={plan.highlighted ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Landing() {
  return (
    <MarketingShell>
      <Hero />
      <Capabilities />
      <ModuleMatrix />
      <Workflow />
      <CodeShowcase />
      <Stack />
      <PricingPreview />
      <FinalCTA />
    </MarketingShell>
  )
}
