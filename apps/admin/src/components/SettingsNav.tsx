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
      <div className="px-2 py-3">
        <h2 className="px-2 text-base font-semibold">{m.settings_title()}</h2>
      </div>
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.key}>
            <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.label()}
            </div>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.to || pathname.startsWith(`${item.to}/`)
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <item.icon className="size-4" />
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
