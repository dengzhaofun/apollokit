import { OrganizationSwitcher, UserButton } from "@daveyplate/better-auth-ui"
import { Link, useLocation } from "@tanstack/react-router"
import {
  Activity,
  ArrowLeftRight,
  BookOpen,
  Building2,
  CalendarCheck,
  ChevronRight,
  Coins,
  Contact,
  Dices,
  FolderOpen,
  HeartHandshake,
  GalleryHorizontal,
  Gift,
  KeyRound,
  LayoutDashboard,
  LineChart,
  ListTodo,
  Medal,
  Megaphone,
  Radio,
  Mail,
  Map,
  MessagesSquare,
  Package,
  PartyPopper,
  PieChart,
  PiggyBank,
  ScrollText,
  Shield,
  ShoppingCart,
  Sparkles,
  Swords,
  Ticket,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible"
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
import ThemeToggle from "./ThemeToggle"
import * as m from "../paraglide/messages.js"

type NavItem = {
  title: () => string
  to:
    | "/dashboard"
    | "/analytics/users"
    | "/analytics/modules"
    | "/analytics/activity"
    | "/analytics/logs"
    | "/check-in"
    | "/item"
    | "/currency"
    | "/entity"
    | "/exchange"
    | "/cdkey"
    | "/shop"
    | "/storage-box"
    | "/mail"
    | "/banner"
    | "/announcement"
    | "/activity"
    | "/lottery"
    | "/assist-pool"
    | "/friend-gift"
    | "/task"
    | "/media-library"
    | "/dialogue"
    | "/collection"
    | "/level"
    | "/event-catalog"
    | "/friend"
    | "/invite"
    | "/guild"
    | "/team"
    | "/leaderboard"
    | "/rank"
    | "/end-user"
    | "/api-keys"
    | "/organization-settings"
  icon: LucideIcon
}

type NavGroup = {
  key:
    | "overview"
    | "analytics"
    | "economy"
    | "operations"
    | "content"
    | "social"
    | "system"
  label: () => string
  items: NavItem[]
}

function getNavGroups(): NavGroup[] {
  return [
    {
      key: "overview",
      label: m.nav_group_overview,
      items: [
        { title: m.nav_dashboard, to: "/dashboard", icon: LayoutDashboard },
      ],
    },
    {
      // 数据分析组:分析"读"视角 — 数据大盘在 overview,深度分析(用户/模块/活动/日志)集中到这里
      // 事件管理(schema / 订阅健康 / 回放)是"治理"视角,放在 system 组,不属于这里
      key: "analytics",
      label: m.nav_group_analytics,
      items: [
        { title: m.nav_user_analytics, to: "/analytics/users", icon: PieChart },
        {
          title: m.nav_module_analytics,
          to: "/analytics/modules",
          icon: LineChart,
        },
        {
          title: m.nav_activity_analytics,
          to: "/analytics/activity",
          icon: Activity,
        },
        { title: m.nav_logs, to: "/analytics/logs", icon: ScrollText },
      ],
    },
    {
      key: "economy",
      label: m.nav_group_economy,
      items: [
        { title: m.nav_item, to: "/item", icon: Package },
        { title: m.nav_currency, to: "/currency", icon: Coins },
        { title: m.nav_entity, to: "/entity", icon: Sparkles },
        { title: m.nav_exchange, to: "/exchange", icon: ArrowLeftRight },
        { title: m.nav_cdkey, to: "/cdkey", icon: Ticket },
        { title: m.nav_shop, to: "/shop", icon: ShoppingCart },
        { title: m.nav_storage_box, to: "/storage-box", icon: PiggyBank },
        { title: m.nav_mail, to: "/mail", icon: Mail },
      ],
    },
    {
      key: "operations",
      label: m.nav_group_operations,
      items: [
        { title: m.nav_checkin, to: "/check-in", icon: CalendarCheck },
        { title: m.nav_banner, to: "/banner", icon: GalleryHorizontal },
        { title: m.nav_announcement, to: "/announcement", icon: Megaphone },
        { title: m.nav_activity, to: "/activity", icon: PartyPopper },
        { title: m.nav_lottery, to: "/lottery", icon: Dices },
        { title: m.nav_assist_pool, to: "/assist-pool", icon: HeartHandshake },
        { title: m.nav_gift, to: "/friend-gift", icon: Gift },
        { title: m.nav_task, to: "/task", icon: ListTodo },
      ],
    },
    {
      // 事件中心(event-catalog)原本挂在这里,现已迁到 system 组 —
      // 因为后续要扩展"订阅者健康"、"事件回放"等平台治理能力,
      // 和 api-keys / 组织设置属于同一个"基础设施治理"语义
      key: "content",
      label: m.nav_group_content,
      items: [
        { title: m.nav_media_library, to: "/media-library", icon: FolderOpen },
        { title: m.nav_dialogue, to: "/dialogue", icon: MessagesSquare },
        { title: m.nav_collection, to: "/collection", icon: BookOpen },
        { title: m.nav_level, to: "/level", icon: Map },
      ],
    },
    {
      key: "social",
      label: m.nav_group_social,
      items: [
        { title: m.nav_friend, to: "/friend", icon: Users },
        { title: m.nav_invite, to: "/invite", icon: UserPlus },
        { title: m.nav_guild, to: "/guild", icon: Shield },
        { title: m.nav_team, to: "/team", icon: Swords },
        { title: m.nav_leaderboard, to: "/leaderboard", icon: Trophy },
        { title: m.nav_rank, to: "/rank", icon: Medal },
        { title: m.nav_end_user, to: "/end-user", icon: Contact },
      ],
    },
    {
      key: "system",
      label: m.nav_group_system,
      items: [
        {
          title: m.nav_organization_settings,
          to: "/organization-settings",
          icon: Building2,
        },
        { title: m.nav_api_keys, to: "/api-keys", icon: KeyRound },
        // 事件中心:事件 schema / 生产消费拓扑 / 订阅健康 / 回放(二期扩展)
        { title: m.nav_event_catalog, to: "/event-catalog", icon: Radio },
      ],
    },
  ]
}

export function AppSidebar() {
  const groups = getNavGroups()
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
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
        {groups.map((group) => {
          const isActiveGroup = group.items.some((item) =>
            pathname === item.to || pathname.startsWith(`${item.to}/`),
          )
          return (
            <Collapsible
              key={group.key}
              defaultOpen={isActiveGroup || group.key === "overview"}
              className="group/collapsible"
            >
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-sidebar-foreground/70 hover:text-sidebar-foreground">
                    {group.label()}
                    <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const isActive =
                          pathname === item.to || pathname.startsWith(`${item.to}/`)
                        return (
                          <SidebarMenuItem key={item.to}>
                            <SidebarMenuButton asChild isActive={isActive} tooltip={item.title()}>
                              <Link to={item.to}>
                                <item.icon className="size-4" />
                                <span>{item.title()}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        )
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          )
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-1 px-1 py-1">
              <LanguageSwitcher />
              <ThemeToggle />
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

export { getNavGroups }
export type { NavGroup, NavItem }
