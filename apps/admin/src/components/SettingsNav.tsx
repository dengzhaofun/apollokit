import { useLocation, Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  Building2,
  FolderKanban,
  KeyRound,
  MailPlus,
  ShieldCheck,
  UserCircle,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react"

import { cn } from "#/lib/utils"
import * as m from "../paraglide/messages.js"

type SettingsNavItem = {
  title: () => string
  to:
    | "/settings/account"
    | "/settings/organization"
    | "/settings/organization/members"
    | "/settings/organization/invitations"
    | "/settings/organization/danger"
    | "/settings/project"
    | "/settings/project/members"
    | "/settings/project/roles"
    | "/settings/project/danger"
    | "/settings/api-keys"
    | "/settings/webhooks"
  icon: LucideIcon
  /** 标记为 destructive 的项渲染时染红(危险区)。 */
  destructive?: boolean
}

type SettingsNavSection = {
  key: "personal" | "organization" | "project"
  label: () => string
  items: SettingsNavItem[]
}

function getSections(): SettingsNavSection[] {
  return [
    {
      key: "personal",
      label: m.settings_section_personal,
      items: [
        {
          title: m.settings_account,
          to: "/settings/account",
          icon: UserCircle,
        },
      ],
    },
    {
      key: "organization",
      // Org-level: 概览 / 成员 / 邀请 / 危险区。
      // 当前组织作用域(billing 待实现暂不放)。
      label: () => "Organization",
      items: [
        {
          title: () => "概览",
          to: "/settings/organization",
          icon: Building2,
        },
        {
          title: () => "成员",
          to: "/settings/organization/members",
          icon: Users,
        },
        {
          title: () => "邀请",
          to: "/settings/organization/invitations",
          icon: MailPlus,
        },
        {
          title: () => "危险区",
          to: "/settings/organization/danger",
          icon: AlertTriangle,
          destructive: true,
        },
      ],
    },
    {
      key: "project",
      // Project (= Better Auth team) level — 概览/成员/角色/API 密钥/Webhooks/危险区。
      label: m.settings_section_project,
      items: [
        {
          title: m.nav_project_settings,
          to: "/settings/project",
          icon: FolderKanban,
        },
        {
          title: () => "成员",
          to: "/settings/project/members",
          icon: Users,
        },
        {
          title: () => "角色",
          to: "/settings/project/roles",
          icon: ShieldCheck,
        },
        {
          title: m.nav_api_keys,
          to: "/settings/api-keys",
          icon: KeyRound,
        },
        {
          title: m.nav_webhooks,
          to: "/settings/webhooks",
          icon: Webhook,
        },
        {
          title: () => "危险区",
          to: "/settings/project/danger",
          icon: AlertTriangle,
          destructive: true,
        },
      ],
    },
  ]
}

export function SettingsNav() {
  const sections = getSections()
  const { pathname } = useLocation()
  // 拍平 sections → items,移动端水平 tab 用
  const flatItems = sections.flatMap((s) => s.items)

  // Active match —— `/settings/project/roles` 不应让 `/settings/project`
  // 也亮起来。规则:在所有匹配的 item 里,选 item.to 最长那一条 active,
  // 其它即使 prefix 匹配也不算。这是 Linear/Sentry sidebar 的标准行为。
  const allItems = sections.flatMap((s) => s.items)
  const activeItem = allItems
    .filter(
      (i) => pathname === i.to || pathname.startsWith(`${i.to}/`),
    )
    .sort((a, b) => b.to.length - a.to.length)[0]
  const isActiveItem = (to: string) => activeItem?.to === to

  return (
    <>
      {/* 移动端:横向 scroll 的 tab bar(<md 显示) */}
      <nav
        aria-label={m.settings_title()}
        className="flex flex-col gap-2 border-b pb-3 md:hidden"
      >
        <h2 className="px-1 text-base font-semibold tracking-tight">
          {m.settings_title()}
        </h2>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {flatItems.map((item) => {
            const isActive = isActiveItem(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "border-brand bg-accent font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <item.icon className={cn("size-4", isActive && "text-brand")} />
                <span className="whitespace-nowrap">{item.title()}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* 桌面 >=md:左侧 sidebar 形态 */}
      <nav
        aria-label={m.settings_title()}
        className="hidden w-56 shrink-0 border-r bg-background pr-4 md:block"
      >
        <div className="px-2 pb-4">
          <h2 className="px-3 text-lg font-semibold tracking-tight">
            {m.settings_title()}
          </h2>
        </div>
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {section.label()}
              </div>
              <ul className="flex flex-col gap-px">
                {section.items.map((item) => {
                  const isActive = isActiveItem(item.to)
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-accent font-medium text-accent-foreground shadow-[inset_2px_0_0_var(--brand)]"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                          item.destructive &&
                            !isActive &&
                            "text-destructive/80 hover:text-destructive",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "size-4",
                            isActive && "text-brand",
                            item.destructive && !isActive && "text-destructive/70",
                          )}
                        />
                        <span>{item.title()}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  )
}
