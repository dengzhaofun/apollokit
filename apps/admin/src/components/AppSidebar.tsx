import { OrganizationSwitcher, UserButton } from "@daveyplate/better-auth-ui"
import { Link, useLocation } from "@tanstack/react-router"
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
  Map as MapIcon,
  MessagesSquare,
  Search,
  Package,
  PartyPopper,
  PieChart,
  PiggyBank,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
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
import { cn } from "#/lib/utils"
import { useCommandPalette } from "./command-palette-context"
import { FavoriteStarButton } from "./FavoriteStarButton"
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
  label: NavMessage
  /** icon 模式下分组聚合到一颗按钮上,这里是该按钮的图标 */
  icon: LucideIcon
  items: NavItem[]
}

function getNavGroups(): NavGroup[] {
  return [
    {
      key: "overview",
      label: m.nav_group_overview,
      icon: LayoutDashboard,
      items: [
        { title: m.nav_dashboard, to: "/dashboard", icon: LayoutDashboard },
      ],
    },
    {
      // 数据分析组:分析"读"视角 — 数据大盘在 overview,深度分析(用户/模块/活动/日志)集中到这里
      // 事件管理(schema / 订阅健康 / 回放)是"治理"视角,放在 developer 组,不属于这里
      key: "analytics",
      label: m.nav_group_analytics,
      icon: PieChart,
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
      icon: Coins,
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
      icon: Megaphone,
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
      icon: BookOpen,
      items: [
        { title: m.nav_cms, to: "/cms", icon: ScrollText },
        { title: m.nav_media_library, to: "/media-library", icon: FolderOpen },
        { title: m.nav_character, to: "/character", icon: Drama },
        { title: m.nav_dialogue, to: "/dialogue", icon: MessagesSquare },
        { title: m.nav_collection, to: "/collection", icon: BookOpen },
        { title: m.nav_level, to: "/level", icon: MapIcon },
      ],
    },
    {
      key: "social",
      label: m.nav_group_social,
      icon: Trophy,
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
      icon: Wrench,
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
                <SidebarMenuSubItem
                  key={child.to}
                  className="group/menu-sub-item"
                >
                  <SidebarMenuSubButton asChild isActive={isChildActive}>
                    <Link to={child.to}>
                      <child.icon className="size-4" />
                      <span>{child.title()}</span>
                    </Link>
                  </SidebarMenuSubButton>
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
    </Collapsible>
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
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
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
                      <SidebarMenuAction asChild showOnHover>
                        <FavoriteStarButton
                          routePath={item.to}
                          className="data-[favorited=true]:opacity-100"
                        />
                      </SidebarMenuAction>
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
  const GroupIcon = group.icon
  return (
    <SidebarMenuItem>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <SidebarMenuButton
            isActive={isActiveGroup}
            tooltip={open ? undefined : group.label()}
            aria-label={group.label()}
          >
            <GroupIcon className="size-4" />
            <span>{group.label()}</span>
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-60 p-1"
          onCloseAutoFocus={(e) => e.preventDefault()}
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
                  asChild
                  isActive={isActive}
                  tooltip={item.title()}
                >
                  <Link to={item.to}>
                    <item.icon className="size-4" />
                    <span>{item.title()}</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuAction asChild>
                  <FavoriteStarButton routePath={item.to} />
                </SidebarMenuAction>
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
        <PopoverTrigger asChild>
          <SidebarMenuButton
            isActive={isActiveGroup}
            tooltip={open ? undefined : m.nav_group_favorites()}
            aria-label={m.nav_group_favorites()}
          >
            <Star className="size-4" />
            <span>{m.nav_group_favorites()}</span>
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-60 p-1"
          onCloseAutoFocus={(e) => e.preventDefault()}
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

export function AppSidebar() {
  const groups = getNavGroups()
  const { pathname } = useLocation()
  // collapsed=icon 模式下,Better Auth UI 的 OrganizationSwitcher / UserButton
  // 必须显式切到 size="icon" 才会渲染圆形头像而不是带文字+chevron 的全宽按钮,
  // 否则会在 3rem 宽的 icon rail 里溢出。Mobile 走 Sheet,宽度还是 18rem,
  // 用展开态即可。
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
            <SidebarMenuButton size="lg" asChild tooltip={m.nav_brand()}>
              <Link to="/">
                <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                  <img src="/logo192.png" alt={m.nav_brand()} className="size-full object-contain" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                  <span className="font-semibold">{m.nav_brand()}</span>
                  <span className="text-xs text-muted-foreground">{m.nav_admin()}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

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

        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />

        <div
          className={
            isIcon
              ? "flex justify-center py-1"
              : "px-2 py-1 [&_button]:w-full"
          }
        >
          <OrganizationSwitcher size={isIcon ? "icon" : undefined} />
        </div>
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
            <div
              className={
                isIcon
                  ? "flex justify-center py-1"
                  : "px-1 py-1 [&_button]:w-full"
              }
            >
              <UserButton size={isIcon ? "icon" : "lg"} />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export { getNavGroups }
export type { NavGroup, NavItem }
