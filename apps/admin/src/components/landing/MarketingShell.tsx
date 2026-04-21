import { Link } from "@tanstack/react-router"
import { ArrowRight, Github } from "lucide-react"

import ThemeToggle from "#/components/ThemeToggle"
import { Button } from "#/components/ui/button"

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
          <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
            <span className="text-[11px] font-black">AK</span>
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
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/auth/$authView" params={{ authView: "sign-in" }}>
              登录
            </Link>
          </Button>
          <Button asChild size="sm" className="font-semibold">
            <Link to="/auth/$authView" params={{ authView: "sign-up" }}>
              免费开始
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:px-6 md:flex-row md:items-center">
        <div className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
            <span className="text-[11px] font-black">AK</span>
          </span>
          <span>ApolloKit</span>
          <span className="ml-3 text-sm font-normal text-muted-foreground">
            · 通用游戏后端，一个 SDK 接入就够
          </span>
        </div>
        <div className="flex items-center gap-5 text-sm text-muted-foreground">
          <a href="/pricing" className="hover:text-foreground">
            定价
          </a>
          <a href="/docs" className="hover:text-foreground">
            文档
          </a>
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Github className="size-4" /> GitHub
          </a>
          <span>© {new Date().getFullYear()} ApolloKit</span>
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
