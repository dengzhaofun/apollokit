import { OrganizationSwitcher, UserButton } from "@daveyplate/better-auth-ui"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftRight,
  CalendarCheck,
  Dices,
  KeyRound,
  LayoutDashboard,
  Mail,
  Package,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "#/components/ui/sidebar"
import { LanguageSwitcher } from "./LanguageSwitcher"
import * as m from "../paraglide/messages.js"

function getNavItems() {
  return [
    { title: m.nav_dashboard(), to: "/dashboard" as const, icon: LayoutDashboard },
    { title: m.nav_checkin(), to: "/check-in" as const, icon: CalendarCheck },
    { title: m.nav_item(), to: "/item" as const, icon: Package },
    { title: m.nav_exchange(), to: "/exchange" as const, icon: ArrowLeftRight },
    { title: m.nav_mail(), to: "/mail" as const, icon: Mail },
    { title: m.nav_api_keys(), to: "/api-keys" as const, icon: KeyRound },
  ]
}

export function AppSidebar() {
  const navItems = getNavItems()

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-[var(--lagoon)] text-white">
                  <span className="text-sm font-bold">A</span>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">{m.nav_brand()}</span>
                  <span className="text-xs text-muted-foreground">{m.nav_admin()}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator />

        <div className="px-2 py-1 [&_button]:w-full">
          <OrganizationSwitcher />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{m.nav_navigation()}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild>
                    <Link to={item.to}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-1 py-1">
              <LanguageSwitcher />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="px-1 py-1 [&_button]:w-full">
              <UserButton size="lg" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
