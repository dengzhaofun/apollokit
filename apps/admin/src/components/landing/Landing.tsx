import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  ArrowLeftRight,
  BookOpen,
  CalendarCheck,
  Check,
  Coins,
  Contact,
  Database,
  Dices,
  FolderOpen,
  GalleryHorizontal,
  Gift,
  Globe,
  KeyRound,
  Layers,
  LayoutGrid,
  LineChart,
  ListTodo,
  Mail,
  Map as MapIcon,
  Medal,
  Megaphone,
  MessageSquareDashed,
  MessagesSquare,
  Package,
  PartyPopper,
  PieChart,
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
  WandSparkles,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react"

import * as m from "#/paraglide/messages.js"
import { Button } from "#/components/ui/button"

import MarketingShell, {
  SectionEyebrow,
  SectionTitle,
} from "./MarketingShell"
import { getPricingTiers } from "./pricing-plans"

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

function getModuleGroups(): ModuleGroup[] {
  return [
    {
      id: "economy",
      title: m.landing_module_economy_title(),
      subtitle: m.landing_module_economy_subtitle(),
      accent: "indigo",
      items: [
        { name: m.landing_module_item_name(), icon: Package, desc: m.landing_module_item_desc() },
        { name: m.landing_module_currency_name(), icon: Coins, desc: m.landing_module_currency_desc() },
        { name: m.landing_module_entity_name(), icon: Sparkles, desc: m.landing_module_entity_desc() },
        { name: m.landing_module_exchange_name(), icon: ArrowLeftRight, desc: m.landing_module_exchange_desc() },
        { name: m.landing_module_redeem_name(), icon: Ticket, desc: m.landing_module_redeem_desc() },
        { name: m.landing_module_shop_name(), icon: ShoppingCart, desc: m.landing_module_shop_desc() },
        { name: m.landing_module_storage_name(), icon: PiggyBank, desc: m.landing_module_storage_desc() },
        { name: m.landing_module_mail_name(), icon: Mail, desc: m.landing_module_mail_desc() },
      ],
    },
    {
      id: "operations",
      title: m.landing_module_ops_title(),
      subtitle: m.landing_module_ops_subtitle(),
      accent: "cyan",
      items: [
        { name: m.landing_module_checkin_name(), icon: CalendarCheck, desc: m.landing_module_checkin_desc() },
        { name: m.landing_module_banner_name(), icon: GalleryHorizontal, desc: m.landing_module_banner_desc() },
        { name: m.landing_module_announce_name(), icon: Megaphone, desc: m.landing_module_announce_desc() },
        { name: m.landing_module_event_name(), icon: PartyPopper, desc: m.landing_module_event_desc() },
        { name: m.landing_module_lottery_name(), icon: Dices, desc: m.landing_module_lottery_desc() },
        { name: m.landing_module_gift_name(), icon: Gift, desc: m.landing_module_gift_desc() },
        { name: m.landing_module_task_name(), icon: ListTodo, desc: m.landing_module_task_desc() },
      ],
    },
    {
      id: "content",
      title: m.landing_module_content_title(),
      subtitle: m.landing_module_content_subtitle(),
      accent: "fuchsia",
      items: [
        { name: m.landing_module_asset_name(), icon: FolderOpen, desc: m.landing_module_asset_desc() },
        { name: m.landing_module_dialogue_name(), icon: MessagesSquare, desc: m.landing_module_dialogue_desc() },
        { name: m.landing_module_encyclopedia_name(), icon: BookOpen, desc: m.landing_module_encyclopedia_desc() },
        { name: m.landing_module_level_name(), icon: MapIcon, desc: m.landing_module_level_desc() },
        { name: m.landing_module_eventcenter_name(), icon: Radio, desc: m.landing_module_eventcenter_desc() },
      ],
    },
    {
      id: "social",
      title: m.landing_module_social_title(),
      subtitle: m.landing_module_social_subtitle(),
      accent: "emerald",
      items: [
        { name: m.landing_module_friends_name(), icon: Users, desc: m.landing_module_friends_desc() },
        { name: m.landing_module_invite_name(), icon: UserPlus, desc: m.landing_module_invite_desc() },
        { name: m.landing_module_guild_name(), icon: Shield, desc: m.landing_module_guild_desc() },
        { name: m.landing_module_team_name(), icon: Swords, desc: m.landing_module_team_desc() },
        { name: m.landing_module_leaderboard_name(), icon: Trophy, desc: m.landing_module_leaderboard_desc() },
        { name: m.landing_module_ladder_name(), icon: Medal, desc: m.landing_module_ladder_desc() },
        { name: m.landing_module_player_name(), icon: Contact, desc: m.landing_module_player_desc() },
      ],
    },
  ]
}

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
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="ak-pulse inline-block size-1.5 rounded-full bg-[var(--ak-accent-2)]" />
            {m.landing_hero_badge()}
          </div>

          <div className="mt-3">
            <a
              href="#ai-copilot"
              className="group inline-flex items-center gap-2 rounded-full border border-[var(--ak-accent-2)]/40 bg-[var(--ak-accent-2)]/8 px-3.5 py-1.5 text-xs font-medium text-foreground/90 shadow-[0_8px_24px_-12px_var(--ak-glow-2)] backdrop-blur transition-colors hover:border-[var(--ak-accent-2)]/70 hover:bg-[var(--ak-accent-2)]/12"
            >
              <Sparkles
                className="size-3.5 text-[var(--ak-accent-2)]"
                strokeWidth={2}
              />
              <span>
                {m.landing_hero_copilot_badge({ n: 14 })}
              </span>
              <ArrowRight className="size-3 text-[var(--ak-accent-2)] transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <h1 className="mt-6 text-5xl font-black leading-[1.02] tracking-tight md:text-6xl lg:text-7xl">
            {m.landing_hero_h1_line1()}
            <br />
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-[var(--ak-accent)] via-[var(--ak-accent-2)] to-[var(--ak-accent-3)] bg-clip-text text-transparent">
                {m.landing_hero_h1_line2()}
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
            {m.landing_hero_desc({ count: "30" })}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              render={
                <Link to="/auth/$authView" params={{ authView: "sign-up" }}>
                  {m.landing_hero_cta_primary()}
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              }
              size="lg"
              className="h-12 px-6 text-base font-semibold"
            />
            <Button
              render={
                <a href="#modules">
                  {m.landing_hero_cta_modules()}
                  <ArrowRight className="ml-1 size-4" />
                </a>
              }
              variant="outline"
              size="lg"
              className="h-12 px-6 text-base"
            />
            <Button
              render={
                <a href="#ai-copilot">
                  <Sparkles className="mr-1 size-4 text-[var(--ak-accent-2)]" />
                  {m.landing_hero_cta_copilot()}
                </a>
              }
              variant="ghost"
              size="lg"
              className="h-12 px-4 text-base text-foreground/80 hover:text-foreground"
            />
          </div>

          {/* Stats strip */}
          <dl className="mt-12 grid max-w-xl grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
            {[
              { k: "30+", v: m.landing_hero_stat_modules() },
              { k: "4", v: m.landing_hero_stat_steps() },
              { k: m.landing_hero_stat_global(), v: m.landing_hero_stat_global_sub() },
              { k: "14", v: m.landing_hero_stat_ai() },
            ].map((s) => (
              <div key={s.v}>
                <dt className="text-3xl font-black tracking-tight text-foreground">
                  {s.k}
                </dt>
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
        <SectionEyebrow>{m.landing_capabilities_eyebrow()}</SectionEyebrow>
        <SectionTitle>
          {m.landing_capabilities_title()}
        </SectionTitle>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <CapabilityCard
            icon={Coins}
            tag="economy"
            title={m.landing_cap_economy_title()}
            desc={m.landing_cap_economy_desc()}
          />
          <CapabilityCard
            icon={PartyPopper}
            tag="liveops"
            title={m.landing_cap_liveops_title()}
            desc={m.landing_cap_liveops_desc()}
          />
          <CapabilityCard
            icon={BookOpen}
            tag="content"
            title={m.landing_cap_content_title()}
            desc={m.landing_cap_content_desc()}
          />
          <CapabilityCard
            icon={Users}
            tag="social"
            title={m.landing_cap_social_title()}
            desc={m.landing_cap_social_desc()}
          />
          <CapabilityCard
            icon={Activity}
            tag="analytics"
            title={m.landing_cap_analytics_title()}
            desc={m.landing_cap_analytics_desc()}
          />
          <CapabilityCard
            icon={Plug}
            tag="sdk"
            title={m.landing_cap_sdk_title()}
            desc={m.landing_cap_sdk_desc()}
          />
        </div>
      </div>
    </section>
  )
}

function ModuleMatrix() {
  const moduleGroups = getModuleGroups()
  return (
    <section id="modules" className="relative py-24">
      <div className="absolute inset-0 ak-dots-bg opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionEyebrow>{m.landing_modules_eyebrow()}</SectionEyebrow>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle>
            {m.landing_modules_title_line1()}
            <br className="hidden md:block" />
            {m.landing_modules_title_line2()}
          </SectionTitle>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
            <LayoutGrid className="size-4" />
            {m.landing_modules_hint()}
          </div>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {moduleGroups.map((group) => (
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
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <div
                      key={item.name}
                      className="ak-tile group flex flex-col gap-2 rounded-xl border border-border bg-background/70 p-3 transition-colors hover:border-foreground/30"
                      tabIndex={0}
                    >
                      <div className="flex items-center gap-2">
                        <div className="grid size-7 place-items-center rounded-md bg-foreground/5 text-foreground ring-1 ring-inset ring-border">
                          <Icon className="size-4" strokeWidth={1.75} />
                        </div>
                        <span className="text-sm font-semibold">{item.name}</span>
                      </div>
                      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {item.desc}
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
      title: m.landing_workflow_step1_title(),
      body: m.landing_workflow_step1_body(),
    },
    {
      k: "02",
      title: m.landing_workflow_step2_title(),
      body: m.landing_workflow_step2_body(),
    },
    {
      k: "03",
      title: m.landing_workflow_step3_title(),
      body: m.landing_workflow_step3_body(),
    },
    {
      k: "04",
      title: m.landing_workflow_step4_title(),
      body: m.landing_workflow_step4_body(),
    },
  ]

  return (
    <section id="workflow" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionEyebrow>{m.landing_workflow_eyebrow()}</SectionEyebrow>
        <SectionTitle>{m.landing_workflow_title()}</SectionTitle>

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

function AICopilot() {
  const bullets: Array<{
    icon: LucideIcon
    kicker?: string
    title: string
    desc: string
  }> = [
    {
      icon: Layers,
      kicker: "14",
      title: m.landing_copilot_feat_coverage_title(),
      desc: m.landing_copilot_feat_coverage_desc(),
    },
    {
      icon: WandSparkles,
      title: m.landing_copilot_feat_autofill_title(),
      desc: m.landing_copilot_feat_autofill_desc(),
    },
    {
      icon: MessageSquareDashed,
      title: m.landing_copilot_feat_persist_title(),
      desc: m.landing_copilot_feat_persist_desc(),
    },
    {
      icon: BookOpen,
      title: m.landing_copilot_feat_docs_title(),
      desc: m.landing_copilot_feat_docs_desc(),
    },
  ]

  return (
    <section id="ai-copilot" className="relative py-24">
      <div
        className="ak-glow"
        style={{
          top: "10%",
          right: "-6%",
          width: "55%",
          height: "55%",
          background: "var(--ak-glow-2)",
        }}
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <SectionEyebrow>{m.landing_copilot_eyebrow()}</SectionEyebrow>
          <SectionTitle>
            {m.landing_copilot_title_line1()}
            <br className="hidden md:block" />
            {m.landing_copilot_title_line2()}
          </SectionTitle>
          <p className="mt-5 max-w-xl text-muted-foreground">
            {m.landing_copilot_desc()}
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {bullets.map(({ icon: Icon, kicker, title, desc }) => (
              <div
                key={title}
                className="ak-tile group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-foreground/30"
              >
                <div
                  className="absolute inset-x-0 top-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, var(--ak-accent-2), transparent)",
                  }}
                  aria-hidden
                />
                <div className="flex items-start justify-between">
                  {kicker ? (
                    <span className="bg-gradient-to-r from-[var(--ak-accent)] via-[var(--ak-accent-2)] to-[var(--ak-accent-3)] bg-clip-text text-5xl font-black leading-none tracking-tight text-transparent">
                      {kicker}
                    </span>
                  ) : (
                    <div className="grid size-10 place-items-center rounded-xl bg-foreground/5 text-foreground ring-1 ring-border group-hover:bg-[var(--ak-accent-2)]/10 group-hover:text-[var(--ak-accent-2)]">
                      <Icon className="size-5" strokeWidth={1.75} />
                    </div>
                  )}
                  {kicker && (
                    <Sparkles
                      className="size-4 text-[var(--ak-accent-2)]"
                      strokeWidth={1.75}
                    />
                  )}
                </div>
                <h3 className="mt-4 text-base font-bold tracking-tight">
                  {title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <CopilotMock />
      </div>
    </section>
  )
}

function CopilotMock() {
  return (
    <div className="relative">
      {/* mini console */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 shadow-[0_30px_80px_-30px_var(--ak-glow-2)] backdrop-blur-sm">
        <div className="flex items-center gap-2 border-b border-border/70 bg-background/40 px-4 py-3">
          <span className="size-3 rounded-full bg-red-400/80" />
          <span className="size-3 rounded-full bg-yellow-400/80" />
          <span className="size-3 rounded-full bg-green-400/80" />
          <span className="ml-3 truncate font-mono text-xs text-muted-foreground">
            {m.landing_copilot_mock_titlebar()}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            <span className="ak-pulse inline-block size-1.5 rounded-full bg-[var(--ak-accent-2)]" />
            {m.landing_copilot_mock_status()}
          </span>
        </div>

        <div className="space-y-3 p-5">
          <MockField label={m.landing_copilot_mock_field_name()} value={m.landing_copilot_mock_field_name_value()} />
          <MockField
            label={m.landing_copilot_mock_field_cycle()}
            value={m.landing_copilot_mock_field_cycle_value()}
            aiFilled
          />
          <MockField
            label={m.landing_copilot_mock_field_multiplier()}
            value={m.landing_copilot_mock_field_multiplier_value()}
            aiFilled
          />
          <MockField label={m.landing_copilot_mock_field_segment()} value={m.landing_copilot_mock_field_segment_value()} />
        </div>
      </div>

      {/* connector dashes (sm+) */}
      <svg
        className="pointer-events-none absolute -bottom-2 right-12 hidden h-20 w-28 sm:block"
        viewBox="0 0 112 80"
        fill="none"
        aria-hidden
      >
        <path
          d="M4 8 Q 56 8 60 50 T 108 76"
          stroke="var(--ak-accent-2)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          strokeLinecap="round"
          opacity="0.45"
          fill="none"
        />
      </svg>

      {/* AI chat bubble: sm+ floats bottom-right, mobile stacks below */}
      <div className="relative mt-4 sm:absolute sm:-bottom-8 sm:right-[-12px] sm:mt-0 sm:w-[300px]">
        <div className="rounded-2xl border border-border bg-background p-4 shadow-[0_30px_80px_-20px_var(--ak-glow-2)] ring-1 ring-[var(--ak-accent-2)]/30">
          <div className="text-xs leading-relaxed">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              you
            </span>
            <p className="mt-1 text-foreground/80">
              {m.landing_copilot_mock_user_message()}
            </p>
          </div>
          <div className="mt-3 flex items-start gap-2 border-t border-border/70 pt-3">
            <Sparkles
              className="mt-0.5 size-4 shrink-0 text-[var(--ak-accent-2)]"
              strokeWidth={1.75}
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {m.landing_copilot_mock_ai_response()}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {m.landing_copilot_mock_ai_detail()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockField({
  label,
  value,
  aiFilled = false,
}: {
  label: string
  value: string
  aiFilled?: boolean
}) {
  return (
    <div
      className={
        "relative rounded-md border bg-background/60 px-3 py-2 transition-colors " +
        (aiFilled
          ? "border-[var(--ak-accent-2)]/40 ring-1 ring-[var(--ak-accent-2)]/20"
          : "border-border")
      }
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-foreground">
        {value}
      </div>
      {aiFilled && (
        <Sparkles
          className="absolute right-2 top-2 size-3 text-[var(--ak-accent-2)]"
          strokeWidth={2}
        />
      )}
    </div>
  )
}

function AnalyticsPreview() {
  const bullets: Array<{ icon: LucideIcon; t: string; d: string }> = [
    {
      icon: Activity,
      t: m.landing_analytics_feat_ingest_title(),
      d: m.landing_analytics_feat_ingest_desc(),
    },
    {
      icon: LineChart,
      t: m.landing_analytics_feat_funnel_title(),
      d: m.landing_analytics_feat_funnel_desc(),
    },
    {
      icon: PieChart,
      t: m.landing_analytics_feat_ab_title(),
      d: m.landing_analytics_feat_ab_desc(),
    },
    {
      icon: Zap,
      t: m.landing_analytics_feat_api_title(),
      d: m.landing_analytics_feat_api_desc(),
    },
  ]
  return (
    <section id="analytics" className="relative py-24">
      <div
        className="ak-glow"
        style={{
          bottom: "10%",
          left: "-6%",
          width: "55%",
          height: "55%",
          background: "var(--ak-glow-1)",
        }}
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <SectionEyebrow>{m.landing_analytics_eyebrow()}</SectionEyebrow>
          <SectionTitle>
            {m.landing_analytics_title_line1()}
            <br className="hidden md:block" />
            {m.landing_analytics_title_line2()}
          </SectionTitle>
          <p className="mt-5 max-w-xl text-muted-foreground">
            {m.landing_analytics_desc()}
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {bullets.map(({ icon: Icon, t, d }) => (
              <div
                key={t}
                className="rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-foreground/30"
              >
                <div className="grid size-10 place-items-center rounded-xl bg-foreground/5 text-foreground ring-1 ring-border">
                  <Icon className="size-5" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 text-base font-bold tracking-tight">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {d}
                </p>
              </div>
            ))}
          </div>
        </div>

        <AnalyticsMock />
      </div>
    </section>
  )
}

function AnalyticsMock() {
  const kpis = [
    { k: m.landing_analytics_mock_kpi_dau(), v: "12,481", d: "+8.4%" },
    { k: m.landing_analytics_mock_kpi_retention(), v: "38%", d: "+2.1pt" },
    { k: m.landing_analytics_mock_kpi_arpu(), v: "¥4.2", d: "+12%" },
  ]
  const funnel = [
    { name: m.landing_analytics_mock_funnel_register(), pct: 100, count: "32,140" },
    { name: m.landing_analytics_mock_funnel_tutorial(), pct: 76, count: "24,426" },
    { name: m.landing_analytics_mock_funnel_firstpay(), pct: 18, count: "5,785" },
    { name: m.landing_analytics_mock_funnel_d7(), pct: 38, count: "12,213" },
  ]
  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 shadow-[0_30px_80px_-30px_var(--ak-glow-1)] backdrop-blur-sm">
        <div className="flex items-center gap-2 border-b border-border/70 bg-background/40 px-4 py-3">
          <span className="size-3 rounded-full bg-red-400/80" />
          <span className="size-3 rounded-full bg-yellow-400/80" />
          <span className="size-3 rounded-full bg-green-400/80" />
          <span className="ml-3 truncate font-mono text-xs text-muted-foreground">
            {m.landing_analytics_mock_titlebar()}
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            <span className="ak-pulse inline-block size-1.5 rounded-full bg-[var(--ak-accent-2)]" />
            {m.landing_analytics_mock_status()}
          </span>
        </div>

        <div className="space-y-5 p-5">
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            {kpis.map((k) => (
              <div
                key={k.k}
                className="rounded-xl border border-border bg-background/60 p-3"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {k.k}
                </div>
                <div className="mt-1 text-2xl font-black tracking-tight">
                  {k.v}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-emerald-500">
                  {k.d}
                </div>
              </div>
            ))}
          </div>

          {/* Sparkline */}
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-xs font-semibold">{m.landing_analytics_mock_chart_title()}</div>
              <div className="flex gap-3 font-mono text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-[var(--ak-accent)]" />
                  {m.landing_analytics_mock_chart_legend_dau()}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-[var(--ak-accent-2)]" />
                  {m.landing_analytics_mock_chart_legend_paying()}
                </span>
              </div>
            </div>
            <svg
              viewBox="0 0 320 80"
              className="h-20 w-full"
              preserveAspectRatio="none"
              aria-hidden
            >
              {/* grid baseline */}
              <line
                x1="0"
                y1="60"
                x2="320"
                y2="60"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.08"
                strokeDasharray="2 4"
              />
              {/* main curve (DAU) */}
              <path
                d="M0 55 L 25 50 L 50 52 L 75 42 L 100 38 L 125 30 L 150 28 L 175 32 L 200 24 L 225 22 L 250 18 L 275 16 L 300 14 L 320 18"
                fill="none"
                stroke="var(--ak-accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* DAU area fill */}
              <path
                d="M0 55 L 25 50 L 50 52 L 75 42 L 100 38 L 125 30 L 150 28 L 175 32 L 200 24 L 225 22 L 250 18 L 275 16 L 300 14 L 320 18 L 320 80 L 0 80 Z"
                fill="var(--ak-accent)"
                opacity="0.08"
              />
              {/* paying curve */}
              <path
                d="M0 70 L 25 68 L 50 65 L 75 62 L 100 60 L 125 56 L 150 58 L 175 52 L 200 50 L 225 48 L 250 44 L 275 42 L 300 38 L 320 40"
                fill="none"
                stroke="var(--ak-accent-2)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Funnel */}
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-xs font-semibold">{m.landing_analytics_mock_funnel_title()}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                32,140 {m.landing_analytics_mock_funnel_register()}
              </div>
            </div>
            <div className="space-y-2">
              {funnel.map((s) => (
                <div key={s.name} className="flex items-center gap-3">
                  <div className="w-16 shrink-0 truncate text-[11px] text-muted-foreground">
                    {s.name}
                  </div>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-foreground/5">
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-[var(--ak-accent)] via-[var(--ak-accent-2)] to-[var(--ak-accent-3)]/70"
                      style={{ width: `${s.pct}%` }}
                    />
                    <div className="relative z-10 flex h-full items-center px-2 font-mono text-[10px] font-semibold text-foreground/90 mix-blend-luminosity">
                      {s.pct}%
                    </div>
                  </div>
                  <div className="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                    {s.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CodeShowcase() {
  return (
    <section id="developer" className="relative py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <SectionEyebrow>{m.landing_dev_eyebrow()}</SectionEyebrow>
          <SectionTitle>{m.landing_dev_title()}</SectionTitle>
          <p className="mt-5 max-w-xl text-muted-foreground">
            {m.landing_dev_desc()}
          </p>

          <ul className="mt-8 space-y-4 text-sm">
            {[
              { icon: Plug, t: m.landing_dev_feat_sdk_title(), d: m.landing_dev_feat_sdk_desc() },
              { icon: KeyRound, t: m.landing_dev_feat_apikey_title(), d: m.landing_dev_feat_apikey_desc() },
              { icon: Zap, t: m.landing_dev_feat_events_title(), d: m.landing_dev_feat_events_desc() },
              { icon: Globe, t: m.landing_dev_feat_global_title(), d: m.landing_dev_feat_global_desc() },
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
              <CodeComment>{m.landing_dev_code_comment()}</CodeComment>
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
              <CodeVar>title</CodeVar>: <CodeStr>&quot;Season Settlement Reward&quot;</CodeStr>
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
              <CodeComment>{"// → webhook fires inventory.granted"}</CodeComment>
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

function EventsAndWebhooks() {
  return (
    <section id="events" className="relative py-24">
      <div className="absolute inset-0 ak-dots-bg opacity-50" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <SectionEyebrow>{m.landing_events_eyebrow()}</SectionEyebrow>
          <SectionTitle>
            {m.landing_events_title_line1()}
            <br className="hidden md:block" />
            {m.landing_events_title_line2()}
          </SectionTitle>
          <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
            {m.landing_events_desc()}
          </p>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <EventFlowDiagram />
          <WebhookCodeWindow />
        </div>
      </div>
    </section>
  )
}

function EventFlowDiagram() {
  const targets: Array<{
    icon: LucideIcon
    title: string
    sub: string
  }> = [
    {
      icon: Webhook,
      title: m.landing_events_target_server_title(),
      sub: m.landing_events_target_server_sub(),
    },
    {
      icon: Zap,
      title: m.landing_events_target_trigger_title(),
      sub: m.landing_events_target_trigger_sub(),
    },
    {
      icon: Database,
      title: m.landing_events_target_warehouse_title(),
      sub: m.landing_events_target_warehouse_sub(),
    },
  ]
  const otherEvents = [
    "mail.sent",
    "lottery.drawn",
    "mission.completed",
    "shop.purchased",
    "guild.joined",
    m.landing_events_other_count(),
  ]

  return (
    <div className="relative">
      <div className="relative rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm md:p-8">
        {/* central event chip */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--ak-accent-2)]/60 bg-background px-4 py-2.5 font-mono text-sm font-semibold shadow-[0_10px_30px_-12px_var(--ak-glow-2)]">
            <Radio
              className="size-4 text-[var(--ak-accent-2)]"
              strokeWidth={2}
            />
            inventory.granted
          </div>
        </div>

        {/* connector SVG */}
        <svg
          viewBox="0 0 400 64"
          preserveAspectRatio="none"
          className="mt-3 h-12 w-full"
          aria-hidden
        >
          <defs>
            <marker
              id="ev-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0 L 10 5 L 0 10 Z" fill="var(--ak-accent-2)" />
            </marker>
          </defs>
          <path
            d="M200 0 Q 200 32 67 56"
            stroke="var(--ak-accent-2)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            fill="none"
            markerEnd="url(#ev-arrow)"
            opacity="0.6"
          />
          <path
            d="M200 0 L 200 56"
            stroke="var(--ak-accent-2)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            fill="none"
            markerEnd="url(#ev-arrow)"
            opacity="0.6"
          />
          <path
            d="M200 0 Q 200 32 333 56"
            stroke="var(--ak-accent-2)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            fill="none"
            markerEnd="url(#ev-arrow)"
            opacity="0.6"
          />
        </svg>

        {/* three target cards */}
        <div className="grid grid-cols-3 gap-3">
          {targets.map(({ icon: Icon, title, sub }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-background/70 p-3 text-center"
            >
              <div className="mx-auto grid size-10 place-items-center rounded-lg bg-foreground/5 text-foreground ring-1 ring-border">
                <Icon className="size-4" strokeWidth={1.75} />
              </div>
              <div className="mt-2 text-xs font-bold tracking-tight">
                {title}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
                {sub}
              </div>
            </div>
          ))}
        </div>

        {/* other subscribable events chips */}
        <div className="mt-7 border-t border-border/60 pt-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {m.landing_events_also_subscribe()}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {otherEvents.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-full border border-border bg-background/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function WebhookCodeWindow() {
  return (
    <div className="relative">
      <div
        className="ak-glow"
        style={{
          top: "-10%",
          right: "-5%",
          width: "55%",
          height: "55%",
          background: "var(--ak-glow-2)",
        }}
      />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-[oklch(0.18_0_0)] text-[oklch(0.93_0_0)] shadow-[0_30px_80px_-30px_var(--ak-glow-1)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <span className="size-3 rounded-full bg-red-400/80" />
          <span className="size-3 rounded-full bg-yellow-400/80" />
          <span className="size-3 rounded-full bg-green-400/80" />
          <span className="ml-3 truncate font-mono text-xs text-white/60">
            POST · /webhooks/inventory
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-white/40">
            production
          </span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed">
          <code>
            <CodeLine>
              <CodeComment>{m.landing_events_webhook_comment()}</CodeComment>
            </CodeLine>
            <CodeLine>
              <CodeVar>X-ApolloKit-Event</CodeVar>:{" "}
              <CodeStr>&quot;inventory.granted&quot;</CodeStr>
            </CodeLine>
            <CodeLine>
              <CodeVar>X-ApolloKit-Signature</CodeVar>:{" "}
              <CodeStr>&quot;sha256=a1b2c3d4…&quot;</CodeStr>
            </CodeLine>
            <CodeLine>
              <CodeVar>X-ApolloKit-Delivery</CodeVar>:{" "}
              <CodeStr>&quot;7c1d-46f2-…&quot;</CodeStr>
            </CodeLine>
            <CodeLine />
            <CodeLine>{"{"}</CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>&quot;event&quot;</CodeVar>:{" "}
              <CodeStr>&quot;inventory.granted&quot;</CodeStr>,
            </CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>&quot;userId&quot;</CodeVar>:{" "}
              <CodeStr>&quot;u_82f3a1&quot;</CodeStr>,
            </CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>&quot;items&quot;</CodeVar>: [
            </CodeLine>
            <CodeLine>
              {"    { "}
              <CodeVar>&quot;itemId&quot;</CodeVar>:{" "}
              <CodeStr>&quot;gem&quot;</CodeStr>,{" "}
              <CodeVar>&quot;count&quot;</CodeVar>: <CodeNum>500</CodeNum>
              {" },"}
            </CodeLine>
            <CodeLine>{"  ],"}</CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>&quot;source&quot;</CodeVar>: {"{ "}
              <CodeVar>&quot;module&quot;</CodeVar>:{" "}
              <CodeStr>&quot;mail&quot;</CodeStr>,{" "}
              <CodeVar>&quot;id&quot;</CodeVar>:{" "}
              <CodeStr>&quot;m_a4e1&quot;</CodeStr>
              {" },"}
            </CodeLine>
            <CodeLine>
              {"  "}
              <CodeVar>&quot;ts&quot;</CodeVar>: <CodeNum>1730482156</CodeNum>
            </CodeLine>
            <CodeLine>{"}"}</CodeLine>
          </code>
        </pre>
      </div>
    </div>
  )
}

function Stack() {
  const items = [
    {
      k: m.landing_stack_global_title(),
      d: m.landing_stack_global_desc(),
    },
    {
      k: m.landing_stack_serverless_title(),
      d: m.landing_stack_serverless_desc(),
    },
    {
      k: m.landing_stack_sdk_title(),
      d: m.landing_stack_sdk_desc(),
    },
    {
      k: m.landing_stack_auth_title(),
      d: m.landing_stack_auth_desc(),
    },
    {
      k: m.landing_stack_ai_title(),
      d: m.landing_stack_ai_desc(),
    },
    {
      k: m.landing_stack_audit_title(),
      d: m.landing_stack_audit_desc(),
    },
  ]
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionEyebrow>{m.landing_stack_eyebrow()}</SectionEyebrow>
        <SectionTitle>{m.landing_stack_title()}</SectionTitle>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          {m.landing_stack_desc()}
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
              {m.landing_cta_h2_line1()}
              <br />
              <span className="bg-gradient-to-r from-[var(--ak-accent)] via-[var(--ak-accent-2)] to-[var(--ak-accent-3)] bg-clip-text text-transparent">
                {m.landing_cta_h2_line2()}
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
              {m.landing_cta_desc()}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button
                render={
                  <Link to="/auth/$authView" params={{ authView: "sign-up" }}>
                    {m.landing_cta_primary()}
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                }
                size="lg"
                className="h-12 px-6 text-base font-semibold"
              />
              <Button
                render={
                  <a href="/docs">
                    {m.landing_cta_secondary()}
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
  const pricingTiers = getPricingTiers()
  return (
    <section id="pricing" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <SectionEyebrow>{m.landing_pricing_eyebrow()}</SectionEyebrow>
            <SectionTitle>
              {m.landing_pricing_title()}
            </SectionTitle>
            <p className="mt-5 max-w-2xl text-muted-foreground">
              {m.landing_pricing_desc()}
            </p>
          </div>
          <a
            href="/pricing"
            className="group inline-flex items-center gap-1 text-sm font-semibold text-foreground hover:text-[var(--ak-accent-2)]"
          >
            {m.landing_pricing_see_full()}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {pricingTiers.map((plan) => (
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
                  {m.landing_pricing_recommended()}
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
      <AICopilot />
      <AnalyticsPreview />
      <CodeShowcase />
      <EventsAndWebhooks />
      <Stack />
      <PricingPreview />
      <FinalCTA />
    </MarketingShell>
  )
}
