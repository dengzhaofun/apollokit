import { OrgProjectSwitcher } from "#/components/auth/OrgProjectSwitcher"
import { useTenantParams } from "#/hooks/use-tenant-params"
import { useLocation, Link, useNavigate } from "@tanstack/react-router"
import { useTheme } from "next-themes"
import { Fragment, useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowLeftRight,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  Coins,
  Contact,
  Dices,
  KeyRound,
  MailCheck,
  MonitorSmartphone,
  UserCog,
  Drama,
  FolderOpen,
  HeartHandshake,
  GalleryHorizontal,
  Gift,
  Globe,
  Layers,
  LayoutDashboard,
  LineChart,
  ListTodo,
  Medal,
  Megaphone,
  Monitor,
  Moon,
  Radio,
  Workflow,
  Zap,
  Beaker,
  Bell,
  Mail,
  Map as MapIcon,
  MapPin,
  MessagesSquare,
  Search,
  Package,
  Palette,
  PartyPopper,
  PieChart,
  PiggyBank,
  ScrollText,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Sun,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar"
import { authClient } from "#/lib/auth-client"
import { LogOut, Settings as SettingsIcon } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover"
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
  useSidebar,
} from "#/components/ui/sidebar"
import { useFavorites } from "#/hooks/use-navigation-favorites"
import {
  hasAnyAction,
  useCapabilities,
  type CapabilityBag,
} from "#/lib/capabilities"
import { cn } from "#/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useCommandPalette } from "./command-palette-context"
import { FavoriteStarButton } from "./FavoriteStarButton"
import * as m from "../paraglide/messages.js"
import { getLocale, setLocale, type Locale } from "../paraglide/runtime.js"

type NavRoute =
  | "/o/$orgSlug/p/$projectSlug/dashboard"
  | "/o/$orgSlug/p/$projectSlug/analytics/users"
  | "/o/$orgSlug/p/$projectSlug/analytics/modules"
  | "/o/$orgSlug/p/$projectSlug/analytics/activity"
  | "/o/$orgSlug/p/$projectSlug/analytics/logs"
  | "/o/$orgSlug/p/$projectSlug/analytics/explore"
  | "/o/$orgSlug/p/$projectSlug/analytics/funnel"
  | "/o/$orgSlug/p/$projectSlug/audit-logs"
  | "/o/$orgSlug/p/$projectSlug/check-in"
  | "/o/$orgSlug/p/$projectSlug/offline-check-in"
  | "/o/$orgSlug/p/$projectSlug/experiment"
  | "/o/$orgSlug/p/$projectSlug/item"
  | "/o/$orgSlug/p/$projectSlug/item/definitions"
  | "/o/$orgSlug/p/$projectSlug/item/categories"
  | "/o/$orgSlug/p/$projectSlug/item/tools"
  | "/o/$orgSlug/p/$projectSlug/currency"
  | "/o/$orgSlug/p/$projectSlug/entity"
  | "/o/$orgSlug/p/$projectSlug/entity/schemas"
  | "/o/$orgSlug/p/$projectSlug/entity/formations"
  | "/o/$orgSlug/p/$projectSlug/exchange"
  | "/o/$orgSlug/p/$projectSlug/cdkey"
  | "/o/$orgSlug/p/$projectSlug/shop"
  | "/o/$orgSlug/p/$projectSlug/shop/categories"
  | "/o/$orgSlug/p/$projectSlug/shop/tags"
  | "/o/$orgSlug/p/$projectSlug/storage-box"
  | "/o/$orgSlug/p/$projectSlug/mail"
  | "/o/$orgSlug/p/$projectSlug/banner"
  | "/o/$orgSlug/p/$projectSlug/announcement"
  | "/o/$orgSlug/p/$projectSlug/activity"
  | "/o/$orgSlug/p/$projectSlug/lottery"
  | "/o/$orgSlug/p/$projectSlug/assist-pool"
  | "/o/$orgSlug/p/$projectSlug/friend-gift"
  | "/o/$orgSlug/p/$projectSlug/task"
  | "/o/$orgSlug/p/$projectSlug/task/categories"
  | "/o/$orgSlug/p/$projectSlug/media-library"
  | "/o/$orgSlug/p/$projectSlug/character"
  | "/o/$orgSlug/p/$projectSlug/dialogue"
  | "/o/$orgSlug/p/$projectSlug/collection"
  | "/o/$orgSlug/p/$projectSlug/level"
  | "/o/$orgSlug/p/$projectSlug/event-catalog"
  | "/o/$orgSlug/p/$projectSlug/triggers"
  | "/o/$orgSlug/p/$projectSlug/friend"
  | "/o/$orgSlug/p/$projectSlug/invite"
  | "/o/$orgSlug/p/$projectSlug/guild"
  | "/o/$orgSlug/p/$projectSlug/match-squad"
  | "/o/$orgSlug/p/$projectSlug/leaderboard"
  | "/o/$orgSlug/p/$projectSlug/rank"
  | "/o/$orgSlug/p/$projectSlug/end-user"
  | "/o/$orgSlug/p/$projectSlug/end-user-session"
  | "/o/$orgSlug/p/$projectSlug/end-user-account"
  | "/o/$orgSlug/p/$projectSlug/end-user-verification"
  | "/o/$orgSlug/p/$projectSlug/badge"
  | "/settings"
  | "/o/$orgSlug/p/$projectSlug/cms"

/**
 * Paraglide message function signature — the generated `m.*` functions
 * accept an optional `{ locale }` option that lets us render the title
 * in a non-current locale (used by the command palette to build a
 * cross-language search index).
 */
type NavMessage = (
  inputs?: Record<string, never>,
  options?: { locale?: "en" | "zh" },
) => string

type NavItem = {
  title: NavMessage
  to: NavRoute
  icon: LucideIcon
  /** 存在则视为父分组,渲染二级菜单。父级 `to` 即点击文字时跳转的"模块默认页"。 */
  children?: NavItem[]
  /**
   * 权限要求 — 若声明,菜单项只对 capability bag 中含有
   * `<resource>` 任意 action（默认即视作"能 read"）的用户可见。
   * 不声明 = 对所有登录用户开放（如 /dashboard / /settings 入口）。
   */
  permission?: { resource: string }
}

type NavGroup = {
  key:
    | "overview"
    | "analytics"
    | "identity"
    | "economy"
    | "operations"
    | "content"
    | "social"
    | "developer"
  label: NavMessage
  /** icon 模式下分组聚合到一颗按钮上,这里是该按钮的图标 */
  icon: LucideIcon
  items: NavItem[]
}

/**
 * Centralized permission + visibility table — single source of truth
 * for both the sidebar (filtering) and `<RouteGuard>` (URL-paste
 * defense). Resource names mirror `apps/server/src/auth/ac.ts`.
 *
 * Visibility modes:
 *   - "hidden"            (default) — sidebar drops the item; URL paste
 *                          still loads the page (server middleware 403
 *                          handles enforcement). Use for everyday
 *                          modules where exposure is fine.
 *   - "redirect-dashboard" — sidebar drops AND `<RouteGuard>` silently
 *                          redirects to /dashboard. Use for resources
 *                          the user shouldn't even know exist
 *                          (audit-log, billing, member management).
 *   - "unauthorized-page"  — sidebar drops AND `<RouteGuard>` redirects
 *                          to /unauthorized. Use for moderately
 *                          sensitive routes where surfacing "you don't
 *                          have access" is preferable to silent redirect
 *                          (api-keys, webhooks).
 *
 * Sub-routes inherit the parent's permission unless they declare their
 * own here (e.g. `/item/definitions` is gated by `item`, same as the
 * parent `/item`).
 */
type Visibility = "hidden" | "redirect-dashboard" | "unauthorized-page"
type RoutePermission = {
  resource: string
  visibility?: Visibility // defaults to "hidden"
}
const ROUTE_PERMISSIONS: Partial<Record<NavRoute, RoutePermission>> = {
  "/o/$orgSlug/p/$projectSlug/analytics/users": { resource: "analytics" },
  "/o/$orgSlug/p/$projectSlug/analytics/modules": { resource: "analytics" },
  "/o/$orgSlug/p/$projectSlug/analytics/activity": { resource: "analytics" },
  "/o/$orgSlug/p/$projectSlug/analytics/logs": { resource: "analytics" },
  "/o/$orgSlug/p/$projectSlug/analytics/explore": { resource: "analytics" },
  "/o/$orgSlug/p/$projectSlug/analytics/funnel": { resource: "analytics" },
  "/o/$orgSlug/p/$projectSlug/audit-logs": { resource: "auditLog", visibility: "redirect-dashboard" },
  "/o/$orgSlug/p/$projectSlug/check-in": { resource: "checkIn" },
  "/o/$orgSlug/p/$projectSlug/offline-check-in": { resource: "offlineCheckIn" },
  "/o/$orgSlug/p/$projectSlug/experiment": { resource: "experiment" },
  "/o/$orgSlug/p/$projectSlug/item": { resource: "item" },
  "/o/$orgSlug/p/$projectSlug/item/definitions": { resource: "item" },
  "/o/$orgSlug/p/$projectSlug/item/categories": { resource: "item" },
  "/o/$orgSlug/p/$projectSlug/item/tools": { resource: "item" },
  "/o/$orgSlug/p/$projectSlug/currency": { resource: "currency" },
  "/o/$orgSlug/p/$projectSlug/entity": { resource: "entity" },
  "/o/$orgSlug/p/$projectSlug/entity/schemas": { resource: "entity" },
  "/o/$orgSlug/p/$projectSlug/entity/formations": { resource: "entity" },
  "/o/$orgSlug/p/$projectSlug/exchange": { resource: "exchange" },
  "/o/$orgSlug/p/$projectSlug/cdkey": { resource: "cdkey" },
  "/o/$orgSlug/p/$projectSlug/shop": { resource: "shop" },
  "/o/$orgSlug/p/$projectSlug/shop/categories": { resource: "shop" },
  "/o/$orgSlug/p/$projectSlug/shop/tags": { resource: "shop" },
  "/o/$orgSlug/p/$projectSlug/storage-box": { resource: "storageBox" },
  "/o/$orgSlug/p/$projectSlug/mail": { resource: "mail" },
  "/o/$orgSlug/p/$projectSlug/banner": { resource: "banner" },
  "/o/$orgSlug/p/$projectSlug/announcement": { resource: "announcement" },
  "/o/$orgSlug/p/$projectSlug/activity": { resource: "activity" },
  "/o/$orgSlug/p/$projectSlug/lottery": { resource: "lottery" },
  "/o/$orgSlug/p/$projectSlug/assist-pool": { resource: "assistPool" },
  "/o/$orgSlug/p/$projectSlug/friend-gift": { resource: "friendGift" },
  "/o/$orgSlug/p/$projectSlug/task": { resource: "task" },
  "/o/$orgSlug/p/$projectSlug/task/categories": { resource: "task" },
  "/o/$orgSlug/p/$projectSlug/badge": { resource: "badge" },
  "/o/$orgSlug/p/$projectSlug/cms": { resource: "cms" },
  "/o/$orgSlug/p/$projectSlug/media-library": { resource: "mediaLibrary" },
  "/o/$orgSlug/p/$projectSlug/character": { resource: "character" },
  "/o/$orgSlug/p/$projectSlug/dialogue": { resource: "dialogue" },
  "/o/$orgSlug/p/$projectSlug/collection": { resource: "collection" },
  "/o/$orgSlug/p/$projectSlug/level": { resource: "level" },
  "/o/$orgSlug/p/$projectSlug/event-catalog": { resource: "eventCatalog" },
  "/o/$orgSlug/p/$projectSlug/triggers": { resource: "triggers" },
  "/o/$orgSlug/p/$projectSlug/friend": { resource: "friend" },
  "/o/$orgSlug/p/$projectSlug/invite": { resource: "invite" },
  "/o/$orgSlug/p/$projectSlug/guild": { resource: "guild" },
  "/o/$orgSlug/p/$projectSlug/match-squad": { resource: "team" },
  "/o/$orgSlug/p/$projectSlug/leaderboard": { resource: "leaderboard" },
  "/o/$orgSlug/p/$projectSlug/rank": { resource: "rank" },
  "/o/$orgSlug/p/$projectSlug/end-user": { resource: "endUser" },
  "/o/$orgSlug/p/$projectSlug/end-user-session": { resource: "endUser" },
  "/o/$orgSlug/p/$projectSlug/end-user-account": { resource: "endUser" },
  "/o/$orgSlug/p/$projectSlug/end-user-verification": { resource: "endUser" },
  // /dashboard, /cms, /settings: no permission entry → always visible
}

/**
 * Filter a NavGroup tree to only items the current user can see.
 * Drops items / parent items / entire groups whose `permission.resource`
 * is not in the user's capability bag. Items with no permission entry
 * are kept (default-allow for low-sensitivity / open routes).
 */
function filterGroupsByCapabilities(
  groups: NavGroup[],
  bag: CapabilityBag | undefined | null,
): NavGroup[] {
  const isAllowed = (route: NavRoute): boolean => {
    const perm = ROUTE_PERMISSIONS[route]
    if (!perm) return true
    // While the bag is loading, treat as allowed — else the sidebar
    // flashes empty on every nav. Server middleware still 403s if the
    // user actually lacks permission.
    if (bag === undefined) return true
    return hasAnyAction(bag, perm.resource)
  }

  return groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          if (!isAllowed(item.to)) return null
          if (!item.children || item.children.length === 0) return item
          const children = item.children.filter((c) => isAllowed(c.to))
          // Parent + all children gated out → drop the whole branch.
          // (Without this, we'd render an empty Collapsible carrying
          // only the parent click target — confusing, since the parent
          // looks like a leaf but its destination is the index page
          // for a module the user can't see.)
          if (children.length === 0) return null
          return { ...item, children }
        })
        .filter((i): i is NavItem => i !== null)
      return { ...group, items }
    })
    .filter((group) => group.items.length > 0)
}

export { ROUTE_PERMISSIONS }
export type { RoutePermission, Visibility }

function getNavGroups(): NavGroup[] {
  return [
    {
      key: "overview",
      label: m.nav_group_overview,
      icon: LayoutDashboard,
      items: [
        { title: m.nav_dashboard, to: "/o/$orgSlug/p/$projectSlug/dashboard", icon: LayoutDashboard },
      ],
    },
    {
      // 数据分析组:分析"读"视角 — 数据大盘在 overview,深度分析(用户/模块/活动/日志)集中到这里
      // 事件管理(schema / 订阅健康 / 回放)是"治理"视角,放在 developer 组,不属于这里
      key: "analytics",
      label: m.nav_group_analytics,
      icon: PieChart,
      items: [
        { title: m.nav_user_analytics, to: "/o/$orgSlug/p/$projectSlug/analytics/users", icon: PieChart },
        {
          title: m.nav_module_analytics,
          to: "/o/$orgSlug/p/$projectSlug/analytics/modules",
          icon: LineChart,
        },
        {
          title: m.nav_explore_analytics,
          to: "/o/$orgSlug/p/$projectSlug/analytics/explore",
          icon: LineChart,
        },
        {
          title: m.nav_funnel_analytics,
          to: "/o/$orgSlug/p/$projectSlug/analytics/funnel",
          icon: Workflow,
        },
        {
          title: m.nav_activity_analytics,
          to: "/o/$orgSlug/p/$projectSlug/analytics/activity",
          icon: Activity,
        },
        { title: m.nav_logs, to: "/o/$orgSlug/p/$projectSlug/analytics/logs", icon: ScrollText },
        { title: m.nav_audit_logs, to: "/o/$orgSlug/p/$projectSlug/audit-logs", icon: Shield },
      ],
    },
    {
      key: "identity",
      label: m.nav_group_identity,
      icon: UserCog,
      items: [
        { title: m.nav_end_user, to: "/o/$orgSlug/p/$projectSlug/end-user", icon: Contact },
        { title: m.nav_end_user_session, to: "/o/$orgSlug/p/$projectSlug/end-user-session", icon: MonitorSmartphone },
        { title: m.nav_end_user_account, to: "/o/$orgSlug/p/$projectSlug/end-user-account", icon: KeyRound },
        { title: m.nav_end_user_verify, to: "/o/$orgSlug/p/$projectSlug/end-user-verification", icon: MailCheck },
      ],
    },
    {
      key: "economy",
      label: m.nav_group_economy,
      icon: Coins,
      items: [
        {
          title: m.nav_item,
          to: "/o/$orgSlug/p/$projectSlug/item",
          icon: Package,
          children: [
            { title: m.nav_item_definitions, to: "/o/$orgSlug/p/$projectSlug/item/definitions", icon: Package },
            { title: m.nav_item_categories, to: "/o/$orgSlug/p/$projectSlug/item/categories", icon: FolderOpen },
            { title: m.nav_item_tools, to: "/o/$orgSlug/p/$projectSlug/item/tools", icon: Wrench },
          ],
        },
        { title: m.nav_currency, to: "/o/$orgSlug/p/$projectSlug/currency", icon: Coins },
        {
          title: m.nav_entity,
          to: "/o/$orgSlug/p/$projectSlug/entity",
          icon: Sparkles,
          children: [
            { title: m.nav_entity_schemas, to: "/o/$orgSlug/p/$projectSlug/entity/schemas", icon: Layers },
            { title: m.nav_entity_formations, to: "/o/$orgSlug/p/$projectSlug/entity/formations", icon: Swords },
          ],
        },
        { title: m.nav_exchange, to: "/o/$orgSlug/p/$projectSlug/exchange", icon: ArrowLeftRight },
        { title: m.nav_cdkey, to: "/o/$orgSlug/p/$projectSlug/cdkey", icon: Ticket },
        {
          title: m.nav_shop,
          to: "/o/$orgSlug/p/$projectSlug/shop",
          icon: ShoppingCart,
          children: [
            { title: m.nav_shop_products, to: "/o/$orgSlug/p/$projectSlug/shop", icon: Package },
            { title: m.nav_shop_categories, to: "/o/$orgSlug/p/$projectSlug/shop/categories", icon: FolderOpen },
            { title: m.nav_shop_tags, to: "/o/$orgSlug/p/$projectSlug/shop/tags", icon: Tags },
          ],
        },
        { title: m.nav_storage_box, to: "/o/$orgSlug/p/$projectSlug/storage-box", icon: PiggyBank },
        { title: m.nav_mail, to: "/o/$orgSlug/p/$projectSlug/mail", icon: Mail },
      ],
    },
    {
      key: "operations",
      label: m.nav_group_operations,
      icon: Megaphone,
      items: [
        { title: m.nav_checkin, to: "/o/$orgSlug/p/$projectSlug/check-in", icon: CalendarCheck },
        { title: m.nav_offline_checkin, to: "/o/$orgSlug/p/$projectSlug/offline-check-in", icon: MapPin },
        { title: m.nav_banner, to: "/o/$orgSlug/p/$projectSlug/banner", icon: GalleryHorizontal },
        { title: m.nav_announcement, to: "/o/$orgSlug/p/$projectSlug/announcement", icon: Megaphone },
        { title: m.nav_activity, to: "/o/$orgSlug/p/$projectSlug/activity", icon: PartyPopper },
        { title: m.nav_lottery, to: "/o/$orgSlug/p/$projectSlug/lottery", icon: Dices },
        { title: m.nav_assist_pool, to: "/o/$orgSlug/p/$projectSlug/assist-pool", icon: HeartHandshake },
        { title: m.nav_gift, to: "/o/$orgSlug/p/$projectSlug/friend-gift", icon: Gift },
        {
          title: m.nav_task,
          to: "/o/$orgSlug/p/$projectSlug/task",
          icon: ListTodo,
          children: [
            { title: m.nav_task_list, to: "/o/$orgSlug/p/$projectSlug/task", icon: ListTodo },
            { title: m.nav_task_categories, to: "/o/$orgSlug/p/$projectSlug/task/categories", icon: FolderOpen },
          ],
        },
        { title: m.nav_badge, to: "/o/$orgSlug/p/$projectSlug/badge", icon: Bell },
      ],
    },
    {
      // 事件中心(event-catalog)在 developer 组,因为它是只读治理看板
      // (事件 schema / 订阅健康 / 回放),非"配置"语义。
      // 配置类(项目设置 / API 密钥 / Webhooks / 账号)统一进
      // /settings 二级页,从 footer 的 UserMenuButton 下拉里进入。
      key: "content",
      label: m.nav_group_content,
      icon: BookOpen,
      items: [
        { title: m.nav_cms, to: "/o/$orgSlug/p/$projectSlug/cms", icon: ScrollText },
        { title: m.nav_media_library, to: "/o/$orgSlug/p/$projectSlug/media-library", icon: FolderOpen },
        { title: m.nav_character, to: "/o/$orgSlug/p/$projectSlug/character", icon: Drama },
        { title: m.nav_dialogue, to: "/o/$orgSlug/p/$projectSlug/dialogue", icon: MessagesSquare },
        { title: m.nav_collection, to: "/o/$orgSlug/p/$projectSlug/collection", icon: BookOpen },
        { title: m.nav_level, to: "/o/$orgSlug/p/$projectSlug/level", icon: MapIcon },
      ],
    },
    {
      key: "social",
      label: m.nav_group_social,
      icon: Trophy,
      items: [
        { title: m.nav_friend, to: "/o/$orgSlug/p/$projectSlug/friend", icon: Users },
        { title: m.nav_invite, to: "/o/$orgSlug/p/$projectSlug/invite", icon: UserPlus },
        { title: m.nav_guild, to: "/o/$orgSlug/p/$projectSlug/guild", icon: Shield },
        { title: m.nav_team, to: "/o/$orgSlug/p/$projectSlug/match-squad", icon: Swords },
        { title: m.nav_leaderboard, to: "/o/$orgSlug/p/$projectSlug/leaderboard", icon: Trophy },
        { title: m.nav_rank, to: "/o/$orgSlug/p/$projectSlug/rank", icon: Medal },
      ],
    },
    {
      // Developer 组:平台治理"看板"型页面(只读为主)。
      // 事件中心、未来的事件回放/订阅者健康/API explorer 都进这里。
      // 和 /settings 下的"配置"类页面区分开。
      key: "developer",
      label: m.nav_group_developer,
      icon: Wrench,
      items: [
        { title: m.nav_event_catalog, to: "/o/$orgSlug/p/$projectSlug/event-catalog", icon: Radio },
        { title: m.nav_triggers, to: "/o/$orgSlug/p/$projectSlug/triggers", icon: Zap },
        { title: m.nav_experiment, to: "/o/$orgSlug/p/$projectSlug/experiment", icon: Beaker },
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
  const { orgSlug, projectSlug } = useTenantParams()
  useEffect(() => {
    if (isItemActive) setOpen(true)
  }, [isItemActive])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/nav-collapsible"
      render={
        <SidebarMenuItem>
          <SidebarMenuButton
            render={
              <Link to={item.to} params={{ orgSlug, projectSlug }} onClick={() => setOpen(true)}>
                <item.icon className="size-4" />
                <span>{item.title()}</span>
              </Link>
            }
            isActive={isItemActive}
            tooltip={item.title()}
          />
          <CollapsibleTrigger
            render={
              <SidebarMenuAction
                className="data-[state=open]:rotate-90"
                aria-label={m.aria_toggle_submenu()}
              >
                <ChevronRight className="size-4" />
              </SidebarMenuAction>
            }
          />
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children?.map((child) => {
                const isChildActive =
                  pathname === child.to || pathname.startsWith(`${child.to}/`)
                return (
                  <SidebarMenuSubItem
                    key={child.to}
                    className="group/menu-sub-item"
                  >
                    <SidebarMenuSubButton
                      render={
                        <Link to={child.to} params={{ orgSlug, projectSlug }}>
                          <child.icon className="size-4" />
                          <span>{child.title()}</span>
                        </Link>
                      }
                      isActive={isChildActive}
                    />
                    <FavoriteStarButton
                      routePath={child.to}
                      className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/menu-sub-item:opacity-100 focus-visible:opacity-100 data-[favorited=true]:opacity-100"
                    />
                  </SidebarMenuSubItem>
                )
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      }
    />
  )
}

/**
 * 分组容器 — 把 Collapsible 的 open 状态收成 useState,展开模式下
 * 保留用户的 toggle,active 组与 overview 默认展开。
 *
 * 这只渲染"展开模式"的形态;icon 模式由 NavGroupPopover 接管
 * (上层根据 isIcon 切换组件,不在本组件里做条件渲染,避免
 * Collapsible 状态错乱)。
 */
function NavGroupSection({
  group,
  isActiveGroup,
  pathname,
}: {
  group: NavGroup
  isActiveGroup: boolean
  pathname: string
}) {
  const [open, setOpen] = useState(isActiveGroup || group.key === "overview")
  const { orgSlug, projectSlug } = useTenantParams()
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
    >
      <SidebarGroup>
        <SidebarGroupLabel
          render={
            <CollapsibleTrigger className="flex w-full items-center justify-between text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/55 hover:text-sidebar-foreground/85">
              {group.label()}
              <ChevronRight className="size-3.5 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </CollapsibleTrigger>
          }
        />
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const isItemActive =
                  pathname === item.to || pathname.startsWith(`${item.to}/`)
                if (!item.children) {
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        render={
                          <Link to={item.to} params={{ orgSlug, projectSlug }}>
                            <item.icon className="size-4" />
                            <span>{item.title()}</span>
                          </Link>
                        }
                        isActive={isItemActive}
                        tooltip={item.title()}
                      />
                      <FavoriteStarButton
                        routePath={item.to}
                        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/menu-item:opacity-100 focus-visible:opacity-100 data-[favorited=true]:opacity-100"
                      />
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
}

/**
 * Icon 模式下的分组形态 — 单颗 group icon,点击/hover 展开右侧 Popover
 * 列出该组所有可达入口(parent + children 平铺,children 缩进一档)。
 * 所有 item 链接关闭 Popover 后跳转。Active 状态:任意 item 命中即标亮。
 */
function NavGroupPopover({
  group,
  isActiveGroup,
  pathname,
}: {
  group: NavGroup
  isActiveGroup: boolean
  pathname: string
}) {
  const [open, setOpen] = useState(false)
  const { orgSlug, projectSlug } = useTenantParams()
  const GroupIcon = group.icon
  return (
    <SidebarMenuItem>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <SidebarMenuButton
              isActive={isActiveGroup}
              tooltip={open ? undefined : group.label()}
              aria-label={group.label()}
            >
              <GroupIcon className="size-4" />
              <span>{group.label()}</span>
            </SidebarMenuButton>
          }
        />
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-60 p-1"
          // TODO(base-ui): base-ui Popover 无 onCloseAutoFocus；若 collapsed
          // sidebar 弹层关闭后出现滚动/焦点跳回 trigger，改用
          // <Popover.Root finalFocus={null}> 阻止 final focus。
        >
          <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {group.label()}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const isItemActive =
                pathname === item.to || pathname.startsWith(`${item.to}/`)
              return (
                <Fragment key={item.to}>
                  <div className="relative">
                    <Link
                      to={item.to}
                      params={{ orgSlug, projectSlug }}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        isItemActive && "bg-accent font-medium text-accent-foreground",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.title()}</span>
                    </Link>
                    <FavoriteStarButton
                      routePath={item.to}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    />
                  </div>
                  {item.children?.map((child) => {
                    const isChildActive =
                      pathname === child.to ||
                      pathname.startsWith(`${child.to}/`)
                    return (
                      <div key={child.to} className="relative ml-6">
                        <Link
                          to={child.to}
                          params={{ orgSlug, projectSlug }}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1 pr-8 text-xs outline-none transition-colors text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            isChildActive && "bg-accent font-medium text-accent-foreground",
                          )}
                        >
                          <child.icon className="size-3.5 shrink-0" />
                          <span className="truncate">{child.title()}</span>
                        </Link>
                        <FavoriteStarButton
                          routePath={child.to}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2"
                        />
                      </div>
                    )
                  })}
                </Fragment>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  )
}

/**
 * Walk the nav tree and build a flat `routePath -> NavItem` map. Used
 * by the favorites group to resolve a stored routePath back into an
 * icon + title at render time, and by other places that need to look
 * up an item by its route. Stale routePaths (route was renamed or
 * removed) simply return `undefined` and the renderer skips them.
 */
function buildNavItemLookup(): Map<string, NavItem> {
  const map = new Map<string, NavItem>()
  for (const group of getNavGroups()) {
    for (const item of group.items) {
      map.set(item.to, item)
      if (item.children) {
        for (const child of item.children) {
          map.set(child.to, child)
        }
      }
    }
  }
  return map
}

/**
 * Favorites group rendered between Overview and Analytics. Returns
 * null when the user has no favorites (or while still loading) — the
 * group should never appear empty.
 *
 * Icon mode: rendered by `<NavFavoritesPopover>` (a stripped-down
 * variant of NavGroupPopover that consumes `useFavorites` directly
 * instead of a static group definition).
 */
function NavFavoritesGroup({ pathname }: { pathname: string }) {
  const { data: favorites } = useFavorites()
  const lookup = useMemo(buildNavItemLookup, [])
  const { orgSlug, projectSlug } = useTenantParams()

  // Resolve favorites to NavItem; silently skip stale routePaths.
  const resolved = (favorites ?? [])
    .map((f) => ({ favorite: f, item: lookup.get(f.routePath) }))
    .filter((r): r is { favorite: typeof r.favorite; item: NavItem } => !!r.item)

  if (resolved.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{m.nav_group_favorites()}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {resolved.map(({ item }) => {
            const isActive =
              pathname === item.to || pathname.startsWith(`${item.to}/`)
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  render={
                    <Link to={item.to} params={{ orgSlug, projectSlug }}>
                      <item.icon className="size-4" />
                      <span>{item.title()}</span>
                    </Link>
                  }
                  isActive={isActive}
                  tooltip={item.title()}
                />
                <FavoriteStarButton
                  routePath={item.to}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                />
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/**
 * Icon-mode variant of the favorites group — a single Star icon button
 * that opens a Popover listing the user's pinned routes. Mirrors the
 * UX of `NavGroupPopover` for the static groups.
 */
function NavFavoritesPopover({ pathname }: { pathname: string }) {
  const { data: favorites } = useFavorites()
  const lookup = useMemo(buildNavItemLookup, [])
  const [open, setOpen] = useState(false)
  const { orgSlug, projectSlug } = useTenantParams()

  const resolved = (favorites ?? [])
    .map((f) => ({ favorite: f, item: lookup.get(f.routePath) }))
    .filter((r): r is { favorite: typeof r.favorite; item: NavItem } => !!r.item)

  if (resolved.length === 0) return null

  const isActiveGroup = resolved.some(
    ({ item }) =>
      pathname === item.to || pathname.startsWith(`${item.to}/`),
  )

  return (
    <SidebarMenuItem>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <SidebarMenuButton
              isActive={isActiveGroup}
              tooltip={open ? undefined : m.nav_group_favorites()}
              aria-label={m.nav_group_favorites()}
            >
              <Star className="size-4" />
              <span>{m.nav_group_favorites()}</span>
            </SidebarMenuButton>
          }
        />
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-60 p-1"
          // TODO(base-ui): 同上 — base-ui Popover 无 onCloseAutoFocus。
        >
          <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {m.nav_group_favorites()}
          </div>
          <div className="flex flex-col gap-0.5">
            {resolved.map(({ item }) => {
              const isItemActive =
                pathname === item.to || pathname.startsWith(`${item.to}/`)
              const ItemIcon = item.icon
              return (
                <div key={item.to} className="relative">
                  <Link
                    to={item.to}
                    params={{ orgSlug, projectSlug }}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 pr-8 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                      isItemActive &&
                        "bg-accent font-medium text-accent-foreground",
                    )}
                  >
                    <ItemIcon className="size-4 shrink-0" />
                    <span className="truncate">{item.title()}</span>
                  </Link>
                  <FavoriteStarButton
                    routePath={item.to}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  />
                </div>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  )
}

/**
 * 自家版 UserButton —— 整个下拉用 base-ui (`#/components/ui/dropdown-menu`)
 * 实现,跟项目其他菜单保持同一套 primitive。
 *
 * 之所以不用 `@daveyplate/better-auth-ui` 的 `UserButton`:
 *   它内部用 `@radix-ui/react-dropdown-menu`,把项目里 base-ui 的
 *   `<DropdownMenuSub>` 当 `additionalLinks` 塞进去会出现 context 错配
 *   (`MenuRootContext is missing` → ErrorBoundary)。
 *
 * 顺序:
 *   • [Identity 头] (avatar + name + email) + separator
 *   • Theme   ▶  (Light / Dark / System)
 *   • Language ▶ (English / 中文)
 *   • separator
 *   • Settings → /settings/account
 *   • Sign Out → authClient.signOut() → /
 */
function UserMenuButton({ isIcon }: { isIcon: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // mounted 之前避免读 next-themes 的值,免 hydration mismatch
  const themeValue = mounted ? theme ?? "system" : "system"
  const currentLocale: Locale = mounted ? getLocale() : "en"

  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const user = session?.user
  // 平台管理员入口仅在 user.role === 'admin' 时出现。capabilities 已经
  // 被 AppSidebar 主体取过,这里复用同一个 query 的缓存(同 queryKey)。
  const orgId = session?.session.activeTeamId ?? null
  const { data: capabilities } = useCapabilities(orgId)
  const displayName = user?.name?.trim() || user?.email || ""
  const initials =
    (user?.name?.trim() || user?.email || "?")
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate({ to: "/" })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
              isIcon ? "size-8 justify-center p-0" : "px-2 py-1.5",
            )}
          >
            <Avatar size={isIcon ? "sm" : "default"}>
              {user?.image ? <AvatarImage src={user.image} alt={displayName} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            {!isIcon && (
              <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                <span className="truncate text-sm font-medium">
                  {user?.name?.trim() || user?.email || ""}
                </span>
                {user?.email && user?.name?.trim() ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                ) : null}
              </div>
            )}
          </button>
        }
      />
      <DropdownMenuContent
        side={isIcon ? "right" : "top"}
        align="start"
        className="min-w-[14rem]"
      >
        <div className="flex items-center gap-2 px-1.5 py-1">
          <Avatar size="sm">
            {user?.image ? <AvatarImage src={user.image} alt={displayName} /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">
              {user?.name?.trim() || user?.email || ""}
            </span>
            {user?.email ? (
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            ) : null}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="size-4" />
            <span>{m.user_menu_theme()}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[10rem]">
            <DropdownMenuRadioGroup value={themeValue} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="size-4" />
                <span>{m.user_menu_theme_light()}</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="size-4" />
                <span>{m.user_menu_theme_dark()}</span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="size-4" />
                <span>{m.user_menu_theme_system()}</span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Globe className="size-4" />
            <span>{m.user_menu_language()}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-[8rem]">
            <DropdownMenuRadioGroup
              value={currentLocale}
              onValueChange={(v) => setLocale(v as Locale)}
            >
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="zh">中文</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <Link to="/settings">
              <SettingsIcon className="size-4" />
              <span>{m.user_menu_settings()}</span>
            </Link>
          }
        />
        {capabilities?.isPlatformAdmin ? (
          <DropdownMenuItem
            render={
              <Link to="/admin/mau">
                <Shield className="size-4" />
                <span>{m.user_menu_platform_admin()}</span>
              </Link>
            }
          />
        ) : null}
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut className="size-4" />
          <span>{m.user_menu_sign_out()}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar() {
  const allGroups = getNavGroups()
  const { data: session } = authClient.useSession()
  const orgId = session?.session.activeTeamId ?? null
  const { data: capabilities } = useCapabilities(orgId)
  const groups = filterGroupsByCapabilities(allGroups, capabilities)
  const { pathname } = useLocation()
  // collapsed=icon 模式下,OrganizationSwitcher 显式切到 size="icon" 才会
  // 渲染圆形头像而不是带文字+chevron 的全宽按钮,否则会在 3rem 宽的 icon rail
  // 里溢出。自家 UserMenuButton 也按 isIcon 切到只显示头像那一支。
  // Mobile 走 Sheet,宽度还是 18rem,用展开态即可。
  const { state, isMobile } = useSidebar()
  const isIcon = state === "collapsed" && !isMobile
  const { setOpen: setCommandOpen } = useCommandPalette()
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                    <img src="/logo192.png" alt={m.nav_brand()} className="size-full object-contain" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                    <span className="font-semibold">{m.nav_brand()}</span>
                    <span className="text-xs text-muted-foreground">{m.nav_admin()}</span>
                  </div>
                </Link>
              }
              size="lg"
              tooltip={m.nav_brand()}
            />
          </SidebarMenuItem>
        </SidebarMenu>

        {/* 合并版 OrgProjectSwitcher —— 单 popover 同时承载组织+项目切换。
            参考 Linear:org+team 是绑定关系(切 org 必然 team 列表跟着变),
            用户心智更接近"workspace 切换"。切换不再 reload,走 router.navigate
            + queryClient.invalidate。 */}
        <SidebarMenu>
          <SidebarMenuItem>
            <OrgProjectSwitcher isIcon={isIcon} />
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

        <SidebarMenu>
          {/*
            Search 入口 —— 展开模式渲染 Linear/Vercel 风格的搜索条
            (Search... ⌘K),icon 模式只剩一颗放大镜 + tooltip。点击触发
            和 cmd+K 一样的全局命令面板。
          */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`${m.nav_search()} (${isMac ? "⌘K" : "Ctrl K"})`}
              onClick={() => setCommandOpen(true)}
            >
              <Search className="size-4" />
              <span className="text-muted-foreground">{m.nav_search()}</span>
              <kbd className="ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden md:inline-flex">
                {isMac ? "⌘" : "Ctrl"}
                <span>K</span>
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {isIcon ? (
          // icon 模式:每个分组聚合成一颗按钮 + Popover 二级菜单。
          // Overview 在最上,Favorites(若有)紧随其后,然后是其余分组。
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {groups.map((group, idx) => {
                  const isActiveGroup = group.items.some(
                    (item) =>
                      pathname === item.to || pathname.startsWith(`${item.to}/`),
                  )
                  return (
                    <Fragment key={group.key}>
                      <NavGroupPopover
                        group={group}
                        isActiveGroup={isActiveGroup}
                        pathname={pathname}
                      />
                      {idx === 0 && <NavFavoritesPopover pathname={pathname} />}
                    </Fragment>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          groups.map((group, idx) => {
            const isActiveGroup = group.items.some((item) =>
              pathname === item.to || pathname.startsWith(`${item.to}/`),
            )
            return (
              <Fragment key={group.key}>
                <NavGroupSection
                  group={group}
                  isActiveGroup={isActiveGroup}
                  pathname={pathname}
                />
                {idx === 0 && <NavFavoritesGroup pathname={pathname} />}
              </Fragment>
            )
          })
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {/*
            Settings / Theme / Language / Sign out 全部收口到自家
            UserMenuButton 的下拉菜单。Settings 跳到 /settings,进入后
            SettingsNav 提供二级跳转。
          */}
          <SidebarMenuItem>
            <div
              className={
                isIcon
                  ? "flex justify-center py-1"
                  : "min-w-0 overflow-hidden px-1 py-1 [&_button]:w-full"
              }
            >
              <UserMenuButton isIcon={isIcon} />
            </div>
          </SidebarMenuItem>
          {!isIcon && (
            <SidebarMenuItem>
              <VersionFooter />
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

function VersionFooter() {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: () =>
      fetch("/api/health")
        .then((r) => r.json())
        .catch(() => null) as Promise<{
          version: string
          deployedAt: string | null
        } | null>,
    staleTime: Infinity,
    retry: false,
  })

  const adminVer = `v${__APP_VERSION__}`
  const serverVer = data ? `v${data.version}` : null
  const mismatch = serverVer !== null && serverVer !== adminVer
  const serverDate = data?.deployedAt
    ? data.deployedAt.slice(0, 10)
    : null

  return (
    <div className="px-2 py-1 font-mono text-[10px] leading-tight">
      {!mismatch ? (
        <div className="flex items-center gap-1 text-muted-foreground/40">
          <span className="select-all">{adminVer}</span>
          {serverDate && (
            <span className="text-muted-foreground/25">· {serverDate}</span>
          )}
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-muted-foreground/40">
            <span className="text-muted-foreground/25">admin</span>
            <span className="select-all">{adminVer}</span>
          </div>
          <div className="flex items-center gap-1 text-amber-500/60">
            <span className="text-amber-500/40">server</span>
            <span className="select-all">{serverVer}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export { getNavGroups }
export type { NavGroup, NavItem }
