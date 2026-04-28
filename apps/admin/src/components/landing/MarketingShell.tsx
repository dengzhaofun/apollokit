import { Link } from "@tanstack/react-router"
import { ArrowRight, Github } from "lucide-react"

import { ConsentSettingsButton } from "#/components/consent/ConsentLayer"
import ThemeToggle from "#/components/ThemeToggle"
import { Button } from "#/components/ui/button"
import { getLocale } from "#/paraglide/runtime.js"

const t = (zh: string, en: string) => (getLocale() === "zh" ? zh : en)

import "./landing.css"

/* -------------------------------------------------------------------------- */
/*  Shared marketing primitives                                               */
/* -------------------------------------------------------------------------- */

export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1 text-xs font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full bg-[var(--ak-accent)]" />
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
      {children}
    </h2>
  )
}

/* -------------------------------------------------------------------------- */
/*  Nav + Footer                                                              */
/* -------------------------------------------------------------------------- */

const NAV_LINKS: Array<{ label: string; href: string; type: "anchor" | "route" }> = [
  { label: "平台", href: "/#platform", type: "anchor" },
  { label: "模块", href: "/#modules", type: "anchor" },
  { label: "工作流", href: "/#workflow", type: "anchor" },
  { label: "开发者", href: "/#developer", type: "anchor" },
  { label: "定价", href: "/pricing", type: "route" },
  { label: "文档", href: "/docs", type: "route" },
]

function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid size-7 overflow-hidden place-items-center rounded-lg bg-white">
            <img src="/logo192.png" alt="ApolloKit" className="size-full object-contain" />
          </span>
          <span>ApolloKit</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button
            render={
              <Link to="/auth/$authView" params={{ authView: "sign-in" }}>
                登录
              </Link>
            }
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          />
          <Button
            render={
              <Link to="/auth/$authView" params={{ authView: "sign-up" }}>
                免费开始
                <ArrowRight className="ml-1 size-3.5" />
              </Link>
            }
            size="sm"
            className="font-semibold"
          />
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-12">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-[2fr_1fr_1fr_1fr]">
        {/* Brand 列 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-black tracking-tight">
            <span className="grid size-7 overflow-hidden place-items-center rounded-lg bg-white">
              <img src="/logo192.png" alt="ApolloKit" className="size-full object-contain" />
            </span>
            <span>ApolloKit</span>
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("通用游戏后端,一个 SDK 接入就够。", "Universal game backend — one SDK away.")}
          </p>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} ApolloKit
          </p>
        </div>

        {/* 产品列 */}
        <div className="space-y-3 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("产品", "Product")}
          </h3>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <a href="/pricing" className="hover:text-foreground">
                {t("定价", "Pricing")}
              </a>
            </li>
            <li>
              <a href="/docs" className="hover:text-foreground">
                {t("文档", "Docs")}
              </a>
            </li>
            <li>
              <a
                href="https://github.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Github className="size-4" /> GitHub
              </a>
            </li>
          </ul>
        </div>

        {/* 法律列 */}
        <div className="space-y-3 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("法律", "Legal")}
          </h3>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <a href="/privacy" className="hover:text-foreground">
                {t("隐私政策", "Privacy")}
              </a>
            </li>
            <li>
              <a href="/terms" className="hover:text-foreground">
                {t("服务条款", "Terms")}
              </a>
            </li>
            <li>
              <a href="/privacy#cookies" className="hover:text-foreground">
                {t("Cookie 政策", "Cookies")}
              </a>
            </li>
            <li>
              <a href="/subprocessors" className="hover:text-foreground">
                {t("子处理者", "Subprocessors")}
              </a>
            </li>
            <li>
              <a href="/dpa" className="hover:text-foreground">
                {t("DPA", "DPA")}
              </a>
            </li>
          </ul>
        </div>

        {/* 偏好列 */}
        <div className="space-y-3 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("偏好", "Preferences")}
          </h3>
          <div className="-ml-3">
            <ConsentSettingsButton>
              {t("Cookie 设置", "Cookie settings")}
            </ConsentSettingsButton>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* -------------------------------------------------------------------------- */
/*  Shell                                                                     */
/* -------------------------------------------------------------------------- */

export default function MarketingShell({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="ak-landing min-h-screen bg-background text-foreground">
      <TopNav />
      {children}
      <Footer />
    </div>
  )
}
