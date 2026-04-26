import { OrganizationSwitcher, UserButton } from "@daveyplate/better-auth-ui"
import { Link, useLocation } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import {
  Activity,
  ArrowLeftRight,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  Coins,
  Contact,
  Dices,
  Drama,
  FolderOpen,
  HeartHandshake,
  GalleryHorizontal,
  Gift,
  Layers,
  LayoutDashboard,
  LineChart,
  ListTodo,
  Medal,
  Megaphone,
  Radio,
  Bell,
  Mail,
  Map,
  MessagesSquare,
  Package,
  PartyPopper,
  PieChart,
  PiggyBank,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Swords,
  Tags,
  Ticket,
  Trophy,
  UserPlus,
  Users,
  Wrench,
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "#/components/ui/sidebar"
import { LanguageSwitcher } from "./LanguageSwitcher"
import ThemeToggle from "./ThemeToggle"
import * as m from "../paraglide/messages.js"

type NavRoute =
  | "/dashboard"
  | "/analytics/users"
  | "/analytics/modules"
  | "/analytics/activity"
  | "/analytics/logs"
  | "/check-in"
  | "/item"
  | "/item/definitions"
  | "/item/categories"
  | "/item/tools"
  | "/currency"
  | "/entity"
  | "/entity/schemas"
  | "/entity/formations"
  | "/exchange"
  | "/cdkey"
  | "/shop"
  | "/shop/categories"
  | "/shop/tags"
  | "/storage-box"
  | "/mail"
  | "/banner"
  | "/announcement"
  | "/activity"
  | "/lottery"
  | "/assist-pool"
  | "/friend-gift"
  | "/task"
  | "/task/categories"
  | "/media-library"
  | "/character"
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
  | "/badge"
  | "/settings"
  | "/cms"

type NavItem = {
  title: () => string
  to: NavRoute
  icon: LucideIcon
  /** 存在则视为父分组,渲染二级菜单。父级 `to` 即点击文字时跳转的"模块默认页"。 */
  children?: NavItem[]
}

type NavGroup = {
  key:
    | "overview"
    | "analytics"
    | "economy"
    | "operations"
    | "content"
    | "social"
    | "developer"
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
      // 事件管理(schema / 订阅健康 / 回放)是"治理"视角,放在 developer 组,不属于这里
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
        {
          title: m.nav_item,
          to: "/item",
          icon: Package,
          children: [
            { title: m.nav_item_definitions, to: "/item/definitions", icon: Package },
            { title: m.nav_item_categories, to: "/item/categories", icon: FolderOpen },
            { title: m.nav_item_tools, to: "/item/tools", icon: Wrench },
          ],
        },
        { title: m.nav_currency, to: "/currency", icon: Coins },
        {
          title: m.nav_entity,
          to: "/entity",
          icon: Sparkles,
          children: [
            { title: m.nav_entity_schemas, to: "/entity/schemas", icon: Layers },
            { title: m.nav_entity_formations, to: "/entity/formations", icon: Swords },
          ],
        },
        { title: m.nav_exchange, to: "/exchange", icon: ArrowLeftRight },
        { title: m.nav_cdkey, to: "/cdkey", icon: Ticket },
        {
          title: m.nav_shop,
          to: "/shop",
          icon: ShoppingCart,
          children: [
            { title: m.nav_shop_products, to: "/shop", icon: Package },
            { title: m.nav_shop_categories, to: "/shop/categories", icon: FolderOpen },
            { title: m.nav_shop_tags, to: "/shop/tags", icon: Tags },
          ],
        },
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
        {
          title: m.nav_task,
          to: "/task",
          icon: ListTodo,
          children: [
            { title: m.nav_task_list, to: "/task", icon: ListTodo },
            { title: m.nav_task_categories, to: "/task/categories", icon: FolderOpen },
          ],
        },
        { title: m.nav_badge, to: "/badge", icon: Bell },
      ],
    },
    {
      // 事件中心(event-catalog)在 developer 组,因为它是只读治理看板
      // (事件 schema / 订阅健康 / 回放),非"配置"语义。
      // 配置类(项目设置 / API 密钥 / Webhooks / 账号)统一进
      // /settings 二级页,从 footer 的 Settings 单链或 UserButton 进入。
      key: "content",
      label: m.nav_group_content,
      items: [
        { title: m.nav_cms, to: "/cms", icon: ScrollText },
        { title: m.nav_media_library, to: "/media-library", icon: FolderOpen },
        { title: m.nav_character, to: "/character", icon: Drama },
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
      // Developer 组:平台治理"看板"型页面(只读为主)。
      // 事件中心、未来的事件回放/订阅者健康/API explorer 都进这里。
      // 和 /settings 下的"配置"类页面区分开。
      key: "developer",
      label: m.nav_group_developer,
      items: [
        { title: m.nav_event_catalog, to: "/event-catalog", icon: Radio },
      ],
    },
  ]
}

/**
 * 二级菜单父项 — 点击文字「跳转模块默认页 + 自动展开子菜单」,
 * 右侧 chevron 用于「不跳转、单独折叠」。Collapsible 受控,以便点 Link 时
 * 主动 setOpen(true);路由变化导致 active 时也自动打开。
 */
function NavParentItem({
  item,
  isItemActive,
  pathname,
}: {
  item: NavItem
  isItemActive: boolean
  pathname: string
}) {
  const [open, setOpen] = useState(isItemActive)
  useEffect(() => {
    if (isItemActive) setOpen(true)
  }, [isItemActive])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/nav-collapsible"
      asChild
    >
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isItemActive} tooltip={item.title()}>
          <Link to={item.to} onClick={() => setOpen(true)}>
            <item.icon className="size-4" />
            <span>{item.title()}</span>
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction
            className="data-[state=open]:rotate-90"
            aria-label="Toggle submenu"
          >
            <ChevronRight className="size-4" />
          </SidebarMenuAction>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children?.map((child) => {
              const isChildActive =
                pathname === child.to || pathname.startsWith(`${child.to}/`)
              return (
                <SidebarMenuSubItem key={child.to}>
                  <SidebarMenuSubButton asChild isActive={isChildActive}>
                    <Link to={child.to}>
                      <child.icon className="size-4" />
                      <span>{child.title()}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              )
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
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
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                  <img src="/logo192.png" alt={m.nav_brand()} className="size-full object-contain" />
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
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/55 hover:text-sidebar-foreground/85">
                    {group.label()}
                    <ChevronRight className="size-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const isItemActive =
                          pathname === item.to || pathname.startsWith(`${item.to}/`)
                        if (!item.children) {
                          return (
                            <SidebarMenuItem key={item.to}>
                              <SidebarMenuButton asChild isActive={isItemActive} tooltip={item.title()}>
                                <Link to={item.to}>
                                  <item.icon className="size-4" />
                                  <span>{item.title()}</span>
                                </Link>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          )
                        }
                        return (
                          <NavParentItem
                            key={item.to}
                            item={item}
                            isItemActive={isItemActive}
                            pathname={pathname}
                          />
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
            <SidebarMenuButton
              asChild
              isActive={pathname === "/settings" || pathname.startsWith("/settings/")}
              tooltip={m.nav_settings()}
            >
              <Link to="/settings">
                <Settings className="size-4" />
                <span>{m.nav_settings()}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/*
            Lang + Theme 行 —— collapsed 模式自动隐藏(group-data 选择器),展开时
            才显示。两个控件共享一行,视觉重心比之前各占一行轻很多。
          */}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-1 px-1 py-0.5">
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
