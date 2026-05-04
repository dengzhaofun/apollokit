import { useNavigate } from "#/components/router-helpers"
import {
  ArrowRightIcon,
  ClockIcon,
  FolderKanbanIcon,
  KeyRoundIcon,
  MailPlusIcon,
  PaletteIcon,
  PlusIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "#/components/ui/command"
import { authClient } from "#/lib/auth-client"
import {
  invalidateTenantCache,
  listOrgsForUser,
  listTeamsForOrg,
  projectUrl,
  type ResolvedOrg,
  type ResolvedTeam,
} from "#/lib/tenant"
import { getNavGroups, type NavItem } from "./AppSidebar"
import { useCommandPalette } from "./command-palette-context"
import { FavoriteStarButton } from "./FavoriteStarButton"
import { getLocale, locales, setLocale } from "#/paraglide/runtime.js"
import * as m from "#/paraglide/messages.js"
import { pushRecentRoute, useRecentRoutes } from "#/hooks/use-recent-routes"

type Locale = (typeof locales)[number]

/**
 * Build a search-matchable token string for an item. Concatenates the
 * title in EVERY locale + the route path so users can find a route
 * regardless of which language the UI is currently set to.
 */
function buildSearchValue(item: NavItem, parentTitle?: NavItem): string {
  const titles = locales.flatMap((l) => {
    const own = item.title({}, { locale: l })
    if (!parentTitle) return [own]
    return [parentTitle.title({}, { locale: l }), own]
  })
  return [...titles, item.to].join(" ")
}

/**
 * 全局 cmd+k 命令面板。Linear 风格分组优先级:
 *   1. Recent          — 最近访问的路由(localStorage 持久)
 *   2. Switch project  — 当前组织下其他项目 + 切换组织(参考 Linear cmd+K)
 *   3. Actions         — 全局动作(邀请成员/创建 API Key/切换主题/语言)
 *   4. Navigate        — 现有 nav 路由按 group 渲染
 *
 * 整体改造从"导航跳转器"升级为"全局操作中心"。
 */
export function CommandPalette() {
  const { open, setOpen } = useCommandPalette()
  const navigate = useNavigate()
  const groups = getNavGroups()
  const recent = useRecentRoutes()
  const { theme, setTheme } = useTheme()

  const { data: session } = authClient.useSession()
  const activeOrgId = session?.session.activeOrganizationId ?? null
  const [orgs, setOrgs] = useState<ResolvedOrg[]>([])
  const [teams, setTeams] = useState<ResolvedTeam[]>([])

  useEffect(() => {
    if (!open) return
    listOrgsForUser().then(setOrgs)
  }, [open])

  useEffect(() => {
    if (!open || !activeOrgId) return
    listTeamsForOrg(activeOrgId).then(setTeams)
  }, [open, activeOrgId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  function go(to: string, title?: string) {
    setOpen(false)
    if (title) pushRecentRoute(to, title)
    navigate({ to: to as never })
  }

  function switchLocale(next: Locale) {
    setOpen(false)
    setLocale(next)
  }

  async function switchToProject(team: ResolvedTeam) {
    setOpen(false)
    if (team.id === session?.session.activeTeamId) return
    const activeOrg = orgs.find((o) => o.id === activeOrgId)
    if (!activeOrg) return
    await (
      authClient.organization as unknown as {
        setActiveTeam: (a: { teamId: string }) => Promise<unknown>
      }
    ).setActiveTeam({ teamId: team.id })
    await navigate({ to: projectUrl(activeOrg.slug, team.id) })
  }

  async function switchToOrganization(org: ResolvedOrg) {
    setOpen(false)
    if (org.id === activeOrgId) return
    await authClient.organization.setActive({ organizationId: org.id })
    invalidateTenantCache()
    const orgTeams = await listTeamsForOrg(org.id)
    const first = orgTeams[0]
    if (first) {
      await navigate({ to: projectUrl(org.slug, first.id) })
    } else {
      await navigate({ to: "/onboarding/create-project" })
    }
  }

  const currentLocale = getLocale()

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={m.command_palette_title()}
      description={m.command_palette_description()}
    >
      <CommandInput placeholder={m.command_palette_search_placeholder()} />
      <CommandList>
        <CommandEmpty>{m.command_palette_no_results()}</CommandEmpty>

        {recent.length > 0 ? (
          <>
            <CommandGroup heading="最近访问">
              {recent.slice(0, 5).map((r) => (
                <CommandItem
                  key={`recent:${r.path}`}
                  value={`recent ${r.title} ${r.path}`}
                  onSelect={() => go(r.path, r.title)}
                >
                  <ClockIcon className="size-4 text-muted-foreground" />
                  <span className="truncate">{r.title}</span>
                  <CommandShortcut className="text-[10px] text-muted-foreground/60">
                    {r.path}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        {teams.length > 1 || orgs.length > 1 ? (
          <>
            <CommandGroup heading="切换项目 / 组织">
              {teams
                .filter((t) => t.id !== session?.session.activeTeamId)
                .slice(0, 5)
                .map((t, idx) => (
                  <CommandItem
                    key={`team:${t.id}`}
                    value={`switch project ${t.name}`}
                    onSelect={() => switchToProject(t)}
                  >
                    <FolderKanbanIcon className="size-4" />
                    <span className="truncate">切换到项目 · {t.name}</span>
                    {idx < 9 ? (
                      <CommandShortcut>⌘{idx + 1}</CommandShortcut>
                    ) : null}
                  </CommandItem>
                ))}
              {orgs
                .filter((o) => o.id !== activeOrgId)
                .map((o) => (
                  <CommandItem
                    key={`org:${o.id}`}
                    value={`switch org ${o.name} ${o.slug}`}
                    onSelect={() => switchToOrganization(o)}
                  >
                    <ArrowRightIcon className="size-4" />
                    <span className="truncate">切换到组织 · {o.name}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}

        <CommandGroup heading="操作">
          <ActionItem
            icon={MailPlusIcon}
            label="邀请组织成员"
            shortcut="I"
            onSelect={() => go("/settings/organization/members", "组织成员")}
          />
          <ActionItem
            icon={UsersIcon}
            label="邀请项目成员"
            onSelect={() => go("/settings/project/members", "项目成员")}
          />
          <ActionItem
            icon={KeyRoundIcon}
            label="创建 API 密钥"
            onSelect={() => go("/settings/api-keys", "API 密钥")}
          />
          <ActionItem
            icon={PlusIcon}
            label="新建项目"
            onSelect={() => go("/onboarding/create-project", "新建项目")}
          />
          <ActionItem
            icon={ShieldCheckIcon}
            label="项目角色矩阵"
            onSelect={() => go("/settings/project/roles", "项目角色")}
          />
          <ActionItem
            icon={PaletteIcon}
            label={`切换主题 → ${theme === "dark" ? "浅色" : "深色"}`}
            onSelect={() => {
              setOpen(false)
              setTheme(theme === "dark" ? "light" : "dark")
            }}
          />
        </CommandGroup>

        <CommandSeparator />

        {groups.map((group) => (
          <CommandGroup key={group.key} heading={group.label()}>
            {group.items.flatMap((item) => {
              const Icon = item.icon
              const rows = [
                <CommandItem
                  key={`p:${item.to}`}
                  value={buildSearchValue(item)}
                  onSelect={() => go(item.to, item.title())}
                >
                  <Icon className="size-4" />
                  <span className="truncate">{item.title()}</span>
                  <CommandShortcut>
                    <FavoriteStarButton routePath={item.to} />
                  </CommandShortcut>
                </CommandItem>,
              ]
              if (item.children) {
                for (const child of item.children) {
                  const ChildIcon = child.icon
                  rows.push(
                    <CommandItem
                      key={`c:${child.to}`}
                      value={buildSearchValue(child, item)}
                      onSelect={() => go(child.to, child.title())}
                    >
                      <ChildIcon className="size-4" />
                      <span className="truncate">
                        <span className="text-muted-foreground">
                          {item.title()} ›{" "}
                        </span>
                        {child.title()}
                      </span>
                      <CommandShortcut>
                        <FavoriteStarButton routePath={child.to} />
                      </CommandShortcut>
                    </CommandItem>,
                  )
                }
              }
              return rows
            })}
          </CommandGroup>
        ))}

        <CommandSeparator />

        <CommandGroup heading={m.command_palette_misc()}>
          {locales.filter((l) => l !== currentLocale).map((l) => (
            <CommandItem
              key={`locale-${l}`}
              value={`switch language ${l}`}
              onSelect={() => switchLocale(l)}
            >
              <span>Switch language → {l.toUpperCase()}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function ActionItem({
  icon: Icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  shortcut?: string
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={`action ${label}`}
      onSelect={onSelect}
    >
      <Icon className="size-4 text-primary" />
      <span className="truncate">{label}</span>
      {shortcut ? <CommandShortcut>{shortcut}</CommandShortcut> : null}
    </CommandItem>
  )
}
