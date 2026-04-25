import { Link, useLocation } from "@tanstack/react-router"
import { Building2, KeyRound, UserCircle, Webhook, type LucideIcon } from "lucide-react"

import { cn } from "#/lib/utils"
import * as m from "../paraglide/messages.js"

type SettingsNavItem = {
  title: () => string
  to:
    | "/settings/account"
    | "/settings/organization"
    | "/settings/api-keys"
    | "/settings/webhooks"
  icon: LucideIcon
}

type SettingsNavSection = {
  key: "personal" | "organization"
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
      label: m.settings_section_organization,
      items: [
        {
          title: m.nav_organization_settings,
          to: "/settings/organization",
          icon: Building2,
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
      ],
    },
  ]
}

export function SettingsNav() {
  const sections = getSections()
  const { pathname } = useLocation()

  return (
    <nav
      aria-label={m.settings_title()}
      className="w-56 shrink-0 border-r bg-background pr-4"
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
                const isActive =
                  pathname === item.to || pathname.startsWith(`${item.to}/`)
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-accent font-medium text-accent-foreground shadow-[inset_2px_0_0_var(--brand)]"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <item.icon className={cn("size-4", isActive && "text-brand")} />
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
  )
}
