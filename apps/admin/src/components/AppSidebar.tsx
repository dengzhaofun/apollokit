import { OrganizationSwitcher, UserButton } from "@daveyplate/better-auth-ui"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftRight,
  BookOpen,
  CalendarCheck,
  Coins,
  FolderOpen,
  GalleryHorizontal,
  Gift,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  Megaphone,
  Radio,
  Mail,
  Map,
  MessagesSquare,
  Package,
  PartyPopper,
  PiggyBank,
  Shield,
  ShoppingCart,
  Sparkles,
  Swords,
  Ticket,
  Trophy,
  UserPlus,
  Users,
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
    { title: m.nav_currency(), to: "/currency" as const, icon: Coins },
    { title: m.nav_entity(), to: "/entity" as const, icon: Sparkles },
    { title: m.nav_exchange(), to: "/exchange" as const, icon: ArrowLeftRight },
    { title: m.nav_cdkey(), to: "/cdkey" as const, icon: Ticket },
    { title: m.nav_shop(), to: "/shop" as const, icon: ShoppingCart },
    { title: "存储箱", to: "/storage-box" as const, icon: PiggyBank },
    { title: m.nav_mail(), to: "/mail" as const, icon: Mail },
    { title: m.nav_banner(), to: "/banner" as const, icon: GalleryHorizontal },
    { title: m.nav_announcement(), to: "/announcement" as const, icon: Megaphone },
    { title: m.nav_media_library(), to: "/media-library" as const, icon: FolderOpen },
    { title: m.nav_dialogue(), to: "/dialogue" as const, icon: MessagesSquare },
    { title: m.nav_collection(), to: "/collection" as const, icon: BookOpen },
    { title: m.nav_level(), to: "/level" as const, icon: Map },
    { title: m.nav_friend(), to: "/friend" as const, icon: Users },
    { title: m.nav_invite(), to: "/invite" as const, icon: UserPlus },
    { title: m.nav_guild(), to: "/guild" as const, icon: Shield },
    { title: m.nav_team(), to: "/team" as const, icon: Swords },
    { title: m.nav_gift(), to: "/friend-gift" as const, icon: Gift },
    { title: m.nav_task(), to: "/task" as const, icon: ListTodo },
    { title: m.nav_activity(), to: "/activity" as const, icon: PartyPopper },
    { title: m.nav_leaderboard(), to: "/leaderboard" as const, icon: Trophy },
    { title: m.nav_event_catalog(), to: "/event-catalog" as const, icon: Radio },
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
